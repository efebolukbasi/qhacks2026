# QHacks 2026 Chalkboard Notes - Startup Guide

Quick guide to start the application for the first time.

## Prerequisites

- Docker and Docker Compose
- Python 3.12+
- pnpm (Node.js package manager)
- OpenRouter API key

## First-Time Setup

### 1. Start PostgreSQL Database

```bash
docker compose up -d
```

This starts PostgreSQL on port 5432.

### 2. Configure Backend

The `.env` file has been created in `backend/` with default values. **You must add your OpenRouter API key:**

```bash
cd backend
# Edit .env and replace 'your-openrouter-api-key-here' with your actual API key
nano .env
```

Your `.env` should look like:
```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx
OPENROUTER_MODEL=google/gemini-2.0-flash-001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chalkboard
```

### 3. Install Backend Dependencies

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 4. Install Frontend Dependencies

```bash
cd ../frontend
pnpm install
```

## Starting the Application

### Start Backend Server

```bash
cd backend
.venv/bin/uvicorn main:asgi_app --host 0.0.0.0 --port 8000
```

Backend will run on: http://localhost:8000

### Start Frontend Dev Server (in a new terminal)

```bash
cd frontend
pnpm dev
```

Frontend will run on: http://localhost:3000

## Accessing the Application

- **Student View**: http://localhost:3000
- **Professor Dashboard**: http://localhost:3000/professor
- **Backend API**: http://localhost:8000/docs (FastAPI Swagger UI)

## Testing the Image Capture

To test with a sample image:

```bash
cd capture
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python create_test_image.py
```

Or configure `capture/config.json` with your IP camera URL and run:

```bash
.venv/bin/python capture.py
```

## Features

- **Real-time Notes**: Chalkboard images are processed automatically
- **LaTeX Support**: Mathematical equations are rendered beautifully
- **Diagram Generation**: AI generates actual images for diagrams using Google's Nano Banana (Gemini 3 Pro Image Preview)
- **Student Interaction**: Students can highlight sections and ask questions
- **Professor Dashboard**: See what students find confusing in real-time

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL container is running: `docker compose ps`
- Check logs: `docker compose logs postgres`

### Backend Issues
- Verify `.env` file has valid OPENROUTER_API_KEY
- Check backend logs for errors
- Database will auto-initialize on first run

### Frontend Issues
- Clear browser cache
- Check console for WebSocket connection errors
- Ensure backend is running on port 8000

### Image Generation Not Working
- Verify you have a valid OpenRouter API key with credits
- Check backend logs for "Image generation response" messages
- The model `google/gemini-3-pro-image-preview` requires the `modalities` parameter

## Stopping the Application

- Press `Ctrl+C` in each terminal running the servers
- Stop PostgreSQL: `docker compose down`

## Next Steps

See `DIAGRAM_IMAGE_GENERATION.md` for details on the AI-powered diagram generation feature.
