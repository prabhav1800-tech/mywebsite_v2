"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Msg = { from: "bot" | "user"; text: string };

type ReportPayload = {
  generated_at?: string;
  summary?: {
    summary_text?: string;
    chief_complaint?: string | null;
    duration?: string | null;
  };
  analysis?: {
    risk_level?: string;
    key_findings?: string[];
    recommended_actions?: string[];
    red_flags?: string[];
  };
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const ENV_API_BASE = process.env.NEXT_PUBLIC_NURSE_API_BASE;

function getApiCandidates() {
  const candidates = [ENV_API_BASE].filter((v): v is string => Boolean(v));

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocalHost = host === "localhost" || host === "127.0.0.1";

    if (isLocalHost) {
      candidates.push("http://127.0.0.1:8000/api/v1", "http://127.0.0.1:8001/api/v1");
    }

    if (host === "zeptai.com" || host.endsWith(".zeptai.com")) {
      candidates.push("https://api.zeptai.com/api/v1");
    }
  }

  return Array.from(new Set(candidates)).map((base) => base.replace(/\/$/, ""));
}

async function resolveApiBase() {
  const candidates = getApiCandidates();

  for (const base of candidates) {
    try {
      const health = await fetch(`${base}/health`, { method: "GET" });
      if (health.ok) {
        return base;
      }
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(
    "Unable to connect to MyNurseAPI. Start backend: cd MyNurseAPI && uvicorn app.main:app --host 0.0.0.0 --port 8000",
  );
}

async function parseJsonOrThrow(r: Response) {
  const raw = await r.text();
  let data: unknown = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // Keep raw for error surface.
  }

  if (!r.ok) {
    const msgFromJson =
      data && typeof data === "object" && "detail" in data
        ? String((data as Record<string, unknown>).detail)
        : raw || `HTTP ${r.status}`;
    throw new Error(msgFromJson);
  }

  return data as Record<string, unknown>;
}

function stripQuestionIds(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^q\d+\s*$/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mergeBotText(responseText: string, nextQuestionText: string) {
  const cleanResponse = stripQuestionIds(responseText || "");
  const cleanNext = stripQuestionIds(nextQuestionText || "");

  if (!cleanNext) return cleanResponse;
  if (!cleanResponse) return cleanNext;
  if (cleanResponse === cleanNext) return cleanResponse;

  return `${cleanResponse}\n\n${cleanNext}`;
}

function getRecognitionCtor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export default function NurseChat() {
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [reportOnly, setReportOnly] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (reportOnly) {
      setError("Voice input is disabled in report view.");
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition is not supported in this browser. Use Chrome or Edge.");
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const results = event?.results;
      if (!results || !results.length) return;

      let transcript = "";
      for (let i = 0; i < results.length; i += 1) {
        const segment = results[i]?.[0]?.transcript;
        if (segment) {
          transcript += segment;
        }
      }

      if (transcript.trim()) {
        setInput(transcript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      const reason = event?.error ? String(event.error) : "unknown_error";
      setError(`Voice input error: ${reason}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setError(null);
    setIsListening(true);
    recognition.start();
  }, [reportOnly]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }

    startListening();
  }, [isListening, startListening, stopListening]);

  const startConversation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const base = await resolveApiBase();
      setApiBase(base);

      const r = await fetch(`${base}/chat/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "en", voice_mode: false }),
      });

      const data = await parseJsonOrThrow(r);
      const cid = String(data.conversation_id ?? "");

      if (!cid) {
        throw new Error("Missing conversation_id in /chat/start response");
      }

      const greeting = stripQuestionIds(String(data.greeting ?? "Hello! How can I help today?"));

      setConversationId(cid);
      setMessages([{ from: "bot", text: greeting }]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void startConversation();

    return () => {
      stopListening();
    };
  }, [startConversation, stopListening]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("nursechat-listening-state", {
        detail: { listening: isListening },
      }),
    );
  }, [isListening]);

  useEffect(() => {
    const onToggleListening = () => {
      toggleListening();
    };

    window.addEventListener("nursechat-toggle-listening", onToggleListening);
    return () => {
      window.removeEventListener("nursechat-toggle-listening", onToggleListening);
    };
  }, [toggleListening]);

  const statusText = useMemo(() => {
    if (loading) return "Connecting...";
    if (conversationId) return `Conversation: ${conversationId.slice(0, 8)}...`;
    return "Not connected";
  }, [loading, conversationId]);

  async function send() {
    if (!input.trim()) return;
    if (!conversationId || !apiBase) {
      setError("Conversation is not initialized yet. Please wait or refresh.");
      return;
    }

    const userText = input.trim();
    setMessages((m) => [...m, { from: "user", text: userText }]);
    setInput("");

    try {
      setLoading(true);
      setError(null);

      const r = await fetch(`${apiBase}/chat/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-conversation-id": conversationId,
        },
        body: JSON.stringify({ conversation_id: conversationId, message: userText }),
      });

      const data = await parseJsonOrThrow(r);
      const reply = String(data.response ?? "I could not generate a response.");
      const nextQuestion =
        data.next_question && typeof data.next_question === "string"
          ? data.next_question.trim()
          : "";

      const combined = mergeBotText(reply, nextQuestion);

      setMessages((m) => [
        ...m,
        { from: "bot", text: combined || "I could not generate a response." },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }

  async function generateReport() {
    if (!conversationId || !apiBase) {
      setError("Start a conversation first to generate report.");
      return;
    }

    try {
      setReportLoading(true);
      setError(null);

      const r = await fetch(`${apiBase}/report/full/${conversationId}`, {
        method: "GET",
      });

      const data = await parseJsonOrThrow(r);
      setReport(data as ReportPayload);
      setMessages([]);
      setInput("");
      setReportOnly(true);
      stopListening();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setReportLoading(false);
    }
  }

  function startNewConversation() {
    setMessages([]);
    setConversationId(null);
    setReport(null);
    setReportOnly(false);
    setInput("");
    setError(null);
    stopListening();
    void startConversation();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <div>{statusText}</div>
        {apiBase && <div>API: {apiBase}</div>}
      </div>

      <div className="flex-1 overflow-y-auto bg-background p-4">
        {reportOnly && report ? (
          <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-foreground">
            <div className="font-semibold">Generated Report</div>
            {report.generated_at && (
              <div className="text-xs text-muted-foreground">
                Generated: {new Date(report.generated_at).toLocaleString()}
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Chief Complaint</div>
              <div>{report.summary?.chief_complaint || "Not available"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Summary</div>
              <div>{report.summary?.summary_text || "Not available"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Risk Level</div>
              <div>{report.analysis?.risk_level || "Not available"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Key Findings</div>
              <ul className="list-disc pl-5">
                {(report.analysis?.key_findings || []).length > 0 ? (
                  report.analysis?.key_findings?.map((item, idx) => <li key={idx}>{item}</li>)
                ) : (
                  <li>Not available</li>
                )}
              </ul>
            </div>
            <button
              onClick={startNewConversation}
              className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80"
            >
              New Conversation
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 ${
                  m.from === "bot"
                    ? "bg-muted text-foreground"
                    : "ml-auto bg-primary text-white"
                }`}
              >
                {m.text}
              </div>
            ))}

            {loading && <div className="text-xs text-muted-foreground">Thinking...</div>}
            {error && <div className="text-xs text-red-500">Error: {error}</div>}
          </div>
        )}
      </div>

      {!reportOnly && (
        <div className="border-t border-border p-3">
          <div className="mb-2 flex gap-2">
            <button
              onClick={generateReport}
              disabled={reportLoading || !conversationId || loading}
              className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 disabled:opacity-50"
            >
              {reportLoading ? "Generating report..." : "Generate Report"}
            </button>
            <button
              onClick={startNewConversation}
              disabled={loading}
              className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 disabled:opacity-50"
            >
              New Conversation
            </button>
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void send()}
              placeholder={isListening ? "Listening..." : "Describe your symptoms..."}
              className="flex-1 rounded-xl border border-border bg-muted px-3 py-2 outline-none"
            />
            <button
              onClick={() => void send()}
              disabled={loading || !conversationId}
              className="rounded-xl bg-primary px-4 py-2 font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



