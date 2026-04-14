#!/usr/bin/env python3
"""
Direct Hermes Agent caller for GRIP server.
Bypasses the CLI TTY requirement by calling AIAgent directly.
"""
import sys
import os
import json
import signal

# Set up path before any hermes imports
sys.path.insert(0, '/root/.hermes/hermes-agent')
os.environ['HERMES_HOME'] = '/root/.hermes'

def main():
    # Read query from stdin or args
    if len(sys.argv) > 1:
        query = sys.argv[1]
    else:
        query = sys.stdin.read().strip()
    
    if not query:
        print("Error: No query provided", file=sys.stderr)
        sys.exit(1)
    
    # Parse optional toolsets
    toolsets = ['terminal', 'file', 'web', 'search', 'skills']
    if len(sys.argv) > 2:
        toolsets = [t.strip() for t in sys.argv[2].split(',')]
    
    provider = 'minimax-portal'
    if len(sys.argv) > 3:
        provider = sys.argv[3]
    
    try:
        from run_agent import AIAgent
        
        agent = AIAgent(
            provider=provider,
            model='MiniMax-M2.7',
            enabled_toolsets=toolsets,
            quiet_mode=True,
            verbose_logging=False,
            max_iterations=30,
        )
        
        result = agent.run_conversation(
            user_message=query,
            conversation_history=[],
        )
        
        if isinstance(result, dict):
            response = result.get('final_response', '')
            if response:
                print(response)
            else:
                print(json.dumps(result, indent=2))
        else:
            print(str(result))
        
        sys.exit(0)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
