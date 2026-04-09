"""
Project EMERGENCE -- RAG Retriever
====================================
Provides the query interface for agents to retrieve historical context
from ChromaDB. This is Layer 2 (Historical RAG) of the Tri-Layer Memory.
"""

from rag.embedder import get_vector_store


def retrieve_historical_context(
    query: str,
    country_code: str = None,
    n_results: int = 3,
) -> list[dict]:
    """
    Retrieve relevant historical documents for an agent's context.

    This is the core RAG function that agents call to cite historical
    precedent in their arguments.

    Args:
        query: The search query (e.g., the current headline + topic)
        country_code: Optional country filter (e.g., "US", "CN")
        n_results: Number of results to return

    Returns:
        List of dicts with 'text', 'metadata', 'relevance_score'
    """
    store = get_vector_store()
    results = store.query_historical(
        query_text=query,
        n_results=n_results,
        country_filter=country_code,
    )

    documents = []
    if results["documents"] and results["documents"][0]:
        for i, doc in enumerate(results["documents"][0]):
            metadata = results["metadatas"][0][i] if results["metadatas"][0] else {}
            distance = results["distances"][0][i] if results.get("distances") and results["distances"][0] else 0.0

            # Convert distance to relevance score (lower distance = higher relevance)
            relevance = max(0.0, 1.0 - (distance / 2.0))

            documents.append({
                "text": doc,
                "metadata": metadata,
                "id": results["ids"][0][i] if results["ids"][0] else f"doc_{i}",
                "relevance_score": round(relevance, 4),
            })

    return documents


def build_agent_rag_context(
    headline: str,
    country_code: str,
    memory_tags: list[str],
    n_results: int = 3,
) -> str:
    """
    Build a full RAG context string for an agent's prompt.

    Combines headline-based retrieval with memory-tag-based retrieval
    to give the agent the most relevant historical context.

    Args:
        headline: The current news headline being debated
        country_code: Agent's country code
        memory_tags: Agent's historical_memory_tags from DNA profile
        n_results: Number of documents per query

    Returns:
        Formatted string of historical context for the agent's prompt
    """
    all_docs = []
    seen_ids = set()

    # Query 1: Headline-based retrieval
    headline_docs = retrieve_historical_context(
        query=headline,
        n_results=n_results,
    )
    for doc in headline_docs:
        if doc["id"] not in seen_ids:
            all_docs.append(doc)
            seen_ids.add(doc["id"])

    # Query 2: Country-specific retrieval
    country_docs = retrieve_historical_context(
        query=headline,
        country_code=country_code,
        n_results=n_results,
    )
    for doc in country_docs:
        if doc["id"] not in seen_ids:
            all_docs.append(doc)
            seen_ids.add(doc["id"])

    # Query 3: Memory-tag-based retrieval (sample up to 3 tags)
    import random
    sampled_tags = random.sample(memory_tags, min(3, len(memory_tags)))
    for tag in sampled_tags:
        tag_query = tag.replace("_", " ")
        tag_docs = retrieve_historical_context(
            query=f"{tag_query} {headline}",
            n_results=2,
        )
        for doc in tag_docs:
            if doc["id"] not in seen_ids:
                all_docs.append(doc)
                seen_ids.add(doc["id"])

    # Sort by relevance score
    all_docs.sort(key=lambda d: d["relevance_score"], reverse=True)

    # Take top results
    top_docs = all_docs[:5]

    if not top_docs:
        return "No historical context available for this topic."

    # Format as context string
    context_parts = [
        "--- HISTORICAL INTELLIGENCE BRIEFING ---",
        f"Classification: TOP SECRET // SI // NOFORN",
        f"Subject: Historical precedents relevant to current headline",
        f"Headline: {headline}",
        "",
    ]

    for i, doc in enumerate(top_docs, 1):
        meta = doc["metadata"]
        year = meta.get("year", "Unknown")
        event_type = meta.get("type", "event")
        tags = meta.get("tags", "")
        relevance = doc["relevance_score"]

        context_parts.append(f"[Document {i}] ({year} | {event_type} | Relevance: {relevance:.0%})")
        context_parts.append(doc["text"])
        if tags:
            context_parts.append(f"Tags: {tags}")
        context_parts.append("")

    context_parts.append("--- END BRIEFING ---")
    context_parts.append("INSTRUCTION: Reference these historical events in your arguments when relevant.")
    context_parts.append("Cite specific events, treaties, or precedents to strengthen your position.")

    return "\n".join(context_parts)


def format_citations_for_ui(docs: list[dict]) -> list[str]:
    """
    Format retrieved documents as citation strings for the frontend UI.

    Returns:
        List of citation strings for the Source Tracer component
    """
    citations = []
    for doc in docs:
        meta = doc.get("metadata", {})
        year = meta.get("year", "")
        event_type = meta.get("type", "")
        event_id = doc.get("id", "unknown")

        # Create a readable citation
        citation = f"[{year}] {event_id.replace('_', ' ').title()}"
        if event_type:
            citation += f" ({event_type})"
        citation += f" | Relevance: {doc.get('relevance_score', 0):.0%}"
        citations.append(citation)

    return citations
