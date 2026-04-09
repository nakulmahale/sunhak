# Project EMERGENCE

## Geopolitical Debate Sandbox — Multi-Agent, Real-Time, Emergent Simulation

A multi-agent AI simulation where 10 country agents debate live geopolitical headlines in real-time, powered by LangGraph cyclic orchestration, Google Gemini LLMs, ChromaDB RAG, and a premium "Global War Room" UI.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                    │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐  │
│  │ Debate  │ │  Agent   │ │ Monologue │ │  Stress   │  │
│  │  Feed   │ │  Arena   │ │  Stream   │ │   Dial    │  │
│  └────┬────┘ └────┬─────┘ └─────┬─────┘ └─────┬─────┘  │
│       └────────────┴─────────────┴─────────────┘        │
│                        WebSocket                         │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                   BACKEND (FastAPI)                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │              LangGraph Cyclic Engine              │   │
│  │  ┌─────────┐  ┌───────────┐  ┌────────────────┐  │   │
│  │  │  Pulse  │→ │ Relevance │→ │ Agent Speaks   │  │   │
│  │  │ (News)  │  │  Engine   │  │ (Gemini LLM)   │──┤   │
│  │  └─────────┘  └───────────┘  └────────────────┘  │   │
│  │       ↑                              │            │   │
│  │       └──────────────────────────────┘ (CYCLE)    │   │
│  │                  ┌──────────┐                     │   │
│  │                  │  Critic  │  (Halts cycle)      │   │
│  │                  └──────────┘                     │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────┐  ┌──────────────┐                         │
│  │ ChromaDB │  │  GDELT/RSS   │                         │
│  │  (RAG)   │  │  News Feed   │                         │
│  └──────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────┘
```

## The 10 Country Agents

| Agent | Archetype | Aggression | Key Traits |
|-------|-----------|------------|------------|
| 🇺🇸 USA | The Global Hegemon | 0.45 | NATO, sanctions, rules-based order |
| 🇨🇳 China | The Rising Dragon | 0.40 | Win-win, Belt & Road, Taiwan |
| 🇷🇺 Russia | The Resurgent Bear | 0.60 | Multipolarity, energy leverage |
| 🇮🇷 Iran | The Revolutionary Theocracy | 0.55 | Resistance axis, nuclear ambiguity |
| 🇮🇱 Israel | The Embattled Fortress | 0.55 | Security-first, Begin Doctrine |
| 🇬🇧 UK | The Post-Imperial Pragmatist | 0.35 | Five Eyes, Global Britain |
| 🇫🇷 France | The Strategic Autonomist | 0.35 | European sovereignty, Françafrique |
| 🇩🇪 Germany | The Reluctant Power | 0.20 | Zeitenwende, consensus-seeking |
| 🇮🇳 India | The Strategic Swing State | 0.35 | Multi-alignment, Global South |
| 🇰🇵 North Korea | The Rogue Wildcard | 0.75 | Madman theory, regime survival |

## Quick Start

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
cp .env.example .env   # Edit with your GOOGLE_API_KEY
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | ✅ | Google AI Studio API key |
| `GEMINI_MODEL` | ❌ | LLM model (default: `gemini-2.0-flash`) |
| `CHROMA_DB_PATH` | ❌ | ChromaDB storage path (default: `./chroma_data`) |

## Tech Stack
- **Frontend:** Next.js 15, Tailwind CSS, Framer Motion, Recharts, Socket.io
- **Backend:** Python, FastAPI, LangGraph, Google Gemini, ChromaDB
- **Data:** GDELT API, RSS Feeds (BBC, Reuters, Al Jazeera)

## License
MIT
