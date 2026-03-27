# MyNurseAPI

Standalone FastAPI service for the NurseBot RAG + conversation logic.

## Structure
```
MyNurseAPI/
+-- app/            # FastAPI application (copied from NurseBot)
+-- data/           # Knowledge base + vectorstore (can be rebuilt)
+-- patient_data/   # Sample exports
+-- requirements.txt
+-- .env.example
```

## Quick start
```bash
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
cp .env.example .env   # add your keys
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health check: http://localhost:8000/health
API base: /api/v1/...

## Deploy on Vercel (API only)
1. In Vercel, create a **new project** from this same GitHub repo.
2. Set **Root Directory** to `MyNurseAPI`.
3. Keep framework as **Other** (Python runtime will be used via `vercel.json`).
4. Add required environment variables from `.env.example` (at minimum `OPENAI_API_KEY`).
5. Deploy.

After deploy, use this in website env:
`NEXT_PUBLIC_NURSE_API_BASE=https://<your-api-project>.vercel.app/api/v1`

Health check URL:
`https://<your-api-project>.vercel.app/api/v1/health`
