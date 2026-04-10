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

# ── API Keys ──────────────────────────────────────────
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# ── Ollama (Local LLM) ────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3:latest")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "models/text-embedding-004")

# Ollama generation safety knobs (prevents "silent hangs" in UI)
LLM_REQUEST_TIMEOUT_S = float(os.getenv("LLM_REQUEST_TIMEOUT_S", "90"))
LLM_NUM_PREDICT = int(os.getenv("LLM_NUM_PREDICT", "256"))
# Ollama is a local server; too many concurrent requests can crash the runner on Windows.
# Default to 1 for lower RAM/VRAM usage.
OLLAMA_MAX_CONCURRENCY = int(os.getenv("OLLAMA_MAX_CONCURRENCY", "1"))
# Lower context reduces VRAM/RAM pressure and prevents runner crashes on small GPUs.
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "1024"))

# Default max tokens (lower = lower memory + faster). Used if supported by the client.
LLM_NUM_PREDICT = int(os.getenv("LLM_NUM_PREDICT", "128"))
# Deep /health?deep=1 can wait for cold model load; debate still uses LLM_REQUEST_TIMEOUT_S.
HEALTH_DEEP_GENERATE_TIMEOUT_S = float(os.getenv("HEALTH_DEEP_GENERATE_TIMEOUT_S", "120"))

# ── ChromaDB ───────────────────────────────────────────
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", str(BASE_DIR / "chroma_data"))

# ── Server ─────────────────────────────────────────────
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# ── Debate Parameters ─────────────────────────────────
MAX_DEBATE_TURNS = int(os.getenv("MAX_DEBATE_TURNS", "8"))
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
    # Check if Ollama is reachable
    try:
        import httpx
        resp = httpx.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5.0)
        if resp.status_code != 200:
            errors.append(f"Ollama API returned status {resp.status_code}. Is Ollama running?")
    except Exception as e:
        errors.append(f"Cannot reach Ollama at {OLLAMA_BASE_URL}: {e}")

    if errors:
        print("[!] Configuration Warnings:")
        for e in errors:
            print(f"    -> {e}")
    return len(errors) == 0
