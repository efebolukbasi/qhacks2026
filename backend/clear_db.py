"""Clear all data from the database tables (keeps the tables themselves).

Usage:
    python clear_db.py
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

dsn = os.getenv("DATABASE_URL")
if not dsn:
    print("ERROR: DATABASE_URL not set in .env")
    exit(1)

conn = psycopg.connect(dsn, sslmode="require")
with conn.cursor() as cur:
    cur.execute("TRUNCATE comments, highlights, lecture_notes RESTART IDENTITY CASCADE")
conn.commit()
conn.close()
print("Database cleared — all rows removed, sequences reset.")
