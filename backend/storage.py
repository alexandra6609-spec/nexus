"""SQLite storage for the clinic hub. Standard library only.

WAL + synchronous=NORMAL keeps disk writes few and cheap, which suits a
solar-powered Raspberry Pi. Entries are immutable and unique by id, so
inserting the same entry twice is a no-op.
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import closing

SCHEMA = """
CREATE TABLE IF NOT EXISTS ledger (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,  -- hub arrival order = pull cursor
  id        TEXT NOT NULL UNIQUE,
  clinic_id TEXT NOT NULL,
  device    TEXT NOT NULL,
  lc        INTEGER NOT NULL,
  ts        INTEGER NOT NULL,
  kind      TEXT NOT NULL,
  data      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_device ON ledger(device);

-- One row per patient phone (hashed) while an SMS conversation is open.
CREATE TABLE IF NOT EXISTS sms_sessions (
  phone_hash TEXT PRIMARY KEY,
  state      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
"""


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init(path: str) -> None:
    with closing(connect(path)) as conn:
        conn.executescript(SCHEMA)


def insert_entries(conn: sqlite3.Connection, entries: list[dict]) -> list[str]:
    """Store entries (duplicates ignored). Returns every id the hub now has."""
    rows = [
        (e["id"], e["clinicId"], e["device"], e["lc"], e["ts"], e["kind"],
         json.dumps(e["data"], separators=(",", ":")))
        for e in entries
    ]
    with conn:  # one transaction
        conn.executemany(
            "INSERT OR IGNORE INTO ledger (id, clinic_id, device, lc, ts, kind, data) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
    return [e["id"] for e in entries]


def entries_after(
    conn: sqlite3.Connection, after: int, limit: int, exclude_device: str = ""
) -> tuple[list[dict], int, bool]:
    """Entries that arrived after cursor `after`, oldest first."""
    rows = conn.execute(
        "SELECT * FROM ledger WHERE seq > ? AND device != ? ORDER BY seq LIMIT ?",
        (after, exclude_device, limit + 1),
    ).fetchall()
    more = len(rows) > limit
    rows = rows[:limit]
    entries = [
        {
            "id": r["id"], "clinicId": r["clinic_id"], "device": r["device"],
            "lc": r["lc"], "ts": r["ts"], "kind": r["kind"],
            "data": json.loads(r["data"]),
        }
        for r in rows
    ]
    cursor = rows[-1]["seq"] if rows else after
    return entries, cursor, more


# ------------------------------------------------------------- SMS triage

def get_session(conn: sqlite3.Connection, phone_hash: str) -> dict | None:
    row = conn.execute(
        "SELECT state FROM sms_sessions WHERE phone_hash = ?", (phone_hash,)
    ).fetchone()
    return json.loads(row["state"]) if row else None


def save_session(conn: sqlite3.Connection, phone_hash: str, state: dict | None, now_ms: int) -> None:
    with conn:
        if state is None:
            conn.execute("DELETE FROM sms_sessions WHERE phone_hash = ?", (phone_hash,))
        else:
            conn.execute(
                "INSERT INTO sms_sessions (phone_hash, state, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(phone_hash) DO UPDATE SET state = excluded.state, "
                "updated_at = excluded.updated_at",
                (phone_hash, json.dumps(state, separators=(",", ":")), now_ms),
            )


def next_lamport(conn: sqlite3.Connection) -> int:
    """The hub authors entries too; stay ahead of everything it has seen."""
    row = conn.execute("SELECT COALESCE(MAX(lc), 0) AS lc FROM ledger").fetchone()
    return row["lc"] + 1


def find_token(conn: sqlite3.Connection, code: str) -> dict | None:
    """Latest token entry with this code, plus its arrival if one was recorded."""
    row = conn.execute(
        "SELECT * FROM ledger WHERE kind = 'triage.token' "
        "AND json_extract(data, '$.code') = ? ORDER BY seq DESC LIMIT 1",
        (code,),
    ).fetchone()
    if not row:
        return None
    arrived = conn.execute(
        "SELECT clinic_id, ts FROM ledger WHERE kind = 'triage.arrived' "
        "AND json_extract(data, '$.tokenId') = ? ORDER BY seq LIMIT 1",
        (row["id"],),
    ).fetchone()
    return {
        "id": row["id"], "clinicId": row["clinic_id"], "ts": row["ts"],
        **json.loads(row["data"]),
        "arrived": {"clinicId": arrived["clinic_id"], "ts": arrived["ts"]} if arrived else None,
    }


def code_in_use(conn: sqlite3.Connection, code: str, now_ms: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM ledger WHERE kind = 'triage.token' "
        "AND json_extract(data, '$.code') = ? AND json_extract(data, '$.expiresAt') > ? LIMIT 1",
        (code, now_ms),
    ).fetchone()
    return row is not None
