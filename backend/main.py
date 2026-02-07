import os
import uuid
import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

import socketio
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import create_pool, close_pool, upsert_notes, get_all_notes, increment_highlight, add_comment, get_comments
from gemini_service import send_image_to_gemini

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

DIAGRAMS_DIR = UPLOADS_DIR / "diagrams"
DIAGRAMS_DIR.mkdir(exist_ok=True)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_pool()
    logger.info("Database connected")
    yield
    await close_pool()
    logger.info("Database connection closed")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for serving generated diagrams
app.mount("/diagrams", StaticFiles(directory=str(DIAGRAMS_DIR)), name="diagrams")


@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix if file.filename else ".png"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = UPLOADS_DIR / filename

    contents = await file.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    try:
        # Run synchronous Gemini call in a thread so the event loop stays free
        # for Socket.IO heartbeats and client connections
        sections = await asyncio.to_thread(
            send_image_to_gemini, str(filepath), True, DIAGRAMS_DIR
        )
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return {"error": "Failed to process image with Gemini", "detail": str(e)}

    await upsert_notes(sections)
    notes = await get_all_notes()
    await sio.emit("notes_update", notes)

    return {"sections": sections, "notes": notes}


@app.get("/notes")
async def get_notes():
    notes = await get_all_notes()
    return notes


@app.get("/comments")
async def get_comments_endpoint():
    comments = await get_comments()
    return comments


# Socket.IO events

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")


@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")


@sio.event
async def highlight_section(sid, data):
    section_id = data.get("section_id")
    comment = data.get("comment")

    if not section_id:
        return

    count = await increment_highlight(section_id)

    if comment:
        await add_comment(section_id, comment)

    await sio.emit("highlight_update", {
        "section_id": section_id,
        "highlight_count": count,
        "comment": comment,
    })


# Combine FastAPI + Socket.IO into a single ASGI app
asgi_app = socketio.ASGIApp(sio, app)
