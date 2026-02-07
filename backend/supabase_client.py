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


def get_existing_section_ids(room_id: str) -> list[str]:
    """Return all section_ids that already exist for a room."""
    sb = get_client()
    result = (
        sb.table("lecture_notes")
        .select("section_id")
        .eq("room_id", room_id)
        .order("id")
        .execute()
    )
    return [row["section_id"] for row in result.data]


def get_existing_sections_summary(room_id: str) -> list[dict]:
    """Return section_id, type, and a content snippet for each existing section."""
    sb = get_client()
    result = (
        sb.table("lecture_notes")
        .select("section_id, type, content")
        .eq("room_id", room_id)
        .order("id")
        .execute()
    )
    return [
        {
            "section_id": row["section_id"],
            "type": row["type"],
            "content_preview": (row.get("content") or "")[:150],
        }
        for row in result.data
    ]


def get_notes_for_room(room_id: str) -> list[dict]:
    """Get all notes for a room with highlight counts."""
    sb = get_client()

    # Fetch notes and highlights separately (no FK between tables)
    notes_result = (
        sb.table("lecture_notes")
        .select("*")
        .eq("room_id", room_id)
        .order("id")
        .execute()
    )
    highlights_result = (
        sb.table("highlights")
        .select("section_id, highlight_count")
        .eq("room_id", room_id)
        .execute()
    )

    # Build a lookup map: section_id -> highlight_count
    hl_map = {
        row["section_id"]: row.get("highlight_count", 0)
        for row in highlights_result.data
    }

    notes = []
    for row in notes_result.data:
        notes.append({
            "id": row["id"],
            "section_id": row["section_id"],
            "type": row["type"],
            "content": row["content"],
            "caption": row.get("caption"),
            "image_url": row.get("image_url"),
            "highlight_count": hl_map.get(row["section_id"], 0),
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
