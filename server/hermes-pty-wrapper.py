#!/usr/bin/env python3
"""
Hermes PTY wrapper for GRIP server.
Spawns Hermes in a pseudo-terminal so it works without a real TTY.
Usage: python3 hermes-pty-wrapper.py "query text" [toolsets] [provider]
"""
import sys
import os
import pty
import select
import time
import fcntl
import struct
import termios
import signal

def spawn_hermes(query: str, toolsets: str = "terminal,file,web,search,skills", 
                  provider: str = "minimax", timeout_ms: int = 120_000) -> str:
    env = {
        **os.environ,
        "HERMES_HOME": os.environ.get("HERMES_HOME", "/root/.hermes"),
        "TERM": os.environ.get("TERM", "xterm-256color"),
    }
    
    # Build hermes command
    hermes_bin = "/root/.local/bin/hermes"
    args = [
        hermes_bin, "chat",
        "-q", query,
        "--provider", provider,
        "-t", toolsets,
        "-Q",  # quiet mode
        "--source", "grip",
    ]
    
    # Create PTY pair
    master_fd, slave_fd = pty.openpty()
    
    # Set terminal size
    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
    
    pid = os.fork()
    
    if pid == 0:
        # Child process
        os.close(master_fd)
        
        # Create new session and set controlling terminal
        os.setsid()
        fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
        
        # Redirect stdin/stdout/stderr to slave PTY
        os.dup2(slave_fd, 0)
        os.dup2(slave_fd, 1)
        os.dup2(save_fd, 2)
        
        os.close(slave_fd)
        
        # Change to hermes home
        os.chdir(env.get("HERMES_HOME", "/root/.hermes"))
        
        os.execv(hermes_bin, [hermes_bin] + args)
        os._exit(1)
    
    # Parent process
    os.close(slave_fd)
    
    # Set master_fd to non-blocking
    flags = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
    
    # Read output until "session_id:" appears (quiet mode completion marker)
    output_parts = []
    start_time = time.time()
    timeout_sec = timeout_ms / 1000
    
    # Wait for session_id line which indicates completion
    session_id_received = False
    final_response_lines = []
    in_response = False
    
    while True:
        elapsed = time.time() - start_time
        if elapsed > timeout_sec:
            os.close(master_fd)
            os.waitpid(pid, 0)
            raise TimeoutError(f"Hermes timed out after {timeout_sec}s")
        
        # Check if process exited
        result = os.waitpid(pid, os.WNOHANG)
        if result[0] != 0:
            # Process exited, drain remaining output
            while True:
                r, _, _ = select.select([master_fd], [], [], 0.1)
                if not r:
                    break
                try:
                    data = os.read(master_fd, 4096)
                    if data:
                        output_parts.append(data.decode('utf-8', errors='replace'))
                except OSError:
                    break
            os.close(master_fd)
            break
        
        # Read available data
        r, _, _ = select.select([master_fd], [], [], 0.5)
        if master_fd in r:
            try:
                data = os.read(master_fd, 4096)
                if data:
                    text = data.decode('utf-8', errors='replace')
                    output_parts.append(text)
                    # Track if we've seen the session_id line
                    if "session_id:" in text:
                        session_id_received = True
            except OSError:
                break
    
    os.close(master_fd)
    
    full_output = ''.join(output_parts)
    
    # Extract final response (between "session_id:" markers or just after last output)
    # In quiet mode: the final response is printed, then "session_id: <id>"
    # We want everything BEFORE "session_id:"
    lines = full_output.split('\n')
    response_lines = []
    for line in lines:
        if 'session_id:' in line:
            break
        response_lines.append(line)
    
    return '\n'.join(response_lines).strip()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 hermes-pty-wrapper.py 'query' [toolsets] [provider]")
        sys.exit(1)
    
    query = sys.argv[1]
    toolsets = sys.argv[2] if len(sys.argv) > 2 else "terminal,file,web,search,skills"
    provider = sys.argv[3] if len(sys.argv) > 3 else "minimax"
    
    try:
        result = spawn_hermes(query, toolsets, provider)
        print(result)
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
