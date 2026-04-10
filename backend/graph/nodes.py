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
import inspect
import httpx
from datetime import datetime, timezone
from langchain_community.chat_models import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from config import (
    OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_NUM_CTX, 
    COUNTRY_CODES, MAX_DEBATE_TURNS,
    AGGRESSION_DEADLOCK_THRESHOLD, CONSENSUS_THRESHOLD
)
from agents.profiles import load_all_profiles, get_system_prompt
from rag.retriever import build_agent_rag_context, retrieve_historical_context, format_citations_for_ui
from news.fetcher import fetch_geopolitical_headline


# -- LLM Initialization ----------------------------------------
def _try_parse_json_obj(text: str) -> dict | None:
    """
    Best-effort extraction of a JSON object from model output.
    Ollama models often wrap JSON in extra prose or emit slightly invalid JSON.
    We never want JSON parsing errors to abort the turn.
    """
    if not text:
        return None
    t = text.strip()
    if "{" not in t or "}" not in t:
        return None
    # Heuristic: take the largest {...} span and try to parse.
    candidate = t[t.index("{") : t.rindex("}") + 1]
    try:
        return json.loads(candidate, strict=False)
    except Exception:
        return None


def _messages_to_ollama_prompt(messages: list) -> tuple[str, str]:
    """
    Convert LangChain messages into (system, prompt) for Ollama /api/generate.
    Some Ollama builds return 404 for /api/chat, but /api/generate is stable.
    """
    system = ""
    parts: list[str] = []

    for m in messages or []:
        content = getattr(m, "content", "")
        if isinstance(m, SystemMessage) and not system:
            system = str(content)
            continue

        if isinstance(m, HumanMessage):
            role = "USER"
        elif isinstance(m, AIMessage):
            role = "ASSISTANT"
        elif isinstance(m, SystemMessage):
            role = "SYSTEM"
        else:
            role = "USER"

        parts.append(f"[{role}]\n{content}".strip())

    return system, "\n\n".join(parts).strip()


async def ollama_generate(messages: list, temperature: float) -> str:
    """
    Call Ollama via /api/generate (non-streaming) to avoid /api/chat 404s.
    """
    system, prompt = _messages_to_ollama_prompt(messages)
    url = f"{OLLAMA_BASE_URL.rstrip('/')}/api/generate"

    options: dict = {
        "temperature": temperature,
        "num_ctx": OLLAMA_NUM_CTX,
    }
    try:
        from config import LLM_NUM_PREDICT
        options["num_predict"] = int(LLM_NUM_PREDICT)
    except Exception:
        pass

    payload = {
        "model": OLLAMA_MODEL,
        "system": system,
        "prompt": prompt,
        "stream": False,
        "options": options,
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return (data.get("response") or "").strip()

async def safe_ainvoke(llm, messages, retries=2):
    """Wrapper to handle Ollama timeouts/errors."""
    for attempt in range(retries + 1):
        try:
            return await llm.ainvoke(messages)
        except Exception as e:
            if attempt == retries:
                raise e
            await asyncio.sleep(1)

def get_llm(temperature: float = 0.8):
    """Get a configured Ollama LLM instance."""
    # Be defensive: different langchain/ollama versions support different kwargs.
    # Only pass params that are present in the constructor signature.
    kwargs = {
        "base_url": OLLAMA_BASE_URL,
        "model": OLLAMA_MODEL,
        "temperature": temperature,
        "num_ctx": OLLAMA_NUM_CTX,
    }
    try:
        from config import LLM_NUM_PREDICT, LLM_REQUEST_TIMEOUT_S
        kwargs["num_predict"] = LLM_NUM_PREDICT
        # Some versions use "timeout", some "request_timeout". We'll try both safely.
        kwargs["timeout"] = LLM_REQUEST_TIMEOUT_S
        kwargs["request_timeout"] = LLM_REQUEST_TIMEOUT_S
    except Exception:
        pass

    try:
        sig = inspect.signature(ChatOllama.__init__)
        allowed = set(sig.parameters.keys())
        filtered = {k: v for k, v in kwargs.items() if k in allowed}
        return ChatOllama(**filtered)
    except Exception:
        # Last resort: minimal init
        return ChatOllama(base_url=OLLAMA_BASE_URL, model=OLLAMA_MODEL, temperature=temperature, num_ctx=OLLAMA_NUM_CTX)


def _is_cuda_oom(err: Exception) -> bool:
    msg = str(err).lower()
    return ("out of memory" in msg) or ("cuda error" in msg) or ("ggml_cuda" in msg)

def _is_model_refusal(text: str) -> bool:
    """
    Detect model refusals that pollute the UI (policy boilerplate).
    """
    if not text:
        return False
    t = text.strip().lower()
    needles = [
        "i can't fulfill",
        "i cannot fulfill",
        "i can’t fulfill",
        "i can't help with",
        "i cannot help with",
        "can't assist with",
        "cannot assist with",
        "promoting or condoning harmful",
        "including military conflicts",
        "promotes or encourages aggressive behavior",
        "is there anything else i can help you with",
    ]
    return any(n in t for n in needles)


def _synthetic_in_character_statement(profile: dict, headline: str, tension: float) -> str:
    """
    Safe, confrontational-but-nonviolent fallback if the model refuses.
    (No graphic violence, no slurs, no incitement.)
    """
    name = profile.get("country_name", "This nation")
    allies = ", ".join(profile.get("core_alliances", [])[:3]) or "our partners"
    rivals = ", ".join(profile.get("core_rivalries", [])[:3]) or "those who oppose our interests"
    red_lines = ", ".join(profile.get("red_lines", [])[:2]) or "our fundamental red lines"
    heat = (
        "We reject selective outrage and inconsistent standards."
        if tension >= 0.5
        else "We will not accept distortions of fact or misplaced blame."
    )

    return (
        f"Regarding the latest developments — \"{headline}\" — {name} is clear: narratives are not policy, and slogans are not solutions.\n\n"
        f"{heat} To {rivals}: if you want credibility, start with consistency. Do not demand restraint while testing {red_lines} through provocations and escalatory messaging.\n\n"
        f"To {allies}: we expect coordination, clarity, and accountability for bad-faith actors. {name} will defend its interests through lawful measures, steady diplomacy, and strategic resolve. "
        f"This debate will not be settled by theatrics — it will be settled by verifiable commitments and accountability."
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
    source_name = headline_data.get("source", "")
    source_url = headline_data.get("url", "")
    summary = headline_data.get("summary", title)

    # Use LLM to generate a brief context summary if we don't have one
    if not summary or summary == title:
        try:
            text = await ollama_generate([
                SystemMessage(content="You are a geopolitical analyst. Provide a 2-sentence summary of this headline's geopolitical significance. Be concise."),
                HumanMessage(content=f"Headline: {title}"),
            ], temperature=0.3)
            summary = text.strip() or title
        except Exception as e:
            summary = title
            print(f"[PULSE] Summary generation failed: {e}")

    timestamp = datetime.now(timezone.utc).isoformat()

    return {
        "current_headline": title,
        # Prefer canonical URL; fallback to name if missing.
        "headline_source": source_url or source_name,
        "headline_summary": summary,
        "headline_timestamp": timestamp,
        "debate_status": "active",
        "turn_count": 0,
        "event_log": [{
            "type": "headline",
            "data": {
                "headline": title,
                "source": source_name or (source_url or "Unknown"),
                "sourceUrl": source_url,
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
            text = await ollama_generate([
                SystemMessage(content=system),
                HumanMessage(content=f"Headline: {headline}"),
            ], temperature=0.4)
            text = (text or "").strip()
            parsed = _try_parse_json_obj(text) or {}
            if parsed:
                score = float(parsed.get("score", 0.5))
                reason = parsed.get("reason", "No explanation")
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

    # Select 5 active participants for this debate session (top relevance).
    # This prevents the debate from collapsing into the same 2-country loop
    # and ensures a smaller coalition-like dynamic.
    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    participants = [code for code, _ in sorted_scores[:5]]
    ts = datetime.now(timezone.utc).isoformat()
    events.append({
        "type": "participants_selected",
        "data": {"participants": participants},
        "timestamp": ts,
    })

    return {
        "agent_scores": scores,
        "participants": participants,
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
    participants = state.get("participants") or list(scores.keys()) or COUNTRY_CODES

    if not scores:
        return {"debate_status": "halted", "after_action_report": "No agent scores available."}

    # Find the agent with the highest relevance score
    # STRICT ALTERNATION: Filter out the last speaker to prevent consecutive turns
    last_speaker = None
    messages = state.get("messages", [])
    if messages:
        last_msg = messages[-1]
        last_speaker = last_msg.name if hasattr(last_msg, "name") else state.get("active_speaker")

    # Filter scores to exclude last speaker
    eligible_scores = {
        code: score
        for code, score in scores.items()
        if code != last_speaker and code in participants
    }
    
    if not eligible_scores:
        # Fallback: if somehow only one agent has a score and it was the last speaker, pick anyone else
        eligible_scores = {code: 0.1 for code in participants if code != last_speaker}

    # Sort by score
    sorted_agents = sorted(eligible_scores.items(), key=lambda x: x[1], reverse=True)
    active_code = sorted_agents[0][0]

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
    # Keep prompts small to reduce Ollama VRAM/RAM usage.
    if isinstance(rag_context, str) and len(rag_context) > 2200:
        rag_context = rag_context[:2200] + "\n[Context truncated for performance]"

    # Layer 3: Episodic State
    conversation_history = state.get("messages", [])
    tension = state.get("global_tension", 0.0)
    previous_speakers = []
    for msg in conversation_history:
        code = msg.name if hasattr(msg, "name") else None
        if code and code not in previous_speakers:
            previous_speakers.append(code)

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
4. Keep this a robust diplomatic debate: directly challenge opponents' claims, point out inconsistencies, and argue your position with clear reasoning.
5. Do NOT use slurs or hate speech. Avoid threats, calls for violence, and graphic content. No profanity.
6. Your response should be 2-4 paragraphs of firm diplomatic speech (critical, assertive, but non-violent and policy-focused).
7. Stay in character — your tone is: {profile['personality']['tone']}
8. Include your internal reasoning as a separate thought process

Output format:
- Preferred: a single JSON object with keys: statement, internal_reasoning, aggression_level
- If you cannot produce valid JSON, output ONLY the diplomatic statement as plain text (no JSON, no backticks)."""

    try:
        text = await ollama_generate([
            SystemMessage(content=full_system),
            *conversation_history[-10:],  # Last 10 messages for context
            HumanMessage(content=f"The floor is now open to {profile['country_name']}. Respond to the headline: {headline}"),
        ], temperature=0.85)
        text = (text or "").strip()
        if not text:
            raise RuntimeError("LLM returned empty output")
        if _is_model_refusal(text):
            raise RuntimeError("LLM returned a refusal")

        # Parse structured response (but never fail the whole turn on JSON issues)
        result = _try_parse_json_obj(text)
        if isinstance(result, dict):
            statement = (result.get("statement") or "").strip() or text
            reasoning = (result.get("internal_reasoning") or "").strip()
            try:
                aggression = float(result.get("aggression_level", profile["aggression_baseline"]))
            except Exception:
                aggression = profile["aggression_baseline"]
        else:
            statement = text
            reasoning = ""
            aggression = profile["aggression_baseline"]

    except Exception as e:
        # If Ollama OOMs, retry once with even smaller settings.
        if _is_cuda_oom(e):
            try:
                text2 = await ollama_generate([
                    SystemMessage(content=full_system[:1800] + "\n[Prompt truncated for low-memory retry]"),
                    *conversation_history[-6:],
                    HumanMessage(content=f"Respond briefly (1-2 paragraphs). Headline: {headline}"),
                ], temperature=0.5)
                text2 = (text2 or "").strip()
                if text2:
                    statement = text2
                    reasoning = "Low-memory retry after CUDA OOM."
                    aggression = profile["aggression_baseline"]
                else:
                    raise RuntimeError("Low-memory retry returned empty output")
            except Exception as e2:
                statement = (
                    "SYSTEM GENERATED (Ollama CUDA OOM): "
                    "Unable to generate a model response due to GPU memory limits. "
                    "This is a fallback message so the simulation can continue."
                )
                reasoning = f"CUDA OOM fallback: {e2}"
                aggression = profile["aggression_baseline"]
        else:
            # If the model refuses, replace it with a safe in-character statement
            # (no policy boilerplate in the UI).
            if "refusal" in str(e).lower():
                statement = _synthetic_in_character_statement(profile, headline, tension)
                reasoning = "Synthetic fallback due to model refusal."
                aggression = max(profile.get("aggression_baseline", 0.35), 0.55)
            else:
                statement = (
                    "SYSTEM GENERATED (LLM unavailable): "
                    "The model did not return a valid response. "
                    "This is a fallback message so the simulation can continue."
                )
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
    participants = state.get("participants") or COUNTRY_CODES

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
        if code not in participants:
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
            text = await ollama_generate([
                SystemMessage(content=system),
                HumanMessage(content=f"Statement by {last_speaker}: {last_content[:500]}"),
            ], temperature=0.5)
            text = (text or "").strip()
            parsed = _try_parse_json_obj(text) or {}
            if parsed:
                urgency = float(parsed.get("reaction_urgency", 0.3))
                reason = parsed.get("reason", "")
            else:
                urgency = profile.get("aggression_baseline", 0.3)
                reason = "Unparseable response"
        except Exception as e:
            urgency = profile.get("aggression_baseline", 0.3)
            reason = f"Scoring error: {e}"

        reaction_scores[code] = max(0.0, min(1.0, urgency))

    tasks = [
        score_reaction(code, profiles[code])
        for code in participants
        if code in profiles and code != last_speaker
    ]
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

    # Require a minimum number of turns before ending (ensures at least 6 convo/messages)
    MIN_TURNS_BEFORE_END = 6

    # Auto-halt on max turns
    if turn_count >= MAX_DEBATE_TURNS:
        report = await generate_after_action_report(state, "halted")
        return {
            "debate_status": "halted",
            "after_action_report": report,
            "event_log": [{
                "type": "debate_end",
                "data": {
                    "status": "halted",
                    "afterActionReport": report,
                    "totalTurns": turn_count,
                    "finalTension": global_tension,
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }],
        }

    # Check for deadlock (aggression too high)
    max_aggression = max(aggression_scores.values()) if aggression_scores else 0.0
    if max_aggression >= AGGRESSION_DEADLOCK_THRESHOLD and turn_count >= MIN_TURNS_BEFORE_END:
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
    if global_tension <= CONSENSUS_THRESHOLD and turn_count >= MIN_TURNS_BEFORE_END:
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
    """
    Generate the Critic's after-action report.

    This is intentionally deterministic (no LLM call) so it always includes:
    - a "thought" for every participating country
    - a computed risk level per country
    """
    headline = state.get("current_headline", "") or "—"
    global_tension = float(state.get("global_tension", 0.0) or 0.0)
    aggression_scores = state.get("aggression_scores", {}) or {}
    turn_count = int(state.get("turn_count", 0) or 0)
    participants = state.get("participants") or COUNTRY_CODES
    profiles = get_profiles()

    def risk_label(a: float) -> str:
        if a >= 0.70:
            return "HIGH"
        if a >= 0.45:
            return "MEDIUM"
        return "LOW"

    def risk_driver(a: float) -> str:
        if a >= 0.70:
            return "Very firm posture; heightened chance of rapid policy hardening."
        if a >= 0.45:
            return "Hard bargaining; elevated chance of diplomatic friction."
        return "Managed signaling; lower chance of rapid escalation."

    # Track each participant's last message excerpt
    last_excerpt: dict[str, str] = {c: "" for c in participants}
    for msg in (state.get("messages", []) or [])[::-1]:
        code = msg.name if hasattr(msg, "name") else None
        if not code or code not in last_excerpt or last_excerpt[code]:
            continue
        content = msg.content if hasattr(msg, "content") else ""
        excerpt = (content or "").strip().replace("\n", " ")
        last_excerpt[code] = excerpt[:160] + ("…" if len(excerpt) > 160 else "")

    # Overall risk = max participant risk
    max_a = 0.0
    for c in participants:
        try:
            max_a = max(max_a, float(aggression_scores.get(c, 0.0) or 0.0))
        except Exception:
            pass

    overall_risk = risk_label(max_a)

    lines: list[str] = []
    lines.append("AFTER-ACTION REPORT — EMERGENCE")
    lines.append("")
    lines.append(f"Outcome: {outcome.upper()} | Turns: {turn_count} | Global tension: {global_tension:.0%} | Overall risk: {overall_risk}")
    lines.append(f"Headline: {headline}")
    lines.append("")
    lines.append("Per-country assessments (participants):")

    for code in participants:
        p = profiles.get(code, {})
        name = p.get("country_name", code.upper())
        flag = p.get("flag_emoji", "")
        allies = ", ".join((p.get("core_alliances") or [])[:3]) or "—"
        rivals = ", ".join((p.get("core_rivalries") or [])[:3]) or "—"
        red_lines = ", ".join((p.get("red_lines") or [])[:2]) or "—"
        a = float(aggression_scores.get(code, 0.0) or 0.0)
        r = risk_label(a)

        # "Thought" = concise analytic intent statement
        thought = (
            f"Primary intent: contest {rivals if rivals != '—' else 'opponents'} while protecting {red_lines}. "
            f"Coordination preference: {allies if allies != '—' else 'ad-hoc alignment'}."
        )
        if r == "HIGH":
            thought += " Likely to adopt a very firm line and narrow room for compromise."
        elif r == "MEDIUM":
            thought += " Likely to issue demands and counter-demands; risk of prolonged stalemate."
        else:
            thought += " Likely to keep channels open and avoid irreversible commitments."

        excerpt = last_excerpt.get(code, "") or "No statement captured."

        lines.append("")
        lines.append(f"- {flag} {name} ({code.upper()})")
        lines.append(f"  Risk: {r} (aggression={a:.2f})")
        lines.append(f"  Driver: {risk_driver(a)}")
        lines.append(f"  Thought: {thought}")
        lines.append(f"  Last line: {excerpt}")

    return "\n".join(lines).strip()
