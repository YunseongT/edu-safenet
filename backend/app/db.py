import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "edu_safenet.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS school (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                preset TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS student (
                id INTEGER PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                school_id INTEGER REFERENCES school(id)
            );
            CREATE TABLE IF NOT EXISTS journal (
                id INTEGER PRIMARY KEY,
                student_id INTEGER REFERENCES student(id),
                raw_text TEXT NOT NULL,
                refined_text TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS signal_history (
                id INTEGER PRIMARY KEY,
                student_id INTEGER REFERENCES student(id),
                score REAL NOT NULL,
                color TEXT NOT NULL,
                breakdown_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
