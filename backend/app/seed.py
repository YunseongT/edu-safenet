"""데모 시드 — 학교 2곳 + 케이스별 학생 + 진행 시나리오. 멱등(이미 있으면 건너뜀)."""
import json
from datetime import datetime, timedelta

from .db import get_conn
from .engine import assess

SCHOOLS = [(1, "A학교", "A"), (2, "B학교", "B")]

STUDENTS = [
    ("S-A1F3", "학생 가 (자해 위기)", 1),
    ("S-B7C2", "학생 나 (학교폭력)", 1),
    ("S-A9D1", "학생 다 (아동학대)", 1),
    ("S-B4E8", "학생 라 (특수교육+학폭)", 2),
    ("S-A2K5", "학생 마 (경미·녹색대조)", 1),
]


# (학생 id, 학교프리셋, 일지 텍스트). 엔진으로 결정적 신호 산출(LLM 없음).
JOURNALS = [
    (1, "A", "지수가 오늘 점심을 거르고 혼자 앉아 말이 없었다."),          # 녹/황
    (1, "A", "이틀째 결석이다. 무기력해 보이고 위축된 모습이다."),         # 황
    (1, "A", "민수가 죽고 싶다고 말했고 손목에 흉터가 보였다."),           # 적(floor)
    (2, "A", "나가 따돌림을 당하고 욕설과 협박을 들었다고 한다."),         # 학폭 황
    (3, "A", "다의 팔에 멍이 보였고 집에 가기 싫다며 맞았다고 말했다."),   # 아동학대 적(floor)
    (4, "B", "라는 발달이 느린 편인데 괴롭힘과 따돌림을 당했다."),         # 특수+학폭 적(floor)
    (5, "A", "마는 평소처럼 친구들과 어울리고 수업에 잘 참여했다."),       # 녹색 대조
]


def seed() -> None:
    with get_conn() as conn:
        if conn.execute("SELECT COUNT(*) FROM school").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO school(id, name, preset) VALUES(?,?,?)", SCHOOLS)
        if conn.execute("SELECT COUNT(*) FROM student").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO student(token, display_name, school_id) VALUES(?,?,?)",
                STUDENTS)
        if conn.execute("SELECT COUNT(*) FROM journal").fetchone()[0] == 0:
            base = datetime(2026, 5, 18, 9, 0)
            for i, (sid, school, txt) in enumerate(JOURNALS):
                ts = (base + timedelta(days=i)).isoformat(timespec="seconds")
                r = assess(txt, school)
                conn.execute(
                    "INSERT INTO journal(student_id, raw_text, refined_text, created_at) "
                    "VALUES(?,?,?,?)", (sid, txt, txt, ts))
                conn.execute(
                    "INSERT INTO signal_history(student_id, score, color, breakdown_json, created_at) "
                    "VALUES(?,?,?,?,?)",
                    (sid, r["score"], r["color"], json.dumps(r, ensure_ascii=False), ts))
