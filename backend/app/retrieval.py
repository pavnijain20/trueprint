import re
import sqlite3
from pathlib import Path

DB_PATH = Path("kb.db")
STOPWORDS = {"the", "and", "for", "with", "that", "this", "from", "your", "are", "our", "can", "all"}


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(reset: bool = False):
    if reset and DB_PATH.exists():
        DB_PATH.unlink()
    with get_conn() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS chunks "
            "(id TEXT PRIMARY KEY, kind TEXT, title TEXT, text TEXT, expires TEXT)"
        )
        c.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, text)"
        )


def add_chunk(id: str, kind: str, title: str, text: str, expires: str | None = None):
    with get_conn() as c:
        c.execute("INSERT OR REPLACE INTO chunks VALUES (?,?,?,?,?)", (id, kind, title, text, expires))
        c.execute("DELETE FROM chunks_fts WHERE id = ?", (id,))
        c.execute("INSERT INTO chunks_fts (id, text) VALUES (?, ?)", (id, text))


def get_chunk(id: str):
    """Returns the chunk text, or None if the id does not exist."""
    with get_conn() as c:
        row = c.execute("SELECT text FROM chunks WHERE id = ?", (id,)).fetchone()
    return row["text"] if row else None


def search(query: str, k: int = 4):
    words = [w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 2 and w not in STOPWORDS]
    if not words:
        return []
    fts_query = " OR ".join(f'"{w}"' for w in words)
    with get_conn() as c:
        rows = c.execute(
            "SELECT ch.id, ch.kind, ch.title, ch.text, ch.expires "
            "FROM chunks_fts f JOIN chunks ch ON ch.id = f.id "
            "WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?",
            (fts_query, k),
        ).fetchall()
    return [dict(r) for r in rows]