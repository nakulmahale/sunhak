"""
Project EMERGENCE — Centralized Configuration
Loads environment variables with sensible defaults.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(override=True)

# ── Paths ──────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
AGENTS_DNA_DIR = BASE_DIR / "agents" / "country_dna"
HISTORICAL_DATA_DIR = BASE_DIR / "rag" / "historical_data"

# ── Groq API ──────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/text-embedding-004")

# ── ChromaDB ───────────────────────────────────────────
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", str(BASE_DIR / "chroma_data"))

# ── Server ─────────────────────────────────────────────
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# ── Debate Parameters ─────────────────────────────────
MAX_DEBATE_TURNS = int(os.getenv("MAX_DEBATE_TURNS", "30"))
AGGRESSION_DEADLOCK_THRESHOLD = float(os.getenv("AGGRESSION_DEADLOCK_THRESHOLD", "0.9"))
CONSENSUS_THRESHOLD = float(os.getenv("CONSENSUS_THRESHOLD", "0.3"))

# ── Country Agents ─────────────────────────────────────
COUNTRY_CODES = [
    "usa", "china", "russia", "iran", "israel",
    "uk", "france", "germany", "india", "north_korea"
]

# ── News Sources ───────────────────────────────────────
RSS_FEEDS = {
    "bbc_world": "http://feeds.bbci.co.uk/news/world/rss.xml",
    "reuters_world": "https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best",
    "aljazeera": "https://www.aljazeera.com/xml/rss/all.xml",
}

# ── Validation ─────────────────────────────────────────
def validate_config():
    """Validate critical configuration values."""
    errors = []
    if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
        errors.append("GROQ_API_KEY is not set. Get one at https://console.groq.com/")
    if errors:
        print("[!] Configuration Warnings:")
        for e in errors:
            print(f"    -> {e}")
    return len(errors) == 0
