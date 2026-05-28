import json
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .cases import CASE_RESOURCES
from .db import get_conn, init_db
from .engine import SCHOOL_PRESETS, assess
from .law import laws_for
from .llm import LLM_ENABLED, LLM_MODEL
from .pipeline import process, refine
from .protocols import get_protocols
from .report import build as build_report
from .resources import match
from .seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed()
    yield


app = FastAPI(title="Edu-SafeNet", lifespan=lifespan)
_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,https://demo.yunseongt.com",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "model": LLM_MODEL, "llm_enabled": LLM_ENABLED}


@app.get("/config")
def config():
    """프런트가 데모 모드 여부를 알기 위해 호출(배너 표시용)."""
    return {"llm_enabled": LLM_ENABLED,
            "demo_mode": os.getenv("DEMO_MODE", "0") not in ("0", "false", "")}


@app.get("/schools")
def schools():
    return [{"key": k, **v} for k, v in SCHOOL_PRESETS.items()]


@app.get("/students")
def students():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, token, display_name, school_id FROM student ORDER BY id").fetchall()
    return [dict(r) for r in rows]


@app.get("/students/{student_id}/journals")
def journals(student_id: int):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, raw_text, refined_text, created_at FROM journal "
            "WHERE student_id=? ORDER BY id", (student_id,)).fetchall()
        sigs = conn.execute(
            "SELECT id, score, color, breakdown_json, created_at, teacher_note, note_at "
            "FROM signal_history WHERE student_id=? ORDER BY id", (student_id,)).fetchall()
    return {
        "journals": [dict(r) for r in rows],
        "signals": [{**dict(s), "breakdown": json.loads(s["breakdown_json"])} for s in sigs],
    }


@app.get("/protocols")
def protocols(student_id: int | None = None):
    """사안별 행동지침. student_id 주면 그 학생의 최근 활성 사안을 상단 정렬."""
    active = []
    if student_id is not None:
        with get_conn() as conn:
            last = conn.execute(
                "SELECT breakdown_json FROM signal_history WHERE student_id=? "
                "ORDER BY id DESC LIMIT 1", (student_id,)).fetchone()
        if last:
            active = list(json.loads(last["breakdown_json"]).get("categories", {}).keys())
    return {"active": active, "protocols": get_protocols(active)}


@app.get("/dashboard")
def dashboard():
    """관리자 총괄: 학생별 최근 신호 + 학교별 색 분포 + 적색 목록."""
    with get_conn() as conn:
        students = conn.execute(
            "SELECT s.id, s.token, s.display_name, sc.preset AS school "
            "FROM student s LEFT JOIN school sc ON s.school_id=sc.id ORDER BY s.id").fetchall()
        rows = []
        for s in students:
            last = conn.execute(
                "SELECT score, color, created_at FROM signal_history "
                "WHERE student_id=? ORDER BY id DESC LIMIT 1", (s["id"],)).fetchone()
            rows.append({**dict(s),
                         "color": last["color"] if last else "none",
                         "score": last["score"] if last else None,
                         "updated": last["created_at"] if last else None})
    by_school = {}
    for r in rows:
        b = by_school.setdefault(r["school"] or "?", {"green": 0, "yellow": 0, "red": 0, "none": 0})
        b[r["color"]] = b.get(r["color"], 0) + 1
    reds = [r for r in rows if r["color"] == "red"]
    return {"students": rows, "by_school": by_school, "reds": reds, "total": len(rows)}


class JournalIn(BaseModel):
    student_id: int
    text: str
    school: str = "A"


@app.post("/journals")
def add_journal(body: JournalIn):
    result = process(body.text, body.school)
    now = datetime.now().isoformat(timespec="seconds")
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO journal(student_id, raw_text, refined_text, created_at) "
            "VALUES(?,?,?,?)",
            (body.student_id, body.text, result["refined_text"], now))
        conn.execute(
            "INSERT INTO signal_history(student_id, score, color, breakdown_json, created_at) "
            "VALUES(?,?,?,?,?)",
            (body.student_id, result["rule"]["score"], result["rule"]["color"],
             json.dumps(result["rule"], ensure_ascii=False), now))
        jid = cur.lastrowid
    return {"journal_id": jid, "created_at": now, **result}


class NoteIn(BaseModel):
    note: str


@app.post("/signals/{signal_id}/note")
def set_signal_note(signal_id: int, body: NoteIn):
    """교사 소견 기록 — 신호등 색은 규칙이 고정. 교사의 이의·동의·대응 사유만 감사기록으로 남긴다."""
    now = datetime.now().isoformat(timespec="seconds")
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE signal_history SET teacher_note=?, note_at=? WHERE id=?",
            (body.note, now, signal_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="signal not found")
    return {"ok": True, "signal_id": signal_id, "teacher_note": body.note, "note_at": now}


class AssessIn(BaseModel):
    text: str
    school: str = "A"


@app.post("/assess")
def assess_only(body: AssessIn):
    """저장 없이 즉석 평가(라이브 신호등 미리보기용). 타자마다 호출 → 규칙만(LLM 미사용)."""
    return process(body.text, body.school, llm=False)


def _resources_and_laws(rule: dict, school: str, live: bool = False):
    """규칙 분류 → 자원유형·법령. 특정 유형 없고 일반 위기신호만 있으면 기본 자원·근거로 폴백.

    live=True면 법제처 실시간 확인(slow 경로 전용)."""
    resource_kinds = []
    for cat_id in rule["categories"]:
        for k in CASE_RESOURCES.get(cat_id, []):
            if k not in resource_kinds:
                resource_kinds.append(k)
    laws = laws_for(rule["categories"], live=live)
    if not resource_kinds and rule["general_factors"]["score"] > 0:
        # 유형 미분류 + 일반신호(결석·위축·고립 등) → 교내 상담 우선 기본 연계.
        resource_kinds = ["wee_class", "청소년상담복지센터"]
        laws = laws_for({"general": True}, live=live)
    return resource_kinds, laws


@app.post("/evidence")
def evidence(body: AssessIn):
    """근거·자원 패널 — 규칙 분류 기준 법령 큐레이션 + 자원매칭(실시간+캐시폴백)."""
    rule = assess(body.text, body.school)
    resource_kinds, laws = _resources_and_laws(rule, body.school)
    return {
        "color": rule["color"],
        "labels": rule["labels"],
        "laws": laws,
        "resources": match(resource_kinds, body.school),
    }


@app.post("/package")
def committee_package(body: AssessIn):
    """위기관리위원회 참고자료 패키지 — 신호등+법령+자원+보고서초안(검증패스) 묶음."""
    rule = assess(body.text, body.school)
    resource_kinds, laws = _resources_and_laws(rule, body.school, live=True)
    refined = refine(body.text)
    report = build_report(refined, rule)
    return {
        "signal": {"color": rule["color"], "score": rule["score"],
                   "labels": rule["labels"], "floor_reasons": rule["floor_reasons"]},
        "laws": laws,
        "resources": match(resource_kinds, body.school),
        "report": report,
    }


# 단일 도메인 배포: 빌드된 프런트(frontend/dist)를 같은 서버에서 서빙.
# 모든 API 라우트 등록 후 마지막에 마운트해야 API가 우선한다.
def _find_dist() -> Path | None:
    env = os.getenv("FRONTEND_DIST")
    here = Path(__file__).resolve()
    candidates = [Path(env)] if env else []
    candidates += [p / "frontend" / "dist" for p in here.parents[:4]]
    return next((c for c in candidates if c.exists()), None)


_DIST = _find_dist()
if _DIST:
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="static")
