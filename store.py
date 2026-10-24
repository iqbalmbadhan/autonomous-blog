"""SQLite storage for posts and the activity feed."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DATA_DIR / "autoblog.db"
IMAGES_DIR = DATA_DIR / "images"

# idea -> queued -> generating -> review -> scheduled/published; failed can be retried.
STATUSES = ("idea", "queued", "generating", "review", "scheduled", "published", "failed")

EDITABLE_FIELDS = {
    "topic", "status", "stage", "title", "outline", "article", "meta_description", "keyword",
    "image_url", "image_file", "image_type", "image_prompt", "wp_media_id", "wp_post_id",
    "wp_link", "wp_status", "scheduled_at", "published_at", "error", "log",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idea',
    stage TEXT,
    title TEXT,
    outline TEXT,
    article TEXT,
    meta_description TEXT,
    keyword TEXT,
    image_url TEXT,
    image_file TEXT,
    image_type TEXT,
    image_prompt TEXT,
    wp_media_id INTEGER,
    wp_post_id INTEGER,
    wp_link TEXT,
    wp_status TEXT,
    scheduled_at TEXT,
    published_at TEXT,
    error TEXT,
    log TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

LIST_COLUMNS = """
    id, topic, status, stage, title, image_file, wp_link, wp_status, scheduled_at,
    published_at, error, created_at, updated_at,
    CASE WHEN article IS NULL OR article = '' THEN 0
         ELSE length(trim(article)) - length(replace(trim(article), ' ', '')) + 1 END AS words
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        # A run interrupted by a restart goes back to the queue.
        conn.execute("UPDATE posts SET status = 'queued', stage = NULL WHERE status = 'generating'")


def _promote_due_scheduled(conn: sqlite3.Connection) -> None:
    """WordPress publishes scheduled posts itself; mirror that once the time has passed."""
    conn.execute(
        "UPDATE posts SET status = 'published', published_at = scheduled_at, updated_at = ? "
        "WHERE status = 'scheduled' AND scheduled_at <= ?",
        (now(), now()),
    )


def _to_dict(row: sqlite3.Row) -> dict[str, Any]:
    data = dict(row)
    if "log" in data:
        data["log"] = json.loads(data["log"] or "[]")
    return data


def list_posts() -> list[dict[str, Any]]:
    with connect() as conn:
        _promote_due_scheduled(conn)
        rows = conn.execute(f"SELECT {LIST_COLUMNS} FROM posts ORDER BY updated_at DESC, id DESC").fetchall()
    return [dict(row) for row in rows]


def get_post(post_id: int) -> dict[str, Any] | None:
    with connect() as conn:
        _promote_due_scheduled(conn)
        row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    return _to_dict(row) if row else None


def create_post(topic: str, status: str = "idea") -> int:
    stamp = now()
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO posts (topic, status, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (topic, status, stamp, stamp),
        )
        return int(cursor.lastrowid)


def update_post(post_id: int, **fields: Any) -> None:
    unknown = set(fields) - EDITABLE_FIELDS
    if unknown:
        raise ValueError(f"Unknown post fields: {', '.join(sorted(unknown))}")
    if "log" in fields:
        fields["log"] = json.dumps(fields["log"])
    fields["updated_at"] = now()
    assignments = ", ".join(f"{name} = ?" for name in fields)
    with connect() as conn:
        conn.execute(f"UPDATE posts SET {assignments} WHERE id = ?", (*fields.values(), post_id))


def append_log(post_id: int, level: str, message: str) -> None:
    entry = {"time": now(), "level": level, "message": message}
    with connect() as conn:
        conn.execute(
            "UPDATE posts SET log = json_insert(log, '$[#]', json(?)) WHERE id = ?",
            (json.dumps(entry), post_id),
        )


def delete_post(post_id: int) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))


def next_queued() -> int | None:
    with connect() as conn:
        row = conn.execute("SELECT id FROM posts WHERE status = 'queued' ORDER BY updated_at, id LIMIT 1").fetchone()
    return int(row["id"]) if row else None


def add_activity(post_id: int | None, kind: str, message: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO activity (post_id, kind, message, created_at) VALUES (?, ?, ?, ?)",
            (post_id, kind, message, now()),
        )


def recent_activity(limit: int = 12) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM activity ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(row) for row in rows]


def status_counts() -> dict[str, int]:
    with connect() as conn:
        _promote_due_scheduled(conn)
        rows = conn.execute("SELECT status, COUNT(*) AS n FROM posts GROUP BY status").fetchall()
    counts = {status: 0 for status in STATUSES}
    counts.update({row["status"]: row["n"] for row in rows})
    return counts
