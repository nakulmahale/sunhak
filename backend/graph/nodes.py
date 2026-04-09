"""
Project EMERGENCE -- LangGraph Graph Nodes
=============================================
Defines all computational nodes for the cyclic LangGraph state machine.
Each node reads from and writes to the Blackboard (global state).

Nodes:
1. pulse_node        - Fetches a live news headline
2. relevance_node    - All 10 agents score headline relevance
3. speaker_node      - Highest-relevance agent formulates a response
4. reaction_node     - Remaining agents evaluate and the most triggered responds
5. critic_node       - Monitors tension and decides: continue, consensus, or deadlock
6. tension_node      - Updates global tension based on aggression scores
"""

import json
import random
import asyncio
from datetime import datetime, timezone
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from config import GROQ_API_KEY, GROQ_MODEL, COUNTRY_CODES, MAX_DEBATE_TURNS
from config import AGGRESSION_DEADLOCK_THRESHOLD, CONSENSUS_THRESHOLD
from agents.profiles import load_all_profiles, get_system_prompt
from rag.retriever import build_agent_rag_context, retrieve_historical_context, format_citations_for_ui
from news.fetcher import fetch_geopolitical_headline


# -- LLM Initialization ----------------------------------------
def get_llm(temperature: float = 0.8):
    """Get a configured Groq LLM instance."""
    return ChatGroq(
        model=GROQ_MODEL,
        groq_api_key=GROQ_API_KEY,
        temperature=temperature,
        max_tokens=1024,
    )


# -- Cached profiles -------------------------------------------
_profiles = None

def get_profiles():
    global _profiles
    if _profiles is None:
        _profiles = load_all_profiles()
    return _profiles


# ================================================================
# NODE 1: THE PULSE — News Ingestor
# ================================================================
async def pulse_node(state: dict) -> dict:
    """
    Fetch a live geopolitical headline and post it to the Blackboard.
    This is the catalyst that starts each debate round.
    """
    headline_data = await fetch_geopolitical_headline()

    if not headline_data:
        return {
            "current_headline": "Global tensions rise as nations navigate uncertain geopolitical landscape",
            "headline_source": "System Generated",
            "headline_summary": "A general geopolitical topic for debate when live news is unavailable.",
            "headline_timestamp": datetime.now(timezone.utc).isoformat(),
            "debate_status": "active",
            "event_log": [{
                "type": "headline",
                "data": {
                    "headline": "Global tensions rise as nations navigate uncertain geopolitical landscape",
                    "source": "System Generated",
                    "summary": "Fallback topic",
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }],
        }

    title = headline_data.get("title", "")
    source = headline_data.get("source", headline_data.get("url", ""))
    summary = headline_data.get("summary", title)

    # Use LLM to generate a brief context summary if we don't have one
    if not summary or summary == title:
        try:
            llm = get_llm(temperature=0.3)
            resp = await llm.ainvoke([
                SystemMessage(content="You are a geopolitical analyst. Provide a 2-sentence summary of this headline's geopolitical significance. Be concise."),
                HumanMessage(content=f"Headline: {title}"),
            ])
            summary = resp.content.strip()
        except Exception as e:
            summary = title
            print(f"[PULSE] Summary generation failed: {e}")

    timestamp = datetime.now(timezone.utc).isoformat()

    return {
        "current_headline": title,
        "headline_source": source,
        "headline_summary": summary,
        "headline_timestamp": timestamp,
        "debate_status": "active",
        "turn_count": 0,
        "event_log": [{
            "type": "headline",
            "data": {
                "headline": title,
                "source": source,
                "summary": summary,
                "timestamp": timestamp,
            },
            "timestamp": timestamp,
        }],
    }


# ================================================================
# NODE 2: RELEVANCE ENGINE — All agents score the headline
# ================================================================
async def relevance_node(state: dict) -> dict:
    """
    All 10 country agents evaluate the current headline and produce
    a relevance score. This determines who speaks first (emergence).
    """
    headline = state.get("current_headline", "")
    profiles = get_profiles()
    llm = get_llm(temperature=0.4)

    scores = {}
    events = []

    # Score all agents in parallel
    async def score_agent(code, profile):
        system = f"""You are evaluating how relevant a news headline is to {profile['country_name']}'s national interests.

Consider:
- Does this directly affect {profile['country_name']}'s security, economy, or alliances?
- Are any of {profile['country_name']}'s allies or rivals mentioned or implied?
- Does this touch on {profile['country_name']}'s red lines or hidden agenda?

Red lines: {', '.join(profile['red_lines'][:3])}
Core alliances: {', '.join(profile['core_alliances'])}
Core rivalries: {', '.join(profile['core_rivalries'])}

Respond with ONLY a JSON object: {{"score": 0.0-1.0, "reason": "brief explanation"}}"""

        try:
            resp = await llm.ainvoke([
                SystemMessage(content=system),
                HumanMessage(content=f"Headline: {headline}"),
            ])
            text = resp.content.strip()
            # Extract JSON from response
            if "{" in text and "}" in text:
                json_str = text[text.index("{"):text.rindex("}")+1]
                result = json.loads(json_str, strict=False)
                score = float(result.get("score", 0.5))
                reason = result.get("reason", "No explanation")
            else:
                score = 0.5
                reason = "Could not parse relevance score"
        except Exception as e:
            score = profile.get("aggression_baseline", 0.5)
            reason = f"Scoring failed, using baseline: {e}"

        # Clamp score
        score = max(0.0, min(1.0, score))
        scores[code] = score
        events.append({
            "type": "agent_thinking",
            "data": {
                "countryCode": code,
                "reasoning": f"Relevance assessment: {reason}",
                "relevanceScore": score,
                "ragQuery": f"Evaluating: {headline[:60]}...",
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # Run all scoring tasks concurrently
    tasks = [score_agent(code, profiles[code]) for code in COUNTRY_CODES if code in profiles]
    await asyncio.gather(*tasks)

    return {
        "agent_scores": scores,
        "event_log": events,
    }


# ================================================================
# NODE 3: SPEAKER — The most relevant agent speaks
# ================================================================
async def speaker_node(state: dict) -> dict:
    """
    The agent with the highest relevance score speaks first.
    Uses Tri-Layer Memory: DNA (system prompt) + RAG (historical) + Episodic (state).
    """
    scores = state.get("agent_scores", {})
    headline = state.get("current_headline", "")
    turn_count = state.get("turn_count", 0)
    profiles = get_profiles()

    if not scores:
        return {"debate_status": "halted", "after_action_report": "No agent scores available."}

    # Find the agent with the highest relevance score
    # On subsequent turns, find the agent most triggered by the latest message
    previous_speakers = set()
    for msg in state.get("messages", []):
        if hasattr(msg, "name"):
            previous_speakers.add(msg.name)

    # Sort by score, prefer agents who haven't spoken recently
    sorted_agents = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    # Pick highest scorer, but on repeated cycles, add some variety
    active_code = sorted_agents[0][0]
    for code, score in sorted_agents:
        if code not in previous_speakers or len(previous_speakers) >= len(scores):
            active_code = code
            break

    profile = profiles.get(active_code)
    if not profile:
        return {"debate_status": "halted"}

    # Layer 1: DNA (System Prompt)
    system_prompt = get_system_prompt(profile)

    # Layer 2: Historical RAG
    rag_context = build_agent_rag_context(
        headline=headline,
        country_code=profile["country_code"],
        memory_tags=profile.get("historical_memory_tags", []),
        n_results=3,
    )

    # Layer 3: Episodic State
    conversation_history = state.get("messages", [])
    tension = state.get("global_tension", 0.0)

    # Build the full prompt
    full_system = f"""{system_prompt}

{rag_context}

--- CURRENT SITUATION ---
Headline being debated: {headline}
Current global tension: {tension:.1%}
Turn number: {turn_count + 1}
Previous speakers this round: {', '.join(previous_speakers) if previous_speakers else 'None (you speak first)'}

INSTRUCTIONS:
1. Respond as {profile['country_name']}'s representative to this headline
2. Reference specific historical events from your intelligence briefing
3. Address other nations' positions if they have spoken
4. Your response should be 2-4 paragraphs of diplomatic speech
5. Stay in character — your tone is: {profile['personality']['tone']}
6. Include your internal reasoning as a separate thought process

Respond in this exact JSON format:
{{"statement": "Your diplomatic statement (2-4 paragraphs)", "internal_reasoning": "Your hidden thought process including RAG queries and strategic calculations", "aggression_level": 0.0-1.0}}"""

    llm = get_llm(temperature=0.85)

    try:
        resp = await llm.ainvoke([
            SystemMessage(content=full_system),
            *conversation_history[-10:],  # Last 10 messages for context
            HumanMessage(content=f"The floor is now open to {profile['country_name']}. Respond to the headline: {headline}"),
        ])

        text = resp.content.strip()

        # Parse structured response
        if "{" in text and "}" in text:
            json_str = text[text.index("{"):text.rindex("}")+1]
            result = json.loads(json_str, strict=False)
            statement = result.get("statement", text)
            reasoning = result.get("internal_reasoning", "")
            aggression = float(result.get("aggression_level", profile["aggression_baseline"]))
        else:
            statement = text
            reasoning = "Response was unstructured"
            aggression = profile["aggression_baseline"]

    except Exception as e:
        statement = f"{profile['country_name']} reserves the right to respond at a later time. [System: LLM call failed: {e}]"
        reasoning = f"LLM error: {e}"
        aggression = profile["aggression_baseline"]

    aggression = max(0.0, min(1.0, aggression))
    timestamp = datetime.now(timezone.utc).isoformat()

    # Get RAG citations for the UI
    rag_docs = retrieve_historical_context(headline, country_code=profile["country_code"], n_results=3)
    citations = format_citations_for_ui(rag_docs)

    # Create the message
    message = AIMessage(
        content=statement,
        name=active_code,
    )

    # Build events for WebSocket
    events = [
        {
            "type": "agent_thinking",
            "data": {
                "countryCode": active_code,
                "reasoning": reasoning,
                "relevanceScore": scores.get(active_code, 0.5),
                "ragQuery": f"Querying historical DB for {profile['country_name']} context...",
            },
            "timestamp": timestamp,
        },
        {
            "type": "agent_speaking",
            "data": {
                "message": {
                    "id": f"msg_{turn_count + 1}_{active_code}",
                    "countryCode": active_code,
                    "countryName": profile["country_name"],
                    "flagEmoji": profile["flag_emoji"],
                    "content": statement,
                    "reasoning": reasoning,
                    "citations": citations,
                    "aggressionScore": aggression,
                    "timestamp": timestamp,
                },
                "globalTension": state.get("global_tension", 0.0),
                "turnCount": turn_count + 1,
            },
            "timestamp": timestamp,
        },
    ]

    # Update aggression scores
    current_aggression = dict(state.get("aggression_scores", {}))
    current_aggression[active_code] = (current_aggression.get(active_code, 0.0) + aggression) / 2.0

    return {
        "messages": [message],
        "active_speaker": active_code,
        "speaker_reasoning": reasoning,
        "rag_citations": citations,
        "aggression_scores": current_aggression,
        "turn_count": turn_count + 1,
        "event_log": events,
    }


# ================================================================
# NODE 4: REACTION — Other agents evaluate and the most triggered responds
# ================================================================
async def reaction_node(state: dict) -> dict:
    """
    After an agent speaks, all other agents evaluate the statement.
    The most 'triggered' agent (highest reaction score) responds next.
    This creates emergent back-and-forth rather than hardcoded turns.
    """
    active_speaker = state.get("active_speaker", "")
    headline = state.get("current_headline", "")
    messages = state.get("messages", [])
    profiles = get_profiles()
    llm = get_llm(temperature=0.5)

    if not messages:
        return {}

    # Get the last statement
    last_message = messages[-1] if messages else None
    last_content = last_message.content if last_message else ""
    last_speaker = last_message.name if last_message and hasattr(last_message, "name") else active_speaker

    # Score reactions from all agents except the current speaker
    reaction_scores = {}

    async def score_reaction(code, profile):
        if code == last_speaker:
            return

        system = f"""You are {profile['country_name']}'s diplomatic advisor. Another country just made a statement in a geopolitical debate.

Your country's core rivalries: {', '.join(profile['core_rivalries'])}
Your country's red lines: {', '.join(profile['red_lines'][:3])}
Your country's alliances: {', '.join(profile['core_alliances'])}

Evaluate how strongly {profile['country_name']} would need to respond to this statement.
Consider:
- Does it threaten your interests or allies?
- Does it cross any red lines?
- Does it require a rebuttal or support?

Respond with ONLY a JSON object: {{"reaction_urgency": 0.0-1.0, "reason": "brief explanation"}}"""

        try:
            resp = await llm.ainvoke([
                SystemMessage(content=system),
                HumanMessage(content=f"Statement by {last_speaker}: {last_content[:500]}"),
            ])
            text = resp.content.strip()
            if "{" in text and "}" in text:
                json_str = text[text.index("{"):text.rindex("}")+1]
                result = json.loads(json_str, strict=False)
                urgency = float(result.get("reaction_urgency", 0.3))
                reason = result.get("reason", "")
            else:
                urgency = profile.get("aggression_baseline", 0.3)
                reason = "Unparseable response"
        except Exception as e:
            urgency = profile.get("aggression_baseline", 0.3)
            reason = f"Scoring error: {e}"

        reaction_scores[code] = max(0.0, min(1.0, urgency))

    tasks = [score_reaction(code, profiles[code]) for code in COUNTRY_CODES
             if code in profiles and code != last_speaker]
    await asyncio.gather(*tasks)

    if not reaction_scores:
        return {}

    return {
        "agent_scores": reaction_scores,
    }


# ================================================================
# NODE 5: TENSION — Update global tension
# ================================================================
def tension_node(state: dict) -> dict:
    """
    Calculate and update the global tension level based on
    individual agent aggression scores.
    """
    aggression_scores = state.get("aggression_scores", {})

    if not aggression_scores:
        return {"global_tension": 0.0}

    # Global tension is the weighted average of all agent aggressions
    values = list(aggression_scores.values())
    avg_aggression = sum(values) / len(values) if values else 0.0

    # The max individual aggression pulls the dial up faster
    max_aggression = max(values) if values else 0.0

    # Weighted: 60% average, 40% max (so one very aggressive agent raises tension)
    global_tension = (0.6 * avg_aggression) + (0.4 * max_aggression)
    global_tension = max(0.0, min(1.0, global_tension))

    timestamp = datetime.now(timezone.utc).isoformat()

    events = [{
        "type": "tension_update",
        "data": {
            "globalTension": global_tension,
            "aggressionScores": aggression_scores,
            "turnCount": state.get("turn_count", 0),
        },
        "timestamp": timestamp,
    }]

    # Warning state if tension is high
    if global_tension > 0.7:
        events.append({
            "type": "system_message",
            "data": {
                "message": f"WARNING: Global tension at {global_tension:.0%}. Situation escalating.",
                "level": "warning",
            },
            "timestamp": timestamp,
        })

    return {
        "global_tension": global_tension,
        "event_log": events,
    }


# ================================================================
# NODE 6: CRITIC — The Referee Agent
# ================================================================
async def critic_node(state: dict) -> dict:
    """
    The Critic monitors the Blackboard and decides:
    - Continue: debate is productive, let it run
    - Consensus: agents are converging, generate a deal report
    - Deadlock: aggression too high, generate a warning report
    - Halted: max turns reached
    """
    global_tension = state.get("global_tension", 0.0)
    turn_count = state.get("turn_count", 0)
    messages = state.get("messages", [])
    aggression_scores = state.get("aggression_scores", {})

    # Auto-halt on max turns
    if turn_count >= MAX_DEBATE_TURNS:
        return {
            "debate_status": "halted",
            "event_log": [{
                "type": "system_message",
                "data": {"message": f"Debate halted after {MAX_DEBATE_TURNS} turns."},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }],
        }

    # Check for deadlock (aggression too high)
    max_aggression = max(aggression_scores.values()) if aggression_scores else 0.0
    if max_aggression >= AGGRESSION_DEADLOCK_THRESHOLD and turn_count >= 3:
        report = await generate_after_action_report(state, "deadlock")
        return {
            "debate_status": "deadlock",
            "after_action_report": report,
            "event_log": [{
                "type": "debate_end",
                "data": {
                    "status": "deadlock",
                    "afterActionReport": report,
                    "totalTurns": turn_count,
                    "finalTension": global_tension,
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }],
        }

    # Check for consensus (tension dropping below threshold)
    if global_tension <= CONSENSUS_THRESHOLD and turn_count >= 4:
        report = await generate_after_action_report(state, "consensus")
        return {
            "debate_status": "consensus",
            "after_action_report": report,
            "event_log": [{
                "type": "debate_end",
                "data": {
                    "status": "consensus",
                    "afterActionReport": report,
                    "totalTurns": turn_count,
                    "finalTension": global_tension,
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }],
        }

    # Continue the debate
    return {
        "debate_status": "active",
    }


async def generate_after_action_report(state: dict, outcome: str) -> str:
    """Generate the Critic's after-action analysis report."""
    llm = get_llm(temperature=0.6)
    headline = state.get("current_headline", "")
    messages = state.get("messages", [])
    global_tension = state.get("global_tension", 0.0)
    aggression_scores = state.get("aggression_scores", {})
    turn_count = state.get("turn_count", 0)

    # Summarize the debate
    debate_summary = []
    for msg in messages[-10:]:
        speaker = msg.name if hasattr(msg, "name") else "Unknown"
        content = msg.content[:200] if hasattr(msg, "content") else str(msg)[:200]
        debate_summary.append(f"[{speaker.upper()}]: {content}")

    summary_text = "\n".join(debate_summary)

    system = """You are a senior intelligence analyst writing an After-Action Report for a geopolitical simulation.

Write a concise but comprehensive report covering:
1. SITUATION: What headline catalyzed this debate
2. KEY POSITIONS: What each major faction argued
3. ESCALATION DYNAMICS: How tensions rose or fell
4. OUTCOME: Whether consensus was reached or deadlock occurred
5. ASSESSMENT: Strategic implications and what this reveals about current geopolitical dynamics

Write in formal intelligence report style. Be specific and analytical."""

    try:
        resp = await llm.ainvoke([
            SystemMessage(content=system),
            HumanMessage(content=f"""Generate an After-Action Report for this geopolitical debate simulation.

Headline: {headline}
Outcome: {outcome.upper()}
Total Turns: {turn_count}
Final Tension Level: {global_tension:.0%}
Aggression Scores: {json.dumps(aggression_scores, indent=2)}

Debate Transcript (last 10 turns):
{summary_text}"""),
        ])
        return resp.content.strip()
    except Exception as e:
        return f"[After-Action Report Generation Failed: {e}]\n\nOutcome: {outcome}\nTurns: {turn_count}\nTension: {global_tension:.0%}"
