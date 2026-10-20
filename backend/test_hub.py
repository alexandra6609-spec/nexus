"""Hub API tests: SMS endpoint, token lookup, and ledger sync of tokens."""
import importlib
import json
import sqlite3
import time
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

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
    for body in ["hi", "3", "4"]:
        text(client, body, sender)
    reply = text(client, "1", sender)[0]
    return reply.split()[1].rstrip(".")


def ledger(client):
    return client.get("/v1/ledger").json()["entries"]


def sms_messages(client):
    import main

    with closing(main.storage.connect(main.DB_PATH)) as conn:
        return [
            dict(row)
            for row in conn.execute(
                "SELECT message_id, phone_hash, direction, body, reply_to, part "
                "FROM sms_messages ORDER BY seq"
            )
        ]


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


def test_inbound_sms_and_replies_are_recorded_without_raw_phone_number(client):
    text(client, "hi", "+15550001")
    messages = sms_messages(client)
    assert [message["direction"] for message in messages] == ["inbound", "outbound"]
    assert messages[0]["body"] == "hi"
    assert messages[1]["body"]
    assert messages[0]["message_id"]
    assert messages[1]["reply_to"] == messages[0]["message_id"]
    assert messages[0]["phone_hash"] == messages[1]["phone_hash"]
    assert "5550001" not in str(messages)


def test_retry_with_same_message_id_replays_reply_without_advancing_twice(client):
    payload = {"from": "+15550001", "text": "hi", "messageId": "phone-a-1"}
    first = client.post("/v1/sms/inbound", json=payload)
    retried = client.post("/v1/sms/inbound", json=payload)
    assert first.status_code == retried.status_code == 200
    assert first.json() == retried.json()
    assert len(sms_messages(client)) == 2
    assert "Any of these" in text(client, "1")[0]


def test_distinct_message_ids_record_repeated_text_as_separate_sms(client):
    for message_id in ["phone-a-1", "phone-a-2"]:
        response = client.post(
            "/v1/sms/inbound",
            json={"from": "+15550001", "text": "hi", "messageId": message_id},
        )
        assert response.status_code == 200
    inbound = [message for message in sms_messages(client) if message["direction"] == "inbound"]
    assert [(message["message_id"], message["body"]) for message in inbound] == [
        ("phone-a-1", "hi"),
        ("phone-a-2", "hi"),
    ]


def test_conversation_is_relayed_only_to_selected_clinic(client):
    text(client, "hi")
    area = client.post(
        "/v1/sms/inbound",
        json={"from": "+15550001", "text": "2", "messageId": "phone-a-area"},
    )
    retried = client.post(
        "/v1/sms/inbound",
        json={"from": "+15550001", "text": "2", "messageId": "phone-a-area"},
    )

    clinic_b = client.get("/v1/ledger", params={"clinic_id": "B"}).json()["entries"]
    clinic_a = client.get("/v1/ledger", params={"clinic_id": "A"}).json()["entries"]
    b_messages = [entry for entry in clinic_b if entry["kind"] == "sms.message"]
    a_messages = [entry for entry in clinic_a if entry["kind"] == "sms.message"]

    assert area.status_code == retried.status_code == 200
    assert area.json() == retried.json()
    assert len(b_messages) == 4
    assert [entry["data"]["direction"] for entry in b_messages] == [
        "inbound", "outbound", "inbound", "outbound",
    ]
    assert all(entry["clinicId"] == "B" for entry in b_messages)
    assert a_messages == []
    assert "5550001" not in str(b_messages)


def test_sms_events_are_hidden_when_sync_has_no_clinic_id(client):
    text(client, "hi")
    text(client, "2")
    entries = client.get("/v1/ledger").json()["entries"]
    assert not any(entry["kind"] == "sms.message" for entry in entries)


def test_reset_starts_a_new_clinic_scoped_conversation(client):
    text(client, "hi")
    text(client, "2")
    text(client, "RESET")
    text(client, "1")

    clinic_a = client.get("/v1/ledger", params={"clinic_id": "A"}).json()["entries"]
    clinic_b = client.get("/v1/ledger", params={"clinic_id": "B"}).json()["entries"]
    a_messages = [entry for entry in clinic_a if entry["kind"] == "sms.message"]
    b_messages = [entry for entry in clinic_b if entry["kind"] == "sms.message"]
    assert len(a_messages) == len(b_messages) == 4
    assert {entry["clinicId"] for entry in a_messages} == {"A"}
    assert {entry["clinicId"] for entry in b_messages} == {"B"}


def test_local_gateway_relays_queued_messages_when_upstream_is_reachable(client, monkeypatch):
    import main

    text(client, "hi")
    text(client, "2")
    received = []

    class Receiver(BaseHTTPRequestHandler):
        def do_POST(self):
            size = int(self.headers["Content-Length"])
            payload = json.loads(self.rfile.read(size))
            received.extend(payload["entries"])
            response = json.dumps({"ids": [entry["id"] for entry in payload["entries"]]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

        def log_message(self, _format, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Receiver)
    thread = Thread(target=server.serve_forever)
    thread.start()
    monkeypatch.setattr(
        main, "UPSTREAM_URL", f"http://127.0.0.1:{server.server_port}"
    )
    try:
        assert main.relay_once() > 0
        assert main.relay_once() == 0
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

    sms = [entry for entry in received if entry["kind"] == "sms.message"]
    assert len(sms) == 4
    assert all(entry["clinicId"] == "B" for entry in sms)


def test_existing_hub_database_gets_sms_conversation_column(tmp_path):
    database = tmp_path / "old-hub.db"
    with sqlite3.connect(database) as conn:
        conn.execute(
            "CREATE TABLE sms_messages ("
            "seq INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, "
            "phone_hash TEXT NOT NULL, direction TEXT NOT NULL, body TEXT NOT NULL, "
            "created_at INTEGER NOT NULL, reply_to TEXT, part INTEGER NOT NULL DEFAULT 0, "
            "UNIQUE (message_id, direction, part))"
        )

    import main

    main.storage.init(str(database))
    with sqlite3.connect(database) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(sms_messages)")}
    assert "conversation_id" in columns


def test_message_id_cannot_be_reused_for_different_sms(client):
    first = client.post(
        "/v1/sms/inbound",
        json={"from": "+15550001", "text": "hi", "messageId": "phone-a-1"},
    )
    conflict = client.post(
        "/v1/sms/inbound",
        json={"from": "+15550001", "text": "3", "messageId": "phone-a-1"},
    )
    assert first.status_code == 200
    assert conflict.status_code == 409
    assert len(sms_messages(client)) == 2


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
    assert pulled[0]["lc"] > 41


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
