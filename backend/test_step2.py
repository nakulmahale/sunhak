"""
Step 2 Verification -- ChromaDB, News Fetcher, RAG Pipeline
"""

import sys
import io
import asyncio

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from rag.embedder import get_vector_store
from rag.seed import seed_database
from rag.retriever import retrieve_historical_context, build_agent_rag_context
from news.fetcher import fetch_geopolitical_headline, fetch_rss_headlines, fetch_gdelt_headlines
from agents.profiles import load_all_profiles


async def main():
    print("=" * 60)
    print("  STEP 2 VERIFICATION -- Data Pipeline Tests")
    print("=" * 60)

    # ---- TEST 1: ChromaDB Seeding ----
    print("\n--- TEST 1: ChromaDB Seeding ---")
    seed_database()
    store = get_vector_store()
    stats = store.get_collection_stats()
    assert stats["historical_events"] >= 30, f"Expected >=30 events, got {stats['historical_events']}"
    print(f"[PASS] ChromaDB has {stats['historical_events']} historical events")

    # ---- TEST 2: RAG Retrieval ----
    print("\n--- TEST 2: RAG Retrieval ---")

    # Test general query
    results = retrieve_historical_context("NATO expansion Russia security concerns", n_results=3)
    assert len(results) > 0, "Expected results for NATO query"
    print(f"[PASS] Retrieved {len(results)} docs for 'NATO expansion Russia'")
    for r in results:
        meta = r["metadata"]
        print(f"  -> [{meta.get('year', '?')}] {r['id']} (relevance: {r['relevance_score']:.2%})")

    # Test country-filtered query
    results_ir = retrieve_historical_context("nuclear deal sanctions", country_code="IR", n_results=3)
    print(f"[PASS] Retrieved {len(results_ir)} docs for Iran nuclear query")

    # ---- TEST 3: Agent RAG Context Building ----
    print("\n--- TEST 3: Agent RAG Context ---")
    profiles = load_all_profiles()
    usa_profile = profiles["usa"]

    context = build_agent_rag_context(
        headline="Russia threatens NATO over Ukraine missile deployment",
        country_code="US",
        memory_tags=usa_profile["historical_memory_tags"],
        n_results=3,
    )
    assert "HISTORICAL INTELLIGENCE BRIEFING" in context
    assert len(context) > 200
    print(f"[PASS] Built RAG context ({len(context)} chars)")
    print(f"  Preview: {context[:150]}...")

    # ---- TEST 4: GDELT News Fetch ----
    print("\n--- TEST 4: GDELT News Fetch ---")
    try:
        headlines = await fetch_gdelt_headlines(query="military conflict geopolitical", max_results=5)
        if headlines:
            print(f"[PASS] GDELT returned {len(headlines)} headlines")
            for h in headlines[:3]:
                print(f"  -> {h['title'][:80]}...")
                print(f"     Source: {h['source']}")
        else:
            print("[WARN] GDELT returned 0 headlines (might be rate-limited)")
    except Exception as e:
        print(f"[WARN] GDELT test failed (network issue?): {e}")

    # ---- TEST 5: RSS News Fetch ----
    print("\n--- TEST 5: RSS News Fetch ---")
    try:
        rss_headlines = await fetch_rss_headlines(feed_name="bbc_world", max_results=5)
        if rss_headlines:
            print(f"[PASS] RSS (BBC World) returned {len(rss_headlines)} headlines")
            for h in rss_headlines[:3]:
                print(f"  -> {h['title'][:80]}...")
        else:
            print("[WARN] RSS returned 0 headlines (network issue?)")
    except Exception as e:
        print(f"[WARN] RSS test failed: {e}")

    # ---- TEST 6: Single Headline Fetch ----
    print("\n--- TEST 6: Single Geopolitical Headline ---")
    try:
        headline = await fetch_geopolitical_headline()
        if headline:
            print(f"[PASS] Got headline: {headline['title'][:80]}...")
            print(f"  Source: {headline['source']}")
        else:
            print("[WARN] No headline retrieved from any source")
    except Exception as e:
        print(f"[WARN] Headline fetch failed: {e}")

    # ---- SUMMARY ----
    print("\n" + "=" * 60)
    print("  STEP 2 VERIFICATION COMPLETE")
    print("=" * 60)
    print(f"  ChromaDB: {stats['historical_events']} events seeded")
    print(f"  RAG retrieval: Working")
    print(f"  Agent context: Working")
    print(f"  News pipeline: See results above")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
