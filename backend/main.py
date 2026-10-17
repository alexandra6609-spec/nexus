"""Clinic hub: a small FastAPI service the tablets sync with when a link exists.

Run:  uvicorn main:app --host 0.0.0.0 --port 8000
The tablets never wait on this. It only collects and hands out ledger entries.
"""
import json
import os
from contextlib import closing
from typing import Literal

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

import storage

DB_PATH = os.environ.get("NEXUS_DB", "nexus_hub.db")
ORIGINS = os.environ.get("NEXUS_CORS", "http://localhost:3000").split(",")

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
    kind: Literal["stock.declared", "transfer.requested", "transfer.status"]
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
