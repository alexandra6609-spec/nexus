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

CREATE TABLE IF NOT EXISTS relay_state (
  name   TEXT PRIMARY KEY,
  cursor INTEGER NOT NULL DEFAULT 0
);

-- The raw phone number is never stored. message_id makes gateway retries safe.
CREATE TABLE IF NOT EXISTS sms_messages (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  conversation_id TEXT,
  phone_hash TEXT NOT NULL,
  direction  TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reply_to   TEXT,
  part       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (message_id, direction, part)
);
CREATE INDEX IF NOT EXISTS sms_messages_phone ON sms_messages(phone_hash, seq);
CREATE INDEX IF NOT EXISTS sms_messages_reply ON sms_messages(reply_to, part);
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
        columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(sms_messages)")
        }
        if "conversation_id" not in columns:
            conn.execute("ALTER TABLE sms_messages ADD COLUMN conversation_id TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS sms_messages_conversation "
            "ON sms_messages(conversation_id, seq)"
        )


def get_relay_cursor(conn: sqlite3.Connection, name: str) -> int:
    row = conn.execute("SELECT cursor FROM relay_state WHERE name = ?", (name,)).fetchone()
    return int(row["cursor"]) if row else 0


def set_relay_cursor(conn: sqlite3.Connection, name: str, cursor: int) -> None:
    with conn:
        conn.execute(
            "INSERT INTO relay_state (name, cursor) VALUES (?, ?) "
            "ON CONFLICT(name) DO UPDATE SET cursor = excluded.cursor",
            (name, cursor),
        )


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
    conn: sqlite3.Connection,
    after: int,
    limit: int,
    exclude_device: str = "",
    clinic_id: str = "",
) -> tuple[list[dict], int, bool]:
    """Entries after the cursor; SMS text is returned only to its clinic."""
    rows = conn.execute(
        "SELECT * FROM ledger WHERE seq > ? AND device != ? "
        "AND (kind != 'sms.message' OR ? = '__relay__' "
        "OR (? != '' AND clinic_id IN (?, '*'))) "
        "ORDER BY seq LIMIT ?",
        (after, exclude_device, clinic_id, clinic_id, clinic_id, limit + 1),
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

def recent_entries(
    conn: sqlite3.Connection, kind: str, since_ms: int, limit: int = 50
) -> list[dict]:
    """Newest entries of one kind written at or after `since_ms`."""
    rows = conn.execute(
        "SELECT * FROM ledger WHERE kind = ? AND ts >= ? ORDER BY seq DESC LIMIT ?",
        (kind, since_ms, limit),
    ).fetchall()
    return [
        {
            "id": r["id"], "clinicId": r["clinic_id"], "device": r["device"],
            "lc": r["lc"], "ts": r["ts"], "kind": r["kind"],
            "data": json.loads(r["data"]),
        }
        for r in rows
    ]

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
