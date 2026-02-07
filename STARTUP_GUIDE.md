# QHacks 2026 Chalkboard Notes - Startup Guide

Quick guide to start the application for the first time.

## Prerequisites

- Python 3.12+
- pnpm (Node.js package manager)
- OpenRouter API key
- A Supabase account and project (free tier works fine)

## First-Time Setup

### 1. Set Up Supabase Database

1. Go to [supabase.com](https://supabase.com) and create a project (or use an existing one).
2. In your Supabase dashboard, go to **Project Settings > Database > Connection string**.
3. Select **Transaction pooler** and copy the URI. It looks like:
   ```
   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

> **Local alternative:** If you prefer a local PostgreSQL instance, install Docker and run `docker compose up -d`. Then use `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chalkboard` in your `.env`.

### 2. Configure Backend

Copy the example env file and fill in your keys:

```bash
cd backend
cp .env.example .env
# Edit .env with your actual values
nano .env
```

Your `.env` should look like:
```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx
OPENROUTER_MODEL=google/gemini-2.0-flash-001
DATABASE_URL=postgresql://postgres.[your-ref]:[your-password]@aws-0-[region].pooler.supabase.com:6543/postgres
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

The database tables are created automatically on first run.

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
- Verify your `DATABASE_URL` in `backend/.env` is correct
- If using Supabase, ensure you copied the **Transaction pooler** URI (port 6543)
- Check that your Supabase project is not paused (free-tier projects pause after inactivity)
- If using local Docker: ensure the container is running with `docker compose ps`

### Backend Issues
- Verify `.env` file has valid OPENROUTER_API_KEY
- Check backend logs for errors
- Database tables are auto-created on first run

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

## Next Steps

See `DIAGRAM_IMAGE_GENERATION.md` for details on the AI-powered diagram generation feature.
