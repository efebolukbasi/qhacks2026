"""Clear all data from the database tables."""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

conn = psycopg.connect(os.getenv("DATABASE_URL"))
with conn.cursor() as cur:
    cur.execute("DELETE FROM comments")
    cur.execute("DELETE FROM highlights")
    cur.execute("DELETE FROM lecture_notes")
conn.commit()
conn.close()
print("Database cleared.")
