"""SQLite storage for the clinic hub. Standard library only.

WAL + synchronous=NORMAL keeps disk writes few and cheap, which suits a
solar-powered Raspberry Pi. Entries are immutable and unique by id, so
inserting the same entry twice is a no-op.
"""
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
