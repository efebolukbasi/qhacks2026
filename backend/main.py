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
from fastapi.responses import StreamingResponse
from elevenlabs.client import ElevenLabs

from supabase_client import (
    create_room,
    get_room_by_code,
    upsert_notes,
    get_notes_for_room,
    get_existing_section_ids,
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
    return room


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

    existing_ids = get_existing_section_ids(room["id"])

    try:
        sections = await asyncio.to_thread(
            send_image_to_gemini, tmp_path, True, existing_ids
        )
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        raise HTTPException(502, f"Failed to process image: {e}")
    finally:
        # Clean up temp file
        Path(tmp_path).unlink(missing_ok=True)

    # Upload any generated diagram images to Supabase Storage
    for section in sections:
        img_bytes = section.pop("_image_bytes", None)
        img_ext = section.pop("_image_ext", None)
        if img_bytes and img_ext:
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
    if not section_id:
        raise HTTPException(400, "section_id is required")

    count = increment_highlight(room["id"], section_id)

    if comment:
        add_comment(room["id"], section_id, comment)

    return {"section_id": section_id, "highlight_count": count}


# ---------------------------------------------------------------------------
# Text-to-Speech endpoint (secure backend-only)
# ---------------------------------------------------------------------------

@app.post("/tts")
async def text_to_speech(body: dict):
    """
    Convert text to speech using ElevenLabs.
    API key is kept secure on the backend.
    """
    text = body.get("text")
    voice_id = body.get("voice_id", "onwK4e9ZLuTAKqWW03F9")  # default voice
    
    if not text:
        raise HTTPException(400, "text is required")
    
    try:
        api_key = os.getenv("ELEVENLABS_API_KEY")
        if not api_key:
            raise HTTPException(500, "ElevenLabs API key not configured")
        
        elevenlabs = ElevenLabs(api_key=api_key)
        audio = elevenlabs.text_to_speech.convert(
            text=text,
            voice_id=voice_id,
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        
        return StreamingResponse(
            content=audio,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=audio.mp3"}
        )
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(500, f"Failed to generate speech: {e}")

