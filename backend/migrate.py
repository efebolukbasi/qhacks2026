"""Database migration: create/update tables for ChalkBoard Live.

Run this once when setting up a new Supabase project:
    python migrate.py

Safe to re-run — uses CREATE TABLE IF NOT EXISTS and CREATE OR REPLACE.
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

dsn = os.getenv("DATABASE_URL")
if not dsn:
    print("ERROR: DATABASE_URL not set in .env")
    exit(1)

print("Connecting to database...")
conn = psycopg.connect(dsn, sslmode="require")

with conn.cursor() as cur:
    # --- Rooms ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS rooms (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code TEXT UNIQUE NOT NULL,
            name TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    print("  ✓ rooms")

    # --- Lecture Notes (room-scoped) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS lecture_notes (
            id SERIAL PRIMARY KEY,
            room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            section_id TEXT NOT NULL,
            type TEXT,
            content TEXT,
            caption TEXT,
            image_url TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(room_id, section_id)
        );
    """)
    print("  ✓ lecture_notes")

    # --- Highlights (room-scoped) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS highlights (
            id SERIAL PRIMARY KEY,
            room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            section_id TEXT NOT NULL,
            highlight_count INT DEFAULT 0,
            UNIQUE(room_id, section_id)
        );
    """)
    print("  ✓ highlights")

    # --- Comments (room-scoped) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            section_id TEXT,
            comment TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    print("  ✓ comments")

    # --- RPC: increment highlight count atomically ---
    cur.execute("""
        CREATE OR REPLACE FUNCTION increment_highlight(p_room_id UUID, p_section_id TEXT)
        RETURNS INT AS $$
        DECLARE
            new_count INT;
        BEGIN
            INSERT INTO highlights (room_id, section_id, highlight_count)
            VALUES (p_room_id, p_section_id, 1)
            ON CONFLICT (room_id, section_id)
            DO UPDATE SET highlight_count = highlights.highlight_count + 1
            RETURNING highlight_count INTO new_count;
            RETURN new_count;
        END;
        $$ LANGUAGE plpgsql;
    """)
    print("  ✓ increment_highlight function")

    # --- Disable RLS for simplicity (hackathon) ---
    for table in ["rooms", "lecture_notes", "highlights", "comments"]:
        cur.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")
    print("  ✓ RLS disabled (hackathon mode)")

    # --- Enable Supabase Realtime on tables ---
    for table in ["lecture_notes", "highlights", "comments"]:
        try:
            cur.execute(f"ALTER PUBLICATION supabase_realtime ADD TABLE {table};")
        except Exception:
            # Already added — ignore
            conn.rollback()
            conn.autocommit = False
    print("  ✓ Realtime enabled")

conn.commit()
conn.close()
print("\nMigration complete.")
