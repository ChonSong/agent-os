from observability.events import AIEEvent, EventType
from observability.drift import compute_drift_score


def test_aie_event_serialization():
    evt = AIEEvent(type=EventType.DELEGATION, data={"session": "test"})
    d = evt.to_dict()
    assert d["type"] == "delegation"
    assert d["data"]["session"] == "test"


def test_drift_score_empty():
    assert compute_drift_score([]) == 100


def test_drift_score_partial_correction():
    events = [
        {"data": {"corrected": True}},
        {"data": {"corrected": False}},
        {"data": {"corrected": True}},
    ]
    assert compute_drift_score(events) == 67
