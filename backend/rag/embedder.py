"""
Project EMERGENCE -- ChromaDB Embedding Pipeline
==================================================
Sets up the ChromaDB vector store with Gemini-powered embeddings.
Handles document ingestion, embedding, and collection management.
"""

import os
import chromadb
from chromadb.utils import embedding_functions
from config import CHROMA_DB_PATH, EMBEDDING_MODEL


# -- Custom Gemini Embedding Function ---------------------------
class GeminiEmbeddingFunction:
    """
    Custom embedding function using Google's Gemini text-embedding model.
    Falls back to ChromaDB's default if API key is not set.
    """

    def __init__(self, api_key: str = "", model_name: str = "models/text-embedding-004"):
        self.api_key = api_key or GOOGLE_API_KEY
        self.model_name = model_name
        self._client = None

    def _get_client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    def __call__(self, input: list[str]) -> list[list[float]]:
        """Embed a list of texts using Gemini."""
        try:
            client = self._get_client()
            result = client.models.embed_content(
                model=self.model_name,
                contents=input,
            )
            return [e.values for e in result.embeddings]
        except Exception as e:
            print(f"[WARN] Gemini embedding failed: {e}")
            print("[WARN] Falling back to default ChromaDB embeddings")
            default_fn = embedding_functions.DefaultEmbeddingFunction()
            return default_fn(input)


# -- ChromaDB Manager ------------------------------------------
class VectorStore:
    """
    Manages ChromaDB collections for the RAG pipeline.

    Collections:
    - historical_events: Treaties, conflicts, alliances, and key geopolitical events
    - debate_memory: Previous debate statements and outcomes (episodic memory)
    """

    HISTORICAL_COLLECTION = "historical_events"
    DEBATE_MEMORY_COLLECTION = "debate_memory"

    def __init__(self, persist_path: str = None, use_gemini_embeddings: bool = False):
        self.persist_path = persist_path or CHROMA_DB_PATH
        self.client = chromadb.PersistentClient(path=self.persist_path)

        # Force local embeddings since the API limits are hit
        self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()
        print("[RAG] Using default (local MiniLM) embeddings")

        # Initialize collections
        self.historical = self.client.get_or_create_collection(
            name=self.HISTORICAL_COLLECTION,
            embedding_function=self.embedding_fn,
            metadata={
                "description": "Historical geopolitical events, treaties, and conflicts"}
        )

        self.debate_memory = self.client.get_or_create_collection(
            name=self.DEBATE_MEMORY_COLLECTION,
            embedding_function=self.embedding_fn,
            metadata={"description": "Episodic memory from past debate sessions"}
        )

    def add_historical_events(self, events: list[dict]) -> int:
        """
        Add historical events to the vector store.

        Each event dict should have:
        - id: unique identifier
        - text: full event description
        - metadata: {year, countries, type, tags}
        """
        if not events:
            return 0

        ids = [e["id"] for e in events]
        documents = [e["text"] for e in events]
        metadatas = [e.get("metadata", {}) for e in events]

        # Check for existing IDs to avoid duplicates
        existing = self.historical.get(ids=ids)
        existing_ids = set(existing["ids"]) if existing["ids"] else set()

        new_ids = []
        new_docs = []
        new_metas = []
        for i, eid in enumerate(ids):
            if eid not in existing_ids:
                new_ids.append(eid)
                new_docs.append(documents[i])
                new_metas.append(metadatas[i])

        if new_ids:
            self.historical.add(
                ids=new_ids,
                documents=new_docs,
                metadatas=new_metas,
            )

        return len(new_ids)

    # Map country codes to full names for semantic enrichment
    COUNTRY_NAMES = {
        "US": "United States America", "CN": "China",
        "RU": "Russia", "IR": "Iran",
        "IL": "Israel", "GB": "United Kingdom Britain",
        "FR": "France", "DE": "Germany",
        "IN": "India", "KP": "North Korea DPRK",
    }

    def query_historical(
        self,
        query_text: str,
        n_results: int = 5,
        country_filter: str = None,
        include_distances: bool = True,
    ) -> dict:
        """
        Query the historical events collection.

        Args:
            query_text: The search query
            n_results: Number of results to return
            country_filter: Optional country code to enrich the query
            include_distances: Whether to include similarity distances

        Returns:
            Dict with 'documents', 'metadatas', 'ids', and optionally 'distances'
        """
        # Enrich query with country name for better semantic matching
        enriched_query = query_text
        if country_filter:
            country_name = self.COUNTRY_NAMES.get(
                country_filter.upper(),
                country_filter
            )
            enriched_query = f"{country_name} {query_text}"

        include = ["documents", "metadatas"]
        if include_distances:
            include.append("distances")

        try:
            results = self.historical.query(
                query_texts=[enriched_query],
                n_results=min(n_results, self.historical.count() or 1),
                include=include,
            )
            return results
        except Exception as e:
            print(f"[RAG] Query error: {e}")
            return {"documents": [[]], "metadatas": [[]], "ids": [[]], "distances": [[]]}

    def add_debate_statement(
        self,
        statement_id: str,
        country_code: str,
        statement: str,
        headline: str,
        aggression: float,
        turn: int,
    ) -> None:
        """Store a debate statement in episodic memory."""
        self.debate_memory.add(
            ids=[statement_id],
            documents=[statement],
            metadatas=[{
                "country_code": country_code,
                "headline": headline,
                "aggression": str(aggression),
                "turn": str(turn),
            }],
        )

    def get_collection_stats(self) -> dict:
        """Get statistics about the vector store collections."""
        return {
            "historical_events": self.historical.count(),
            "debate_memory": self.debate_memory.count(),
            "persist_path": self.persist_path,
        }


# -- Singleton Instance -----------------------------------------
_store_instance: VectorStore | None = None


def get_vector_store() -> VectorStore:
    """Get or create the singleton VectorStore instance."""
    global _store_instance
    if _store_instance is None:
        _store_instance = VectorStore()
    return _store_instance
