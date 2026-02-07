# QHacks 2026 Chalkboard Notes - Startup Guide

## Prerequisites

- Python 3.12+
- pnpm (Node.js package manager)
- OpenRouter API key
- A Supabase project (free tier works)

## First-Time Setup

### 1. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a project.
2. From your dashboard, collect these values:
   - **Project URL**: `https://[ref].supabase.co` (Settings > API)
   - **Anon key**: public key (Settings > API)
   - **Service role key**: secret key (Settings > API)
   - **Database URI**: Transaction pooler URI (Settings > Database > Connection string)

### 2. Configure Backend

```bash
cd backend
cp .env.example .env
nano .env
```

Fill in your `.env`:
```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx
OPENROUTER_MODEL=google/gemini-2.0-flash-001
SUPABASE_URL=https://your-ref.supabase.co
SUPABASE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres.your-ref:password@aws-0-region.pooler.supabase.com:6543/postgres
```

### 3. Configure Frontend

```bash
cd frontend
cp .env.local.example .env.local
nano .env.local
```

Fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### 4. Install Dependencies

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../frontend && pnpm install
```

### 5. Run Database Migration

```bash
cd backend
.venv/bin/python migrate.py
```

This creates the tables and enables Realtime. Only needs to run once.

## Starting the Application

### Start Backend

```bash
cd backend
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

### Start Frontend (new terminal)

```bash
cd frontend
pnpm dev
```

## How It Works

1. **Professor** opens the app and creates a room — gets a 6-character code
2. **Students** enter the code on the home page to join the lecture
3. **Professor** starts their webcam — frames are captured at an interval and sent to the AI
4. **Students** see the notes appear in real time (via Supabase Realtime)
5. **Students** can highlight sections or ask questions
6. **Professor** sees engagement metrics and student questions on their dashboard

## URLs

- **Home / Join Room**: http://localhost:3000
- **Create Room**: http://localhost:3000/professor
- **Student View**: http://localhost:3000/room/[CODE]
- **Professor Dashboard**: http://localhost:3000/professor/[CODE]
- **Backend API**: http://localhost:8000/docs

## Utility Scripts

```bash
# Reset all data (keeps tables)
.venv/bin/python clear_db.py

# Re-run migration (safe to repeat)
.venv/bin/python migrate.py
```

## Troubleshooting

- **"Room not found"**: Check the code is correct and the room is active
- **Camera not working**: Ensure you've granted camera permissions in your browser
- **Notes not updating**: Check that Realtime is enabled on your Supabase tables (the migration does this)
- **Backend errors**: Check that SUPABASE_URL and SUPABASE_KEY are set correctly
