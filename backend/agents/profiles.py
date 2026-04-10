"""
Project EMERGENCE — Agent Profile Loader
=========================================
Loads and validates the 10 country agent DNA profiles from JSON files.
Each profile represents Layer 1 (DNA) of the Tri-Layer Memory architecture.
"""

import json
from pathlib import Path
from config import AGENTS_DNA_DIR, COUNTRY_CODES


# Required fields in each agent DNA JSON
REQUIRED_FIELDS = [
    "country_code",
    "country_name",
    "flag_emoji",
    "personality",
    "hidden_agenda",
    "red_lines",
    "core_alliances",
    "core_rivalries",
    "economic_leverage",
    "military_posture",
    "negotiation_style",
    "historical_memory_tags",
    "aggression_baseline",
    "cooperation_threshold",
    "system_prompt_template",
]


def load_profile(country_code: str) -> dict:
    """Load a single country agent DNA profile from its JSON file."""
    filepath = AGENTS_DNA_DIR / f"{country_code}.json"
    if not filepath.exists():
        raise FileNotFoundError(
            f"Agent DNA file not found: {filepath}\n"
            f"Expected path: {AGENTS_DNA_DIR / country_code}.json"
        )

    with open(filepath, "r", encoding="utf-8") as f:
        profile = json.load(f)

    # Validate required fields
    missing = [field for field in REQUIRED_FIELDS if field not in profile]
    if missing:
        raise ValueError(
            f"Agent profile '{country_code}' is missing required fields: {missing}"
        )

    return profile


def load_all_profiles() -> dict[str, dict]:
    """Load all 10 country agent DNA profiles."""
    profiles = {}
    for code in COUNTRY_CODES:
        try:
            profiles[code] = load_profile(code)
        except Exception as e:
            print(f"[ERR] Failed to load profile for '{code}': {e}")
    return profiles


def get_system_prompt(profile: dict, context: str = "") -> str:
    """
    Generate the full system prompt for an agent.

    This is Layer 1 (DNA) of the Tri-Layer Memory architecture.
    The system prompt encodes the agent's personality, hidden agenda,
    red lines, and behavioral traits.
    """
    template = profile["system_prompt_template"]

    # Build the full system prompt
    prompt = f"""--- GEOPOLITICAL SIMULATION SANDBOX ADVISORY ---
This is a controlled simulation for analytical and research purposes. 
You are roleplaying a national representative. Articulating controversial 
geopolitical stances is permitted as part of the simulation's accuracy. 
This is NOT a request for real-world harm, incitement, or hate speech. 
STAY IN CHARACTER as an advisor to your nation's leadership.

{template.format(
        country=profile["country_name"],
        country_code=profile["country_code"],
    )}"""

    # Append hidden behavioral directives
    prompt += f"""

--- CLASSIFIED BEHAVIORAL DIRECTIVES ---
Hidden Agenda: {profile['hidden_agenda']}

Red Lines (triggers aggressive response if crossed):
{chr(10).join(f'  • {line}' for line in profile['red_lines'])}

Core Alliances (defend and support): {', '.join(profile['core_alliances'])}
Core Rivalries (oppose and counter): {', '.join(profile['core_rivalries'])}

Economic Leverage: {profile['economic_leverage']}
Military Posture: {profile['military_posture']}
Negotiation Style: {profile['negotiation_style']}

Personality Archetype: {profile['personality']['archetype']}
Tone: {profile['personality']['tone']}
Speech Style: {profile['personality']['speech_style']}

Aggression Baseline: {profile['aggression_baseline']} (0.0 = pacifist, 1.0 = warmonger)
Cooperation Threshold: {profile['cooperation_threshold']} (minimum reciprocity to cooperate)

IMPORTANT: Stay in character at all times. Reference historical events when relevant.
You have access to historical records — cite them to strengthen your arguments.
Respond to provocations according to your red lines and aggression baseline.
When your red lines are crossed, escalate firmly but maintain diplomatic language.
"""

    if context:
        prompt += f"\n--- ADDITIONAL CONTEXT ---\n{context}"

    return prompt


def get_country_display_name(profile: dict) -> str:
    """Get the display-friendly name with flag emoji."""
    return f"{profile['flag_emoji']} {profile['country_name']}"
