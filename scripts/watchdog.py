#!/usr/bin/env python3
"""
Container health watchdog script.
Monitors the agent-os container health endpoint and restarts the container on crash loops.
"""

import logging
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

# Configuration
HEALTH_URL = "http://localhost:9120/health"
POLL_INTERVAL = 30  # seconds
FAIL_THRESHOLD = 3
DOCKER_COMPOSE_PATH = "/opt/data/hermes-sync/projects/agent-os/docker-compose.yml"
LOG_PATH = "/opt/data/hermes-sync/projects/agent-os/logs/watchdog.log"

# Setup logging
log_path = Path(LOG_PATH)
log_path.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# Shutdown flag
shutdown_requested = False


def handle_sigterm(signum, frame):
    """Handle SIGTERM gracefully."""
    global shutdown_requested
    logger.info("Received SIGTERM, shutting down gracefully...")
    shutdown_requested = True


def check_health():
    """Check the health endpoint. Returns True if healthy, False otherwise."""
    try:
        request = Request(HEALTH_URL, method="GET")
        with urlopen(request, timeout=10) as response:
            return response.status == 200
    except (URLError, TimeoutError, OSError) as e:
        logger.warning(f"Health check failed: {e}")
        return False


def restart_container():
    """Restart the agent-os container using docker compose."""
    logger.info("Restarting agent-os container...")
    try:
        subprocess.run(
            ["docker", "compose", "-f", DOCKER_COMPOSE_PATH, "restart"],
            check=True,
            capture_output=True,
            text=True,
        )
        logger.info("Container restarted successfully")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to restart container: {e.stderr}")
        return False


def main():
    """Main watchdog loop."""
    global shutdown_requested

    # Register signal handlers
    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)

    logger.info("Watchdog started")
    logger.info(f"Monitoring {HEALTH_URL} every {POLL_INTERVAL}s")
    logger.info(f"Will restart after {FAIL_THRESHOLD} consecutive failures")

    consecutive_failures = 0

    while not shutdown_requested:
        if check_health():
            if consecutive_failures > 0:
                logger.info("Health check restored")
            consecutive_failures = 0
        else:
            consecutive_failures += 1
            logger.warning(f"Health check failed ({consecutive_failures}/{FAIL_THRESHOLD})")

            if consecutive_failures >= FAIL_THRESHOLD:
                logger.error(f"{FAIL_THRESHOLD} consecutive failures, initiating restart")
                if restart_container():
                    consecutive_failures = 0
                else:
                    logger.error("Restart failed, will retry on next cycle")

        # Poll with sleep, checking for shutdown periodically
        for _ in range(POLL_INTERVAL):
            if shutdown_requested:
                break
            time.sleep(1)

    logger.info("Watchdog stopped")


if __name__ == "__main__":
    main()
