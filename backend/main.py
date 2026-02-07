import os
import uuid
import asyncio
import logging
import tempfile
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from supabase_client import (
    create_room,
    get_room_by_code,
    verify_professor_key,
    upsert_notes,
    get_notes_for_room,
    get_existing_sections_summary,
    increment_highlight,
    add_comment,
    get_comments_for_room,
    upload_diagram,
)
from gemini_service import send_image_to_gemini

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Per-room locks to serialise image uploads and prevent duplicate sections
_room_locks: dict[str, asyncio.Lock] = {}


def _get_room_lock(room_id: str) -> asyncio.Lock:
    """Return (or create) an asyncio.Lock for the given room."""
    if room_id not in _room_locks:
        _room_locks[room_id] = asyncio.Lock()
    return _room_locks[room_id]


# ---------------------------------------------------------------------------
# Room endpoints
# ---------------------------------------------------------------------------

@app.post("/rooms")
async def api_create_room(body: dict | None = None):
    """Create a new room. Returns the room object with its join code."""
    name = body.get("name") if body else None
    room = create_room(name)
    logger.info(f"Room created: {room['code']}")
    return room


@app.get("/rooms/{code}")
async def api_get_room(code: str):
    """Look up a room by its join code."""
    room = get_room_by_code(code)
    if not room:
        raise HTTPException(404, "Room not found or inactive")
    # Never expose professor_key to GET requests
    room_safe = {k: v for k, v in room.items() if k != "professor_key"}
    return room_safe


@app.post("/rooms/{code}/verify-professor")
async def api_verify_professor(code: str, body: dict):
    """Verify the professor secret key for a room."""
    key = body.get("key", "")
    if not key:
        raise HTTPException(400, "key is required")
    if not verify_professor_key(code, key):
        raise HTTPException(403, "Invalid professor key")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Notes endpoints (room-scoped)
# ---------------------------------------------------------------------------

@app.post("/rooms/{code}/upload-image")
async def upload_image(code: str, file: UploadFile = File(...)):
    """Upload a chalkboard image for processing in a specific room."""
    room = get_room_by_code(code)
    if not room:
        raise HTTPException(404, "Room not found")

    # Save upload to a temp file (cleaned up automatically)
    contents = await file.read()
    ext = Path(file.filename).suffix if file.filename else ".jpg"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    # Acquire per-room lock so concurrent uploads are processed one at a
    # time, ensuring each request sees the section IDs written by the
    # previous one (prevents duplicate diagrams / section IDs).
    lock = _get_room_lock(room["id"])
    async with lock:
        existing_sections = get_existing_sections_summary(room["id"])

        try:
            sections = await asyncio.to_thread(
                send_image_to_gemini, tmp_path, True, existing_sections
            )
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise HTTPException(502, f"Failed to process image: {e}")
        finally:
            # Clean up temp file
            Path(tmp_path).unlink(missing_ok=True)

        # Build a lookup of existing sections that already have images
        existing_images = {
            s["section_id"]: s["image_url"]
            for s in existing_sections
            if s.get("image_url")
        }

        # Upload any generated diagram images to Supabase Storage,
        # but skip sections that already have an image (reused diagrams).
        for section in sections:
            img_bytes = section.pop("_image_bytes", None)
            img_ext = section.pop("_image_ext", None)

            existing_url = existing_images.get(section.get("section_id"))
            if existing_url:
                # Reused section already has a diagram — keep it
                section["image_url"] = existing_url
                logger.info(f"Keeping existing image for reused section {section.get('section_id')}")
            elif img_bytes and img_ext:
                mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(img_ext, "image/png")
                filename = f"diagram_{uuid.uuid4()}.{img_ext}"
                try:
                    public_url = upload_diagram(filename, img_bytes, mime)
                    section["image_url"] = public_url
                except Exception as e:
                    logger.error(f"Failed to upload diagram to storage: {e}")

        # Write results to Supabase — Realtime will push updates to clients
        upsert_notes(room["id"], sections)
        notes = get_notes_for_room(room["id"])

    return {"sections": sections, "notes": notes}


@app.get("/rooms/{code}/notes")
async def api_get_notes(code: str):
    """Get all notes for a room."""
    room = get_room_by_code(code)
    if not room:
        raise HTTPException(404, "Room not found")
    return get_notes_for_room(room["id"])


@app.get("/rooms/{code}/comments")
async def api_get_comments(code: str):
    """Get all comments for a room."""
    room = get_room_by_code(code)
    if not room:
        raise HTTPException(404, "Room not found")
    return get_comments_for_room(room["id"])


@app.post("/rooms/{code}/highlight")
async def api_highlight(code: str, body: dict):
    """Highlight a section and optionally add a comment."""
    room = get_room_by_code(code)
    if not room:
        raise HTTPException(404, "Room not found")

    section_id = body.get("section_id")
    comment = body.get("comment")
    highlighted_text = body.get("highlighted_text")
    if not section_id:
        raise HTTPException(400, "section_id is required")

    count = increment_highlight(room["id"], section_id)

    if comment:
        add_comment(room["id"], section_id, comment, highlighted_text)

    return {"section_id": section_id, "highlight_count": count}
