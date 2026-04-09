"""
Project EMERGENCE -- FastAPI Application Entry Point
Provides REST endpoints, WebSocket streaming, and health checks.
"""

import json
import sys
import io
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import (
    FRONTEND_URL, HOST, PORT, validate_config, COUNTRY_CODES
)
from agents.profiles import load_all_profiles
from rag.embedder import get_vector_store
from rag.seed import seed_database
from news.fetcher import fetch_geopolitical_headline, fetch_multiple_headlines
from graph.orchestrator import get_debate_graph
from blackboard.state import create_initial_state

# Fix Windows console encoding removed because it breaks uvicorn


# -- Connection Manager -----------------------------------------
class ConnectionManager:
    """Manages active WebSocket connections for broadcasting debate events."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[+] Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"[-] Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Send a JSON message to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)


manager = ConnectionManager()


# -- App Lifecycle ----------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    print("\n" + "=" * 60)
    print("  PROJECT EMERGENCE -- Geopolitical Debate Sandbox")
    print("=" * 60)

    config_valid = validate_config()
    if not config_valid:
        print("\n[!] Server starting with configuration warnings.")
        print("    Some features may not work until config is fixed.\n")

    # Load agent profiles on startup
    profiles = load_all_profiles()
    app.state.agent_profiles = profiles
    print(f"[OK] Loaded {len(profiles)} country agent profiles")

    for code, profile in profiles.items():
        flag = profile.get("flag_emoji", "")
        name = profile.get("country_name", code)
        print(f"   {flag}  {name} ({code.upper()})")

    # Initialize ChromaDB and seed if needed
    try:
        store = get_vector_store()
        stats = store.get_collection_stats()
        app.state.vector_store = store
        print(f"[OK] ChromaDB connected: {stats['historical_events']} historical events")
        if stats['historical_events'] == 0:
            print("[>>] No historical data found. Seeding database...")
            seed_database()
            stats = store.get_collection_stats()
            print(f"[OK] ChromaDB seeded: {stats['historical_events']} events")
    except Exception as e:
        print(f"[WARN] ChromaDB init failed: {e}")
        print("       RAG features will be unavailable.")

    print(f"\n[>>] Server ready at http://{HOST}:{PORT}")
    print(f"[WS] WebSocket endpoint: ws://{HOST}:{PORT}/ws/debate")
    print("=" * 60 + "\n")

    yield  # App is running

    print("\n[STOP] Shutting down Project EMERGENCE...")


# -- FastAPI App ------------------------------------------------
app = FastAPI(
    title="Project EMERGENCE",
    description="Geopolitical Debate Sandbox -- Multi-Agent Real-Time Simulation",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -- REST Endpoints ---------------------------------------------
@app.get("/")
async def root():
    return {
        "project": "EMERGENCE",
        "status": "operational",
        "description": "Geopolitical Debate Sandbox API",
    }


@app.get("/health")
async def health_check():
    store = getattr(app.state, "vector_store", None)
    rag_stats = store.get_collection_stats() if store else {"historical_events": 0, "debate_memory": 0}
    return {
        "status": "healthy",
        "agents_loaded": len(getattr(app.state, "agent_profiles", {})),
        "websocket_clients": len(manager.active_connections),
        "chromadb": rag_stats,
    }


@app.get("/news")
async def get_news(count: int = 5):
    """Fetch live geopolitical headlines from GDELT and RSS."""
    headlines = await fetch_multiple_headlines(count=count)
    return {
        "count": len(headlines),
        "headlines": headlines,
    }


@app.get("/news/headline")
async def get_single_headline():
    """Fetch a single geopolitical headline for a debate round."""
    headline = await fetch_geopolitical_headline()
    if headline:
        return {"headline": headline}
    return {"error": "No headlines available from any source"}


@app.get("/rag/stats")
async def get_rag_stats():
    """Get ChromaDB collection statistics."""
    store = getattr(app.state, "vector_store", None)
    if not store:
        return {"error": "ChromaDB not initialized"}
    return store.get_collection_stats()


@app.get("/rag/query")
async def query_rag(q: str, country: str = None, n: int = 3):
    """Query historical events from ChromaDB."""
    from rag.retriever import retrieve_historical_context
    results = retrieve_historical_context(
        query=q,
        country_code=country,
        n_results=n,
    )
    return {
        "query": q,
        "country_filter": country,
        "results": results,
    }


@app.get("/agents")
async def get_agents():
    """Return all loaded agent profiles (public-facing fields only)."""
    profiles = getattr(app.state, "agent_profiles", {})
    public_profiles = {}
    for code, profile in profiles.items():
        public_profiles[code] = {
            "country_code": profile["country_code"],
            "country_name": profile["country_name"],
            "flag_emoji": profile["flag_emoji"],
            "personality": profile["personality"],
            "core_alliances": profile["core_alliances"],
            "core_rivalries": profile["core_rivalries"],
            "aggression_baseline": profile["aggression_baseline"],
        }
    return {"agents": public_profiles}


@app.get("/agents/{country_code}")
async def get_agent(country_code: str):
    """Return a single agent's public profile."""
    profiles = getattr(app.state, "agent_profiles", {})
    profile = profiles.get(country_code.lower())
    if not profile:
        return {"error": f"Agent '{country_code}' not found"}
    return {
        "country_code": profile["country_code"],
        "country_name": profile["country_name"],
        "flag_emoji": profile["flag_emoji"],
        "personality": profile["personality"],
        "core_alliances": profile["core_alliances"],
        "core_rivalries": profile["core_rivalries"],
    }


# -- WebSocket Endpoint -----------------------------------------
@app.websocket("/ws/debate")
async def debate_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for streaming debate events to the frontend.
    Events are broadcast to all connected clients.
    """
    await manager.connect(websocket)
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connection_established",
            "data": {
                "message": "Connected to Project EMERGENCE",
                "agents": COUNTRY_CODES,
            }
        })

        # Listen for client commands
        while True:
            data = await websocket.receive_text()
            command = json.loads(data)

            if command.get("type") == "start_debate":
                # Run the LangGraph debate orchestrator
                await run_debate(websocket)
            elif command.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[ERR] WebSocket error: {e}")
        manager.disconnect(websocket)


async def run_debate(websocket: WebSocket):
    """
    Execute the LangGraph debate graph and stream events to the client.
    The graph runs as a cyclic state machine, and we intercept events
    from the Blackboard's event_log to push to WebSocket clients.
    """
    print("[DEBATE] Starting new debate session...")
    graph = get_debate_graph()
    initial_state = create_initial_state()

    await websocket.send_json({
        "type": "system_message",
        "data": {"message": "Initiating debate... Fetching live headlines..."}
    })

    try:
        # Track events we've already sent
        sent_events = 0

        # Stream the graph execution
        async for state_update in graph.astream(initial_state):
            # Each state_update is a dict with the node name as key
            for node_name, node_output in state_update.items():
                if not isinstance(node_output, dict):
                    continue

                # Check for new events to stream
                new_events = node_output.get("event_log", [])
                for event in new_events:
                    try:
                        await websocket.send_json(event)
                        await manager.broadcast(event)
                    except Exception as e:
                        print(f"[WS] Event send failed: {e}")

                # Check if debate ended
                status = node_output.get("debate_status", "")
                if status in ("consensus", "deadlock", "halted"):
                    print(f"[DEBATE] Ended with status: {status}")
                    return

        print("[DEBATE] Graph execution complete")

    except Exception as e:
        print(f"[DEBATE] Error during execution: {e}")
        import traceback
        traceback.print_exc()
        await websocket.send_json({
            "type": "error",
            "data": {"message": f"Debate error: {str(e)}"}
        })


# -- Run Server -------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False)
