"""Clinic hub: a small FastAPI service the tablets sync with when a link exists.

Run:  uvicorn main:app --host 0.0.0.0 --port 8000
The tablets never wait on this. It only collects and hands out ledger entries.
"""
import hashlib
import json
import logging
import os
import secrets
import time
import urllib.error
import urllib.request
from contextlib import asynccontextmanager
from contextlib import closing
from typing import Literal, Optional

import asyncio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

import storage
import triage

DB_PATH = os.environ.get("NEXUS_DB", "nexus_hub.db")
ORIGINS = os.environ.get(
    "NEXUS_CORS", "http://localhost:3000,http://localhost:3001"
).split(",")

# Signs SMS token check letters and hashes phone numbers. Set it per deployment.
SECRET = os.environ.get("NEXUS_SECRET", "dev-only-change-me")
RULES_PATH = os.environ.get("NEXUS_TRIAGE_RULES")
TRIAGE_RULES = triage.load_rules(RULES_PATH) if RULES_PATH else triage.load_rules()
HUB_DEVICE = "sms-hub"
UPSTREAM_URL = os.environ.get("NEXUS_UPSTREAM_URL", "").rstrip("/")
RELAY_INTERVAL_SECONDS = max(
    1, int(os.environ.get("NEXUS_RELAY_INTERVAL_SECONDS", "1"))
)
RELAY_BATCH_SIZE = 5
logger = logging.getLogger(__name__)

storage.init(DB_PATH)


def relay_once() -> int:
    """Forward one durable page to the upstream hub, advancing only on ACK."""
    if not UPSTREAM_URL:
        return 0
    with closing(storage.connect(DB_PATH)) as conn:
        cursor = storage.get_relay_cursor(conn, UPSTREAM_URL)
        entries, next_cursor, _ = storage.entries_after(
            conn, cursor, RELAY_BATCH_SIZE, clinic_id="__relay__"
        )
    if not entries:
        return 0

    payload = json.dumps({"entries": entries}, separators=(",", ":")).encode()
    request = urllib.request.Request(
        f"{UPSTREAM_URL}/v1/ledger",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=4) as response:
        result = json.loads(response.read())
    accepted = set(result.get("ids", []))
    expected = {entry["id"] for entry in entries}
    if not expected.issubset(accepted):
        raise RuntimeError("Upstream did not acknowledge every relayed ledger entry")

    with closing(storage.connect(DB_PATH)) as conn:
        storage.set_relay_cursor(conn, UPSTREAM_URL, next_cursor)
    return len(entries)


async def relay_upstream() -> None:
    while True:
        try:
            forwarded = await asyncio.to_thread(relay_once)
            if forwarded:
                logger.info("Relayed %s ledger entries upstream", forwarded)
        except (OSError, urllib.error.URLError, ValueError, RuntimeError):
            logger.warning("Upstream relay failed; local entries remain queued", exc_info=True)
        await asyncio.sleep(RELAY_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(relay_upstream()) if UPSTREAM_URL else None
    try:
        yield
    finally:
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="Nexus Care clinic hub", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class Entry(BaseModel):
    # Field names match the TypeScript LedgerEntry exactly.
    id: str = Field(min_length=1, max_length=64)
    clinicId: str = Field(min_length=1, max_length=16)
    device: str = Field(min_length=1, max_length=32)
    lc: int = Field(ge=0)
    ts: int = Field(ge=0)
    kind: Literal[
        "stock.declared", "transfer.requested", "transfer.status",
        "triage.token", "triage.arrived", "alert.emergency", "supply.transferred",
        "sms.message",
    ]
    data: dict

    @field_validator("data")
    @classmethod
    def small_payload(cls, value: dict) -> dict:
        limit = 12_000 if value.get("direction") in ("inbound", "outbound") else 4096
        if len(json.dumps(value)) > limit:
            raise ValueError("data too large")
        return value


class PushBody(BaseModel):
    entries: list[Entry] = Field(max_length=500)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/v1/ledger")
def push(body: PushBody) -> dict:
    """Idempotent: re-sending the same entries is safe."""
    with closing(storage.connect(DB_PATH)) as conn:
        ids = storage.insert_entries(conn, [e.model_dump() for e in body.entries])
    return {"ids": ids}


@app.get("/v1/alerts")
def recent_alerts(minutes: int = Query(30, ge=1, le=240)) -> dict:
    """Only the emergency alerts of the last few minutes: a few hundred bytes."""
    since = int(time.time() * 1000) - minutes * 60_000
    with closing(storage.connect(DB_PATH)) as conn:
        return {"entries": storage.recent_entries(conn, "alert.emergency", since)}


@app.get("/v1/ledger")
def pull(
    after: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    exclude_device: str = "",
    clinic_id: str = Query("", max_length=16),
) -> dict:
    """Entries newer than the cursor; private SMS text goes only to its clinic."""
    with closing(storage.connect(DB_PATH)) as conn:
        entries, cursor, more = storage.entries_after(
            conn, after, limit, exclude_device, clinic_id
        )
    return {"entries": entries, "cursor": cursor, "more": more}


# ------------------------------------------------------------- SMS triage

PHONE_PAGE = triage.Path(__file__).with_name("static") / "sms.html"


@app.get("/sms", include_in_schema=False)
def phone_page() -> FileResponse:
    """Demo patient phone, kept apart from the clinic app. Open it from any LAN device."""
    return FileResponse(PHONE_PAGE)


class InboundSms(BaseModel):
    # Same shape a modem daemon or SMS gateway webhook will post later.
    sender: str = Field(alias="from", min_length=3, max_length=32)
    text: str = Field(max_length=1600)
    message_id: Optional[str] = Field(
        default=None, alias="messageId", min_length=1, max_length=128
    )


def _issue_code(conn, prefix: str, now_ms: int) -> str:
    """A fresh code that no unexpired token is using."""
    for _ in range(50):
        code = triage.make_token(prefix, SECRET)
        if not storage.code_in_use(conn, code, now_ms):
            return code
    raise RuntimeError("No free token codes")


@app.post("/v1/sms/inbound")
def sms_inbound(body: InboundSms) -> dict:
    """Record one incoming SMS and its replies atomically; retries are idempotent."""
    now_ms = int(time.time() * 1000)
    phone = triage.hash_phone(body.sender, SECRET)
    message_id = body.message_id or secrets.token_urlsafe(18)
    with closing(storage.connect(DB_PATH)) as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            previous = conn.execute(
                "SELECT phone_hash, body FROM sms_messages "
                "WHERE message_id = ? AND direction = 'inbound' AND part = 0",
                (message_id,),
            ).fetchone()
            if previous:
                if previous["phone_hash"] != phone or previous["body"] != body.text:
                    raise HTTPException(status_code=409, detail="SMS messageId was already used")
                replies = [
                    row["body"]
                    for row in conn.execute(
                        "SELECT body FROM sms_messages "
                        "WHERE reply_to = ? AND direction = 'outbound' ORDER BY part",
                        (message_id,),
                    )
                ]
                conn.commit()
                return {"messageId": message_id, "replies": replies}

            session = storage.get_session(conn, phone)
            previous_clinic = session.get("clinic") if session else None
            reset_conversation = body.text.strip().upper() == "RESET"
            expired_conversation = session is not None and (
                (
                    session.get("step") == "done"
                    and now_ms >= session.get("expires_at", 0)
                )
                or now_ms - session.get("updated", now_ms)
                > TRIAGE_RULES["session_minutes"] * 60_000
            )
            conversation_id = (
                session.get("conversation_id")
                if session and not reset_conversation and not expired_conversation
                else None
            ) or message_id
            session, replies, outcome = triage.step(
                TRIAGE_RULES, session, body.text, now_ms,
                lambda prefix: _issue_code(conn, prefix, now_ms),
            )
            if session is not None:
                session["conversation_id"] = conversation_id
            conn.execute(
                "INSERT INTO sms_messages "
                "(message_id, conversation_id, phone_hash, direction, body, created_at) "
                "VALUES (?, ?, ?, 'inbound', ?, ?)",
                (message_id, conversation_id, phone, body.text, now_ms),
            )
            conn.executemany(
                "INSERT INTO sms_messages "
                "(message_id, conversation_id, phone_hash, direction, body, created_at, reply_to, part) "
                "VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?)",
                [
                    (message_id, conversation_id, phone, reply, now_ms, message_id, part)
                    for part, reply in enumerate(replies)
                ],
            )
            target_clinic = (
                (session or {}).get("clinic")
                or (outcome or {}).get("clinic")
                or (
                    previous_clinic
                    if not reset_conversation and not expired_conversation
                    else None
                )
            )
            if target_clinic:
                conversation_messages = conn.execute(
                    "SELECT * FROM sms_messages WHERE conversation_id = ? ORDER BY seq",
                    (conversation_id,),
                ).fetchall()
                for message in conversation_messages:
                    event_key = (
                        f"{message['message_id']}:{message['direction']}:{message['part']}"
                    )
                    event_id = f"sms-{hashlib.sha256(event_key.encode()).hexdigest()[:32]}"
                    event_data = {
                        "conversationId": conversation_id,
                        "messageId": message["message_id"],
                        "replyTo": message["reply_to"],
                        "phoneHash": phone,
                        "direction": message["direction"],
                        "part": message["part"],
                        "body": message["body"],
                    }
                    conn.execute(
                        "INSERT OR IGNORE INTO ledger "
                        "(id, clinic_id, device, lc, ts, kind, data) "
                        "VALUES (?, ?, ?, ?, ?, 'sms.message', ?)",
                        (
                            event_id, target_clinic, HUB_DEVICE,
                            storage.next_lamport(conn), message["created_at"],
                            json.dumps(event_data, separators=(",", ":")),
                        ),
                    )
            if outcome:
                entry = {
                    "id": f"{HUB_DEVICE}-{now_ms:x}-{secrets.token_hex(2)}",
                    "clinicId": outcome["clinic"] or "*",  # "*": any clinic may see it
                    "device": HUB_DEVICE,
                    "lc": storage.next_lamport(conn),
                    "ts": now_ms,
                    "kind": "triage.token",
                    "data": {**outcome, "phoneHash": phone},
                }
                conn.execute(
                    "INSERT OR IGNORE INTO ledger "
                    "(id, clinic_id, device, lc, ts, kind, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        entry["id"], entry["clinicId"], entry["device"], entry["lc"],
                        entry["ts"], entry["kind"],
                        json.dumps(entry["data"], separators=(",", ":")),
                    ),
                )
            if session is None:
                conn.execute("DELETE FROM sms_sessions WHERE phone_hash = ?", (phone,))
            else:
                conn.execute(
                    "INSERT INTO sms_sessions (phone_hash, state, updated_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(phone_hash) DO UPDATE SET state = excluded.state, "
                    "updated_at = excluded.updated_at",
                    (phone, json.dumps(session, separators=(",", ":")), now_ms),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return {"messageId": message_id, "replies": replies}


@app.get("/v1/tokens/{code}")
def token_lookup(code: str) -> dict:
    """Check a code shown at the desk. The check letter catches typos and guesses."""
    code = triage.normalize_token(code)
    if not triage.verify_token(code, SECRET):
        raise HTTPException(status_code=404, detail="Not a valid code")
    with closing(storage.connect(DB_PATH)) as conn:
        token = storage.find_token(conn, code)
    if not token:
        raise HTTPException(status_code=404, detail="No token with this code")
    token.pop("phoneHash", None)
    return token
