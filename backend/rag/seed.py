"""
Project EMERGENCE -- ChromaDB Seed Script
===========================================
Seeds the historical events collection with real geopolitical data.
Run this once before starting the debate simulation.

Usage:
    python -m rag.seed
"""

import json
import sys
import io
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Ensure imports work when run as module
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import HISTORICAL_DATA_DIR
from rag.embedder import get_vector_store


def load_seed_events() -> list[dict]:
    """Load historical events from the seed JSON file."""
    seed_file = HISTORICAL_DATA_DIR / "seed_events.json"
    if not seed_file.exists():
        print(f"[SEED] Seed file not found: {seed_file}")
        return []

    with open(seed_file, "r", encoding="utf-8") as f:
        events = json.load(f)

    print(f"[SEED] Loaded {len(events)} events from {seed_file.name}")
    return events


def seed_database():
    """Seed the ChromaDB historical events collection."""
    print("=" * 60)
    print("  PROJECT EMERGENCE -- Seeding Historical Database")
    print("=" * 60)

    events = load_seed_events()
    if not events:
        print("[SEED] No events to seed. Exiting.")
        return

    store = get_vector_store()
    stats_before = store.get_collection_stats()
    print(f"[SEED] Current DB: {stats_before['historical_events']} events")

    added = store.add_historical_events(events)
    stats_after = store.get_collection_stats()

    print(f"\n[SEED] Results:")
    print(f"  Events in seed file:   {len(events)}")
    print(f"  New events added:      {added}")
    print(f"  Already existed:       {len(events) - added}")
    print(f"  Total in DB now:       {stats_after['historical_events']}")
    print(f"  DB path:               {stats_after['persist_path']}")

    # Quick test query
    print("\n[SEED] Running test query: 'NATO expansion Russia Ukraine'")
    results = store.query_historical(
        query_text="NATO expansion Russia Ukraine",
        n_results=3,
    )

    if results["documents"][0]:
        for i, doc in enumerate(results["documents"][0]):
            meta = results["metadatas"][0][i]
            dist = results["distances"][0][i] if results.get("distances") and results["distances"][0] else "N/A"
            print(f"\n  [{i+1}] ({meta.get('year', '?')}) {meta.get('type', '?')} | dist={dist}")
            print(f"      {doc[:120]}...")
    else:
        print("  No results found.")

    print("\n[SEED] Database seeding complete!")
    print("=" * 60)


if __name__ == "__main__":
    seed_database()
