import asyncio
from graph.nodes import pulse_node, relevance_node, speaker_node
from blackboard.state import create_initial_state

async def test_nodes():
    print("Running pulse_node...")
    state = create_initial_state()
    pulse_out = await pulse_node(state)
    state.update(pulse_out)
    print("Pulse output Keys:", pulse_out.keys())
    
    print("\nRunning relevance_node...")
    rel_out = await relevance_node(state)
    state.update(rel_out)
    print("Relevance output:", rel_out["agent_scores"])
    
    print("\nRunning speaker_node...")
    speaker_out = await speaker_node(state)
    print("Speaker output:", speaker_out.keys())
    if "messages" in speaker_out:
        print("Speaker:", speaker_out["messages"][0].name)
        print("Message:", speaker_out["messages"][0].content)

if __name__ == "__main__":
    asyncio.run(test_nodes())
