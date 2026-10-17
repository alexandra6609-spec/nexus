"""Clinic hub: a small FastAPI service the tablets sync with when a link exists.

Run:  uvicorn main:app --host 0.0.0.0 --port 8000
The tablets never wait on this. It only collects and hands out ledger entries.
"""
import json
import os
import secrets
import time
from contextlib import closing
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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

storage.init(DB_PATH)

app = FastAPI(title="Nexus Care clinic hub")
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
        "triage.token", "triage.arrived",
    ]
    data: dict

    @field_validator("data")
    @classmethod
    def small_payload(cls, value: dict) -> dict:
        if len(json.dumps(value)) > 4096:
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


@app.get("/v1/ledger")
def pull(
    after: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    exclude_device: str = "",
) -> dict:
    """Entries newer than the caller's cursor, minus the ones it wrote itself."""
    with closing(storage.connect(DB_PATH)) as conn:
        entries, cursor, more = storage.entries_after(conn, after, limit, exclude_device)
    return {"entries": entries, "cursor": cursor, "more": more}


# ------------------------------------------------------------- SMS triage

class InboundSms(BaseModel):
    # Same shape a modem daemon or SMS gateway webhook will post later.
    sender: str = Field(alias="from", min_length=3, max_length=32)
    text: str = Field(max_length=1600)


def _issue_code(conn, prefix: str, now_ms: int) -> str:
    """A fresh code that no unexpired token is using."""
    for _ in range(50):
        code = triage.make_token(prefix, SECRET)
        if not storage.code_in_use(conn, code, now_ms):
            return code
    raise RuntimeError("No free token codes")


@app.post("/v1/sms/inbound")
def sms_inbound(body: InboundSms) -> dict:
    """One incoming SMS in, the SMS replies out. Tokens land in the ledger."""
    now_ms = int(time.time() * 1000)
    phone = triage.hash_phone(body.sender, SECRET)
    with closing(storage.connect(DB_PATH)) as conn:
        session = storage.get_session(conn, phone)
        session, replies, outcome = triage.step(
            TRIAGE_RULES, session, body.text, now_ms,
            lambda prefix: _issue_code(conn, prefix, now_ms),
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
            storage.insert_entries(conn, [entry])
        storage.save_session(conn, phone, session, now_ms)
    return {"replies": replies}


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
