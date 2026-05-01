"""Drift scoring — assumption correction rate."""
from typing import Sequence


def compute_drift_score(drift_events: list[dict]) -> int:
    """Return drift correction rate as a percentage (0–100)."""
    if not drift_events:
        return 100
    corrected = sum(1 for e in drift_events if e.get("data", {}).get("corrected"))
    return round((corrected / len(drift_events)) * 100)
