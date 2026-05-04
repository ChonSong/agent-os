"""
agent-core — runs nanobot serve as a sidecar HTTP service.

Usage:
    python -m agent_core.service
"""
import argparse
import subprocess
import sys
import os

def main():
    parser = argparse.ArgumentParser(description="agent-core nanobot sidecar")
    parser.add_argument("--port", type=int, default=8900)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--workspace", default=os.environ.get("NANOBOT_WORKSPACE", "/opt/data/nanobot_workspace"))
    args = parser.parse_args()

    # Ensure workspace exists
    os.makedirs(args.workspace, exist_ok=True)

    cmd = [
        sys.executable, "-m", "nanobot", "serve",
        "--host", args.host,
        "--port", str(args.port),
    ]

    print(f"[agent-core] Starting nanobot serve: {' '.join(cmd)}")
    print(f"[agent-core] Workspace: {args.workspace}")

    env = os.environ.copy()
    env["NANOBOT_WORKSPACE"] = args.workspace

    proc = subprocess.Popen(cmd, env=env)
    try:
        proc.wait()
    except KeyboardInterrupt:
        print("[agent-core] Shutting down...")
        proc.terminate()
        proc.wait()

if __name__ == "__main__":
    main()
