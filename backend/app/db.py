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
        # 교사 소견(이의·동의·대응 사유) 기록 컬럼 — 기존 DB에도 더해질 수 있게 ALTER.
        # 신호등 색은 규칙이 고정하되, 교사 판단은 감사기록으로 남긴다.
        for col in ("teacher_note TEXT", "note_at TEXT"):
            try:
                conn.execute(f"ALTER TABLE signal_history ADD COLUMN {col}")
            except sqlite3.OperationalError:
                pass  # 이미 존재
        # AI 보조의견(규칙이 놓친 맥락) 영속화 — 새로고침·과거조회 시에도 항상 보이게.
        try:
            conn.execute("ALTER TABLE journal ADD COLUMN llm_context TEXT")
        except sqlite3.OperationalError:
            pass  # 이미 존재
