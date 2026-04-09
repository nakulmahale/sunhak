"""
Project EMERGENCE -- LangGraph Cyclic Orchestrator
=====================================================
Builds and compiles the cyclic StateGraph that drives the debate.

This is the BLACKBOARD ARCHITECTURE:
- No hardcoded turn order
- Agents independently evaluate the state
- The most relevant/triggered agent speaks next
- The Critic halts the cycle on consensus or deadlock

Graph Flow:
    START -> pulse -> relevance -> speaker -> tension -> critic
                                      ^                    |
                                      |                    v
                                reaction <-------- [if active]
                                                   [if ended] -> END
"""

from langgraph.graph import StateGraph, START, END

from blackboard.state import BlackboardState
from graph.nodes import (
    pulse_node,
    relevance_node,
    speaker_node,
    reaction_node,
    tension_node,
    critic_node,
)


def should_continue(state: dict) -> str:
    """
    Conditional edge function for the Critic node.
    Determines whether the debate continues or ends.
    """
    status = state.get("debate_status", "active")

    if status == "active":
        return "continue"
    else:
        # "consensus", "deadlock", or "halted"
        return "end"


def build_debate_graph() -> StateGraph:
    """
    Build and compile the cyclic LangGraph for debate orchestration.

    Returns:
        Compiled StateGraph ready for invocation
    """
    builder = StateGraph(BlackboardState)

    # ── Add nodes ──
    builder.add_node("pulse", pulse_node)
    builder.add_node("relevance", relevance_node)
    builder.add_node("speaker", speaker_node)
    builder.add_node("reaction", reaction_node)
    builder.add_node("tension", tension_node)
    builder.add_node("critic", critic_node)

    # ── Define edges ──

    # Entry: START -> pulse (fetch a live headline)
    builder.add_edge(START, "pulse")

    # pulse -> relevance (all agents score the headline)
    builder.add_edge("pulse", "relevance")

    # relevance -> speaker (highest-scoring agent speaks)
    builder.add_edge("relevance", "speaker")

    # speaker -> tension (update global stress level)
    builder.add_edge("speaker", "tension")

    # tension -> critic (evaluate if debate should continue)
    builder.add_edge("tension", "critic")

    # THE CYCLE: critic decides whether to continue or end
    builder.add_conditional_edges(
        "critic",
        should_continue,
        {
            "continue": "reaction",   # Debate continues -> other agents react
            "end": END,               # Debate over -> exit
        },
    )

    # reaction -> speaker (the most triggered agent speaks next)
    # THIS IS THE CYCLE - it loops back to speaker_node
    builder.add_edge("reaction", "speaker")

    # Compile the graph
    graph = builder.compile()

    print("[GRAPH] LangGraph debate orchestrator compiled")
    print("[GRAPH] Nodes: pulse -> relevance -> speaker -> tension -> critic")
    print("[GRAPH]   Cycle: critic -> reaction -> speaker (if active)")
    print("[GRAPH]   Exit:  critic -> END (on consensus/deadlock/halted)")

    return graph


# ── Singleton Graph ──
_graph_instance = None


def get_debate_graph():
    """Get or create the singleton debate graph."""
    global _graph_instance
    if _graph_instance is None:
        _graph_instance = build_debate_graph()
    return _graph_instance
