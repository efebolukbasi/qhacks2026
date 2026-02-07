"""One-time migration: create tables on the database (e.g. Supabase).

Run this once when setting up a new database:
    python migrate.py

Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

dsn = os.getenv("DATABASE_URL")
if not dsn:
    print("ERROR: DATABASE_URL not set in .env")
    exit(1)

print(f"Connecting to database...")
conn = psycopg.connect(dsn, sslmode="require")

with conn.cursor() as cur:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS lecture_notes (
            id SERIAL PRIMARY KEY,
            content TEXT,
            section_id TEXT UNIQUE,
            type TEXT,
            caption TEXT,
            image_url TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    print("  ✓ lecture_notes")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS highlights (
            id SERIAL PRIMARY KEY,
            section_id TEXT UNIQUE,
            highlight_count INT DEFAULT 0
        );
    """)
    print("  ✓ highlights")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            section_id TEXT,
            comment TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    print("  ✓ comments")

conn.commit()
conn.close()
print("Migration complete — all tables created.")
