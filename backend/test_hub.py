"""Hub API tests: SMS endpoint, token lookup, and ledger sync of tokens."""
import importlib
import time

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXUS_DB", str(tmp_path / "hub.db"))
    monkeypatch.setenv("NEXUS_SECRET", "test-secret")
    import main
    importlib.reload(main)
    return TestClient(main.app)


def text(client, body, sender="+15550001"):
    response = client.post("/v1/sms/inbound", json={"from": sender, "text": body})
    assert response.status_code == 200
    return response.json()["replies"]


def red_code(client, sender="+15550001"):
    for body in ["hi", "3"]:
        text(client, body, sender)
    reply = text(client, "4", sender)[0]
    return reply.split()[1].rstrip(".")


def ledger(client):
    return client.get("/v1/ledger").json()["entries"]


def test_red_token_lands_in_ledger_without_phone_number(client):
    code = red_code(client)
    tokens = [e for e in ledger(client) if e["kind"] == "triage.token"]
    assert len(tokens) == 1
    entry = tokens[0]
    assert entry["clinicId"] == "C" and entry["device"] == "sms-hub"
    assert entry["data"]["code"] == code and entry["data"]["level"] == "RED"
    assert "5550001" not in str(entry)


def test_repeat_messages_do_not_create_duplicate_tokens(client):
    code = red_code(client)
    for _ in range(3):
        assert code in text(client, "hello?")[0]
    assert sum(e["kind"] == "triage.token" for e in ledger(client)) == 1


def test_token_lookup(client):
    code = red_code(client)
    token = client.get(f"/v1/tokens/{code.lower()}").json()
    assert token["code"] == code and token["arrived"] is None
    assert "phoneHash" not in token
    assert client.get("/v1/tokens/RED-000A").status_code == 404


def test_arrival_from_a_tablet_is_seen_by_lookup(client):
    code = red_code(client)
    token = client.get(f"/v1/tokens/{code}").json()
    arrival = {
        "id": "tab1-1-abcd", "clinicId": "C", "device": "tab1", "lc": 99, "ts": 5,
        "kind": "triage.arrived", "data": {"tokenId": token["id"], "code": code},
    }
    assert client.post("/v1/ledger", json={"entries": [arrival]}).status_code == 200
    assert client.get(f"/v1/tokens/{code}").json()["arrived"]["clinicId"] == "C"


def test_hub_entries_reach_tablets_and_lamport_moves_forward(client):
    old = {
        "id": "tab1-1-x", "clinicId": "A", "device": "tab1", "lc": 41, "ts": 1,
        "kind": "transfer.requested", "data": {"from": "A", "to": "B", "reason": "x"},
    }
    client.post("/v1/ledger", json={"entries": [old]})
    red_code(client)
    pulled = client.get("/v1/ledger", params={"exclude_device": "tab1"}).json()["entries"]
    assert [e["kind"] for e in pulled] == ["triage.token"]
    assert pulled[0]["lc"] == 42


def test_emergency_alert_is_available_on_alert_and_ledger_routes(client):
    alert = {
        "id": "tab1-1-alert",
        "clinicId": "A",
        "device": "tab1",
        "lc": 1,
        "ts": int(time.time() * 1000),
        "kind": "alert.emergency",
        "data": {
            "alert": "crisis",
            "resource": "oxygen",
            "casualties": None,
            "note": "",
        },
    }
    assert client.post("/v1/ledger", json={"entries": [alert]}).status_code == 200
    assert client.get("/v1/ledger").json()["entries"] == [alert]
    assert client.get("/v1/alerts", params={"minutes": 240}).json()["entries"] == [alert]


def test_supply_transfer_entry_is_accepted_and_synced(client):
    transfer = {
        "id": "tab1-supply-1",
        "clinicId": "A",
        "device": "tab1",
        "lc": 1,
        "ts": 1,
        "kind": "supply.transferred",
        "data": {
            "from": "A",
            "to": "B",
            "resource": "oxygen",
            "quantity": 1,
            "requestId": "request-1",
        },
    }
    assert client.post("/v1/ledger", json={"entries": [transfer]}).status_code == 200
    assert transfer in ledger(client)


def test_separate_phones_have_separate_sessions(client):
    text(client, "hi", "+1111")
    text(client, "hi", "+2222")
    assert "Any of these" in text(client, "1", "+1111")[0]
    assert "Any of these" in text(client, "2", "+2222")[0]


def test_phone_page_is_served_by_the_hub(client):
    response = client.get("/sms")
    assert response.status_code == 200
    assert "v1/sms/inbound" in response.text
