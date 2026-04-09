"""
Project EMERGENCE -- Live News Fetcher ("The Pulse")
=====================================================
Fetches real geopolitical news headlines from GDELT and RSS feeds.
The Pulse provides the catalyst for each debate round.
"""

import httpx
import feedparser
import random
import asyncio
from datetime import datetime, timedelta
from config import RSS_FEEDS


# -- GDELT Doc API -------------------------------------------
GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"

# Geopolitical keywords to filter for relevant news
GEO_KEYWORDS = [
    "military", "sanctions", "nuclear", "missile", "invasion",
    "treaty", "alliance", "conflict", "diplomacy", "ceasefire",
    "war", "tensions", "NATO", "United Nations", "Security Council",
    "territorial", "sovereignty", "trade war", "embargo", "summit",
    "weapons", "defense", "geopolitical", "occupation", "annexation",
    "humanitarian", "protest", "coup", "election", "referendum",
]

# Countries we care about
COUNTRY_TERMS = [
    "United States", "China", "Russia", "Iran", "Israel",
    "United Kingdom", "France", "Germany", "India", "North Korea",
    "Ukraine", "Taiwan", "NATO", "European Union", "Middle East",
    "South China Sea", "Korean Peninsula", "Gaza", "Crimea",
]


async def fetch_gdelt_headlines(
    query: str = None,
    max_results: int = 10,
    timespan: str = "1d",
) -> list[dict]:
    """
    Fetch headlines from GDELT Doc API.

    Args:
        query: Search query (if None, uses geopolitical keywords)
        max_results: Maximum number of results
        timespan: Time range (e.g., "1d", "4h", "15min")

    Returns:
        List of headline dicts with title, url, source, date, summary
    """
    if query is None:
        # Build a query using random geopolitical keywords
        keywords = random.sample(GEO_KEYWORDS, min(3, len(GEO_KEYWORDS)))
        query = " OR ".join(keywords)

    params = {
        "query": query,
        "mode": "ArtList",
        "maxrecords": str(max_results),
        "timespan": timespan,
        "format": "json",
        "sort": "DateDesc",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(GDELT_DOC_API, params=params)
            response.raise_for_status()
            data = response.json()

        articles = data.get("articles", [])
        headlines = []
        for article in articles[:max_results]:
            headlines.append({
                "title": article.get("title", "").strip(),
                "url": article.get("url", ""),
                "source": article.get("domain", article.get("source", "GDELT")),
                "date": article.get("seendate", ""),
                "language": article.get("language", "English"),
                "source_country": article.get("sourcecountry", ""),
                "image": article.get("socialimage", ""),
            })

        return headlines

    except Exception as e:
        print(f"[NEWS] GDELT fetch failed: {e}")
        return []


async def fetch_rss_headlines(feed_name: str = None, max_results: int = 10) -> list[dict]:
    """
    Fetch headlines from RSS feeds.

    Args:
        feed_name: Specific feed to use (if None, picks randomly)
        max_results: Maximum number of results

    Returns:
        List of headline dicts
    """
    if feed_name and feed_name in RSS_FEEDS:
        feed_url = RSS_FEEDS[feed_name]
        source_name = feed_name
    else:
        # Pick a random feed
        source_name = random.choice(list(RSS_FEEDS.keys()))
        feed_url = RSS_FEEDS[source_name]

    try:
        # feedparser is synchronous, run in thread
        loop = asyncio.get_event_loop()
        feed = await loop.run_in_executor(None, feedparser.parse, feed_url)

        headlines = []
        for entry in feed.entries[:max_results]:
            # Extract summary, handling different RSS formats
            summary = ""
            if hasattr(entry, "summary"):
                summary = entry.summary
            elif hasattr(entry, "description"):
                summary = entry.description

            # Clean HTML from summary
            import re
            summary = re.sub(r'<[^>]+>', '', summary).strip()

            headlines.append({
                "title": entry.get("title", "").strip(),
                "url": entry.get("link", ""),
                "source": source_name.replace("_", " ").title(),
                "date": entry.get("published", ""),
                "summary": summary[:500],  # Truncate long summaries
            })

        return headlines

    except Exception as e:
        print(f"[NEWS] RSS fetch failed ({source_name}): {e}")
        return []


async def fetch_geopolitical_headline() -> dict | None:
    """
    Fetch a single, relevant geopolitical headline.

    Strategy:
    1. Try GDELT first (more structured, geopolitically focused)
    2. Fall back to RSS feeds if GDELT fails
    3. Filter for headlines mentioning our 10 countries

    Returns:
        A single headline dict, or None if all sources fail
    """
    # Try GDELT with country-specific queries
    country_query = random.choice(COUNTRY_TERMS)
    keyword = random.choice(GEO_KEYWORDS)
    query = f"{country_query} {keyword}"

    headlines = await fetch_gdelt_headlines(query=query, max_results=15, timespan="2d")

    if headlines:
        # Filter for non-empty titles and deduplicate
        valid = [h for h in headlines if h["title"] and len(h["title"]) > 20]
        if valid:
            chosen = random.choice(valid[:5])  # Pick from top 5
            print(f"[NEWS] GDELT headline: {chosen['title'][:80]}...")
            return chosen

    # Fallback to RSS
    print("[NEWS] GDELT returned no results, trying RSS...")
    headlines = await fetch_rss_headlines(max_results=15)

    if headlines:
        # Try to find geopolitically relevant headlines
        geo_relevant = []
        for h in headlines:
            title_lower = h["title"].lower()
            if any(term.lower() in title_lower for term in COUNTRY_TERMS + GEO_KEYWORDS):
                geo_relevant.append(h)

        if geo_relevant:
            chosen = random.choice(geo_relevant[:5])
        else:
            chosen = random.choice(headlines[:5])

        print(f"[NEWS] RSS headline: {chosen['title'][:80]}...")
        return chosen

    print("[NEWS] All sources failed to return headlines")
    return None


async def fetch_multiple_headlines(count: int = 5) -> list[dict]:
    """
    Fetch multiple headlines from various sources for variety.

    Returns:
        List of headline dicts from mixed sources
    """
    all_headlines = []

    # Fetch from GDELT with different queries
    gdelt_queries = random.sample(COUNTRY_TERMS, min(3, len(COUNTRY_TERMS)))
    for query in gdelt_queries:
        results = await fetch_gdelt_headlines(query=query, max_results=5, timespan="2d")
        all_headlines.extend(results)

    # Fetch from RSS
    for feed_name in RSS_FEEDS:
        results = await fetch_rss_headlines(feed_name=feed_name, max_results=5)
        all_headlines.extend(results)

    # Deduplicate by title
    seen_titles = set()
    unique = []
    for h in all_headlines:
        title = h["title"].strip().lower()
        if title and title not in seen_titles and len(title) > 20:
            seen_titles.add(title)
            unique.append(h)

    # Return requested count, randomized from available
    random.shuffle(unique)
    return unique[:count]
