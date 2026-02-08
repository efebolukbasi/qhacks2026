# ChalkBoard Live

Real-time lecture notes from any whiteboard. A camera captures what the professor writes, AI extracts the content, and students get clean, formatted notes with full LaTeX math rendering delivered live to their devices.

## How it works

1. **Professor** creates a room and points a camera at the whiteboard
2. **Backend** receives camera frames and sends them to Google Gemini for handwriting extraction
3. **AI** returns structured notes with LaTeX math, section headers, and diagram descriptions
4. **Students** join with a room code and see notes appear in real-time via Supabase Realtime
5. **Notes** render with KaTeX for math and include zoomable diagram images

When the professor blocks part of the board, the system compares the current frame with the previous capture to reconstruct obscured content.

## Features

- Live-updating notes with LaTeX math rendering
- Section highlighting for students to flag important content
- Text-to-speech playback per section (ElevenLabs, male/female voices)
- Diagram image viewer with zoom, pan, and copy-to-clipboard
- Professor dashboard with student count and engagement metrics
- PDF export of the full lecture
- Room browser to find active lectures

## Project structure

```
.
├── backend/             Python FastAPI server
│   ├── main.py          API routes (rooms, image upload, TTS, highlights)
│   ├── gemini_service.py  AI prompt engineering and image processing
│   ├── supabase_client.py Database operations
│   └── voiceover.py     ElevenLabs TTS wrapper
│
├── frontend/            Next.js 16 app (React 19, TypeScript)
│   └── src/
│       ├── app/
│       │   ├── page.tsx              Home / join room
│       │   ├── rooms/page.tsx        Room browser
│       │   ├── professor/page.tsx    Create room
│       │   ├── professor/[code]/     Professor dashboard
│       │   └── room/[code]/          Student notes view
│       └── components/
│           ├── LatexContent.tsx       KaTeX math rendering
│           ├── DiagramViewer.tsx      Image lightbox with zoom/pan
│           └── VoiceButton.tsx        TTS playback controls
│
├── docker-compose.yml
├── netlify.toml         Frontend deployment config
└── render.yaml          Backend deployment config
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 20+ and pnpm
- A [Supabase](https://supabase.com) project
- API keys for [OpenRouter](https://openrouter.ai) and [ElevenLabs](https://elevenlabs.io)

### Environment variables

**Backend** (`backend/.env`):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
OPENROUTER_API_KEY=your-openrouter-key
ELEVENLABS_API_KEY=your-elevenlabs-key
```

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### Running locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (separate terminal)
cd frontend
pnpm install
pnpm dev
```

The frontend runs on `http://localhost:3000` and the backend on `http://localhost:8000`.

## Deployment

- **Frontend**: Deployed on [Netlify](https://netlify.com) via `netlify.toml`
- **Backend**: Deployed on [Render](https://render.com) via `render.yaml`

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, KaTeX |
| Backend | FastAPI, Python |
| Database | Supabase (PostgreSQL + Realtime) |
| AI | Google Gemini via OpenRouter |
| TTS | ElevenLabs |
| Hosting | Netlify (frontend), Render (backend) |

## License

Built at QHacks 2026.
