import os
import asyncio
from functools import partial

import psycopg
from psycopg.rows import dict_row

_dsn: str | None = None


def _get_conn():
    return psycopg.connect(_dsn, row_factory=dict_row)


def _run_sync(fn, *args):
    """Run a blocking DB function in the default executor."""
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(None, partial(fn, *args))


# --- sync helpers (run in thread pool) ---

def _init_db_sync():
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS lecture_notes (
                    id SERIAL PRIMARY KEY,
                    content TEXT,
                    section_id TEXT UNIQUE,
                    type TEXT,
                    caption TEXT,
                    image_url TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS highlights (
                    id SERIAL PRIMARY KEY,
                    section_id TEXT UNIQUE,
                    highlight_count INT DEFAULT 0
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS comments (
                    id SERIAL PRIMARY KEY,
                    section_id TEXT,
                    comment TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """)
        conn.commit()
    finally:
        conn.close()


def _upsert_notes_sync(sections: list):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            for section in sections:
                cur.execute(
                    """
                    INSERT INTO lecture_notes (section_id, type, content, caption, image_url)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (section_id)
                    DO UPDATE SET 
                        content = EXCLUDED.content, 
                        type = EXCLUDED.type,
                        caption = EXCLUDED.caption,
                        image_url = EXCLUDED.image_url
                    """,
                    (
                        section["section_id"], 
                        section["type"], 
                        section["content"],
                        section.get("caption"),
                        section.get("image_url")
                    ),
                )
        conn.commit()
    finally:
        conn.close()


def _get_all_notes_sync():
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    ln.id, ln.section_id, ln.type, ln.content, ln.caption, ln.image_url, ln.created_at,
                    COALESCE(h.highlight_count, 0) AS highlight_count
                FROM lecture_notes ln
                LEFT JOIN highlights h ON ln.section_id = h.section_id
                ORDER BY ln.id
            """)
            rows = cur.fetchall()

            notes = []
            for r in rows:
                cur.execute(
                    "SELECT comment, created_at FROM comments WHERE section_id = %s ORDER BY created_at",
                    (r["section_id"],),
                )
                comments = cur.fetchall()
                note = {
                    "id": r["id"],
                    "section_id": r["section_id"],
                    "type": r["type"],
                    "content": r["content"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "highlight_count": r["highlight_count"],
                    "comments": [
                        {"comment": c["comment"], "created_at": c["created_at"].isoformat() if c["created_at"] else None}
                        for c in comments
                    ],
                }
                if r.get("caption"):
                    note["caption"] = r["caption"]
                if r.get("image_url"):
                    note["image_url"] = r["image_url"]
                notes.append(note)
            return notes
    finally:
        conn.close()


def _increment_highlight_sync(section_id: str):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO highlights (section_id, highlight_count)
                VALUES (%s, 1)
                ON CONFLICT (section_id)
                DO UPDATE SET highlight_count = highlights.highlight_count + 1
                """,
                (section_id,),
            )
            conn.commit()
            cur.execute(
                "SELECT highlight_count FROM highlights WHERE section_id = %s",
                (section_id,),
            )
            row = cur.fetchone()
            return row["highlight_count"] if row else 1
    finally:
        conn.close()


def _add_comment_sync(section_id: str, comment: str):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO comments (section_id, comment) VALUES (%s, %s)",
                (section_id, comment),
            )
        conn.commit()
    finally:
        conn.close()


def _get_comments_sync():
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT c.id, c.section_id, c.comment, c.created_at
                FROM comments c
                ORDER BY c.created_at
            """)
            return [
                {
                    "id": r["id"],
                    "section_id": r["section_id"],
                    "comment": r["comment"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in cur.fetchall()
            ]
    finally:
        conn.close()


# --- async public API (unchanged signatures) ---

async def create_pool():
    global _dsn
    _dsn = os.getenv("DATABASE_URL")


async def close_pool():
    pass  # psycopg2 uses short-lived connections


async def init_db():
    await _run_sync(_init_db_sync)


async def upsert_notes(sections: list):
    await _run_sync(_upsert_notes_sync, sections)


async def get_all_notes():
    return await _run_sync(_get_all_notes_sync)


async def increment_highlight(section_id: str):
    return await _run_sync(_increment_highlight_sync, section_id)


async def add_comment(section_id: str, comment: str):
    await _run_sync(_add_comment_sync, section_id, comment)


async def get_comments():
    return await _run_sync(_get_comments_sync)
