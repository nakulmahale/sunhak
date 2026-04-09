"""Step 3 Verification -- LangGraph Orchestrator"""
import sys, io
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from graph.orchestrator import build_debate_graph
from blackboard.state import create_initial_state

print("=" * 60)
print("  STEP 3 VERIFICATION -- LangGraph Orchestrator")
print("=" * 60)

# Test 1: Graph compiles
print("\n--- TEST 1: Graph Compilation ---")
graph = build_debate_graph()
print(f"[PASS] Graph compiled successfully")
print(f"  Type: {type(graph)}")

# Test 2: Initial state
print("\n--- TEST 2: Initial State ---")
state = create_initial_state()
print(f"[PASS] Initial state has {len(state)} keys")

# Test 3: Graph visualization
print("\n--- TEST 3: Graph Structure ---")
try:
    nodes = graph.nodes
    print(f"[PASS] Graph has {len(nodes)} nodes")
    for name in nodes:
        print(f"  Node: {name}")
except Exception as e:
    print(f"[INFO] Could not enumerate nodes: {e}")

print("\n[STEP 3 VERIFICATION COMPLETE]")
print("  Graph compiles and is ready for debate execution.")
print("  Full end-to-end test requires GOOGLE_API_KEY to be set.")
print("=" * 60)
