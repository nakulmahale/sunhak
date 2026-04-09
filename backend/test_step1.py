"""Quick validation of agent profiles and blackboard state."""
import sys
import io

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from agents.profiles import load_all_profiles, get_system_prompt
from blackboard.state import create_initial_state

# Test 1: Load all profiles
print("=" * 50)
print("TEST 1: Loading Agent Profiles")
print("=" * 50)
profiles = load_all_profiles()
print(f"Loaded {len(profiles)} profiles\n")

for code, profile in profiles.items():
    print(f"  {profile['flag_emoji']}  {profile['country_name']} ({code.upper()})")
    print(f"     Archetype: {profile['personality']['archetype']}")
    print(f"     Aggression: {profile['aggression_baseline']}")
    print(f"     Alliances: {', '.join(profile['core_alliances'])}")
    print(f"     Rivalries: {', '.join(profile['core_rivalries'])}")
    print()

# Test 2: Generate a system prompt
print("=" * 50)
print("TEST 2: System Prompt Generation (USA)")
print("=" * 50)
usa_prompt = get_system_prompt(profiles["usa"])
print(usa_prompt[:500] + "...")

# Test 3: Initial state
print("\n" + "=" * 50)
print("TEST 3: Blackboard Initial State")
print("=" * 50)
state = create_initial_state()
print(f"Keys: {list(state.keys())}")
print(f"Debate status: {state['debate_status']}")
print(f"Agents tracked: {list(state['aggression_scores'].keys())}")

print("\n[ALL TESTS PASSED]")
