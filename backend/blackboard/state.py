"""
Project EMERGENCE — Blackboard State Schema
============================================
Defines the global shared state for the LangGraph cyclic graph.
This is the "Blackboard" that all agents read from and write to.

The Blackboard Architecture ensures emergent behavior:
- Agents independently evaluate the state
- The most relevant agent speaks next
- No hardcoded turn order
"""

from typing import Annotated, TypedDict, Literal
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


# ── Reducer Functions ──────────────────────────────────
def merge_dicts(existing: dict, updates: dict) -> dict:
    """Reducer: merge new dict entries into existing dict."""
    merged = {**existing} if existing else {}
    merged.update(updates)
    return merged


def append_list(existing: list, new_items: list) -> list:
    """Reducer: append new items to existing list."""
    result = list(existing) if existing else []
    result.extend(new_items)
    return result


def replace_value(existing, new_value):
    """Reducer: simply replace the old value with the new one."""
    return new_value


# ── Blackboard State (LangGraph TypedDict) ─────────────
class BlackboardState(TypedDict):
    """
    The global state shared across all LangGraph nodes.

    This TypedDict defines the Blackboard that drives emergent behavior.
    Annotated types with reducers control how state updates are merged.
    """

    # ── News / Headline Context ──
    current_headline: Annotated[str, replace_value]
    """The live news headline currently being debated."""

    headline_source: Annotated[str, replace_value]
    """Source URL of the current headline."""

    headline_summary: Annotated[str, replace_value]
    """AI-generated summary providing context for the headline."""

    headline_timestamp: Annotated[str, replace_value]
    """ISO timestamp when the headline was fetched."""

    # ── Conversation ──
    messages: Annotated[list, add_messages]
    """Full debate conversation history (LangChain message format)."""

    # ── Agent Selection / Relevance ──
    agent_scores: Annotated[dict, merge_dicts]
    """Relevance scores per agent for the current turn: {country_code: float}."""

    participants: Annotated[list, replace_value]
    """Active country agents participating in this debate session."""

    active_speaker: Annotated[str, replace_value]
    """Country code of the agent currently speaking."""

    speaker_reasoning: Annotated[str, replace_value]
    """Internal monologue / hidden reasoning of the active speaker."""

    # ── RAG Citations ──
    rag_citations: Annotated[list, append_list]
    """Historical documents cited by agents in the current debate session."""

    # ── Tension / Aggression Tracking ──
    aggression_scores: Annotated[dict, merge_dicts]
    """Per-agent cumulative aggression scores: {country_code: float}."""

    global_tension: Annotated[float, replace_value]
    """Composite global tension value [0.0 - 1.0] for the Stress Dial."""

    # ── Debate Control ──
    turn_count: Annotated[int, replace_value]
    """Number of debate turns completed so far."""

    debate_status: Annotated[str, replace_value]
    """Current debate state: 'active' | 'consensus' | 'deadlock' | 'halted'."""

    after_action_report: Annotated[str, replace_value]
    """The Critic agent's final analysis report (set when debate ends)."""

    # ── WebSocket Event Stream ──
    event_log: Annotated[list, append_list]
    """Stream of UI events to be pushed to clients via WebSocket."""


# ── Pydantic Models (for API serialization) ────────────
class DebateMessage(BaseModel):
    """A single message in the debate feed."""
    country_code: str = Field(..., description="Country code of the speaker")
    country_name: str = Field(..., description="Full country name")
    flag_emoji: str = Field(..., description="Flag emoji for UI display")
    content: str = Field(..., description="The diplomatic statement")
    reasoning: str = Field("", description="Internal monologue (hidden reasoning)")
    citations: list[str] = Field(default_factory=list, description="RAG document references")
    aggression_score: float = Field(0.0, description="Aggression of this specific statement")
    timestamp: str = Field(..., description="ISO timestamp")


class DebateEvent(BaseModel):
    """An event pushed to the frontend via WebSocket."""
    type: str = Field(..., description="Event type: agent_speaking | agent_thinking | headline | tension_update | debate_end | system")
    data: dict = Field(default_factory=dict, description="Event payload")
    timestamp: str = Field(..., description="ISO timestamp")


class AgentState(BaseModel):
    """Snapshot of an individual agent's state at a point in time."""
    country_code: str
    country_name: str
    flag_emoji: str
    aggression: float = 0.0
    relevance_score: float = 0.0
    is_speaking: bool = False
    is_thinking: bool = False
    last_statement: str = ""
    turn_count: int = 0


# ── Initial State Factory ──────────────────────────────
def create_initial_state() -> dict:
    """Create a fresh Blackboard state for a new debate session."""
    return {
        "current_headline": "",
        "headline_source": "",
        "headline_summary": "",
        "headline_timestamp": "",
        "messages": [],
        "agent_scores": {},
        "participants": [],
        "active_speaker": "",
        "speaker_reasoning": "",
        "rag_citations": [],
        "aggression_scores": {
            "usa": 0.0, "china": 0.0, "russia": 0.0,
            "iran": 0.0, "israel": 0.0, "uk": 0.0,
            "france": 0.0, "germany": 0.0, "india": 0.0,
            "north_korea": 0.0,
        },
        "global_tension": 0.0,
        "turn_count": 0,
        "debate_status": "active",
        "after_action_report": "",
        "event_log": [],
    }
