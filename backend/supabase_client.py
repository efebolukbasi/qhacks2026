"""Supabase client for all database operations."""

import os
import random
import string
import logging

from supabase import create_client, Client

logger = logging.getLogger(__name__)

_supabase: Client | None = None


def get_client() -> Client:
    global _supabase
    if _supabase is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
        _supabase = create_client(url, key)
    return _supabase


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------

def _generate_code(length: int = 6) -> str:
    """Generate a random room code like 'X3KQ7P'."""
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))


def create_room(name: str | None = None) -> dict:
    """Create a new room and return it."""
    sb = get_client()
    code = _generate_code()
    row = {"code": code}
    if name:
        row["name"] = name
    result = sb.table("rooms").insert(row).execute()
    return result.data[0]


def get_room_by_code(code: str) -> dict | None:
    """Look up a room by its join code."""
    sb = get_client()
    result = sb.table("rooms").select("*").eq("code", code.upper()).eq("is_active", True).execute()
    return result.data[0] if result.data else None


# ---------------------------------------------------------------------------
# Lecture Notes
# ---------------------------------------------------------------------------

def upsert_notes(room_id: str, sections: list[dict]) -> None:
    """Upsert lecture note sections for a room."""
    sb = get_client()
    rows = [
        {
            "room_id": room_id,
            "section_id": s["section_id"],
            "type": s["type"],
            "content": s["content"],
            "caption": s.get("caption"),
            "image_url": s.get("image_url"),
        }
        for s in sections
    ]
    sb.table("lecture_notes").upsert(rows, on_conflict="room_id,section_id").execute()


def get_notes_for_room(room_id: str) -> list[dict]:
    """Get all notes for a room with highlight counts."""
    sb = get_client()
    result = (
        sb.table("lecture_notes")
        .select("*, highlights(highlight_count)")
        .eq("room_id", room_id)
        .order("id")
        .execute()
    )
    notes = []
    for row in result.data:
        highlight_data = row.get("highlights")
        highlight_count = 0
        if highlight_data:
            # highlights is a list from the join; take the first match
            if isinstance(highlight_data, list) and len(highlight_data) > 0:
                highlight_count = highlight_data[0].get("highlight_count", 0)
            elif isinstance(highlight_data, dict):
                highlight_count = highlight_data.get("highlight_count", 0)
        notes.append({
            "id": row["id"],
            "section_id": row["section_id"],
            "type": row["type"],
            "content": row["content"],
            "caption": row.get("caption"),
            "image_url": row.get("image_url"),
            "highlight_count": highlight_count,
            "created_at": row.get("created_at"),
        })
    return notes


# ---------------------------------------------------------------------------
# Highlights & Comments
# ---------------------------------------------------------------------------

def increment_highlight(room_id: str, section_id: str) -> int:
    """Atomically increment highlight count via the database function."""
    sb = get_client()
    result = sb.rpc("increment_highlight", {
        "p_room_id": room_id,
        "p_section_id": section_id,
    }).execute()
    return result.data if isinstance(result.data, int) else 1


def add_comment(room_id: str, section_id: str, comment: str) -> None:
    """Add a student comment/question."""
    sb = get_client()
    sb.table("comments").insert({
        "room_id": room_id,
        "section_id": section_id,
        "comment": comment,
    }).execute()


def get_comments_for_room(room_id: str) -> list[dict]:
    """Get all comments for a room."""
    sb = get_client()
    result = (
        sb.table("comments")
        .select("*")
        .eq("room_id", room_id)
        .order("created_at")
        .execute()
    )
    return result.data


# ---------------------------------------------------------------------------
# Storage (diagram images)
# ---------------------------------------------------------------------------

DIAGRAMS_BUCKET = "diagrams"


def upload_diagram(filename: str, image_bytes: bytes, content_type: str = "image/png") -> str:
    """Upload a diagram image to Supabase Storage and return its public URL."""
    sb = get_client()
    sb.storage.from_(DIAGRAMS_BUCKET).upload(
        filename,
        image_bytes,
        {"content-type": content_type},
    )
    public_url = sb.storage.from_(DIAGRAMS_BUCKET).get_public_url(filename)
    logger.info(f"Uploaded diagram to Supabase Storage: {public_url}")
    return public_url
