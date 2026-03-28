"use client";

import { motion } from "framer-motion";
import { Globe, Mail } from "lucide-react";

const team = [
  {
    name: "Prabhav Kumar",
    role: "C & Lead Engineer",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Prabhav&backgroundColor=b6e3f4",
  },
  {
    name: "Shivam Kumar",
    role: "Co-Founder & Researcher",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Shivam&backgroundColor=c0aede",
  },
  {
    name: "Diwakar",
    role: "Co-Founder & Clinical Specialist",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Diwakar&backgroundColor=ffdfbf",
  }
];

export default function Team() {
  return (
    <section id="team" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Our Top Skilled Experts</h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-16">
          Meet the minds bridging the gap between cutting-edge AI research and clinical practice.
        </p>

        <div className="flex flex-wrap justify-center gap-12">
          {team.map((member, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1, duration: 0.5 }}
              className="flex flex-col items-center group w-64"
            >
              <div className="relative w-40 h-40 mb-6 rounded-full p-2 bg-gradient-to-tr from-primary to-blue-500 group-hover:scale-105 transition-transform duration-300">
                <div className="w-full h-full bg-background rounded-full overflow-hidden border-4 border-background">
                  <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-1">{member.name}</h3>
              <p className="text-primary font-medium mb-4">{member.role}</p>
              
              <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <a href="#" className="p-2 bg-muted rounded-full hover:bg-primary/20 hover:text-primary transition-colors">
                  <Globe className="w-4 h-4" />
                </a>
                <a href="#" className="p-2 bg-muted rounded-full hover:bg-primary/20 hover:text-primary transition-colors">
                  <Mail className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
