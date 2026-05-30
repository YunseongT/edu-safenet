"""신호등 하네스 — 결정적 규칙 점수. LLM 없이 재현·설명 가능.

흐름: 요인 탐지(가중합) → 복합 배수 → floor(OR) → 학교별 임계값 → 색.
색·floor·분류는 항상 규칙이 최종. LLM은 engine 밖에서 보조만 한다.
"""
from .cases import (
    CATEGORIES,
    COMPOSITE_FACTORS,
    DEFAULT_COMPOSITE_FACTOR,
    FLOOR_COMBOS,
    GENERAL_FACTORS,
    SCALE_FACTORS,
)

# 학교별 임계값(학교알리미 자원역량 근거). 자원 부족 학교일수록 경계 낮음(조기경보).
# D4에서 학교알리미 실데이터로 근거를 채운다. 여기선 프리셋 2종.
SCHOOL_PRESETS = {
    "A": {"name": "A학교(상담전문가·Wee 보유)", "yellow": 4, "red": 8},
    "B": {"name": "B학교(상담자원 부족)", "yellow": 3, "red": 6},
}


def _scan(text: str, keywords):
    hits, score = [], 0
    for kw, w in keywords:
        if kw in text:
            hits.append({"keyword": kw, "weight": w})
            score += w
    return hits, score


def combine_obs(journal: str, counsel: str = "") -> str:
    """일지 + 상담기록을 한 텍스트로 합쳐 스캔 대상으로. 덱: 일지·상담기록 합산 산출."""
    counsel = (counsel or "").strip()
    return f"{journal}\n[상담기록] {counsel}" if counsel else journal


def _scan_scores(scores: dict | None):
    """검사점수 척도 → 가중치·floor. 미입력·미정의·기준미달은 무시(빈 결과)."""
    hits, score, floor_reasons = [], 0, []
    if not scores:
        return hits, score, floor_reasons
    for key, cfg in SCALE_FACTORS.items():
        if scores.get(key) in (None, ""):
            continue
        try:
            val = float(scores[key])
        except (TypeError, ValueError):
            continue
        if val >= cfg["red"]:
            w, level = cfg["weight_red"], "red"
        elif val >= cfg["yellow"]:
            w, level = cfg["weight_yellow"], "yellow"
        else:
            continue
        hits.append({"key": key, "label": cfg["label"], "value": val, "weight": w, "level": level})
        score += w
        if cfg.get("floor_at") is not None and val >= cfg["floor_at"]:
            floor_reasons.append(f"{cfg['label']} 고위험 점수({val:g})")
    return hits, score, floor_reasons


def assess(text: str, school: str = "A", scores: dict | None = None) -> dict:
    preset = SCHOOL_PRESETS.get(school, SCHOOL_PRESETS["A"])

    # 1) 유형별 + 일반 요인 + 검사점수 탐지
    categories = {}
    for cat_id, cfg in CATEGORIES.items():
        hits, sub = _scan(text, cfg["keywords"])
        if sub > 0:
            categories[cat_id] = {
                "label": cfg["label"], "floor": cfg["floor"],
                "subscore": sub, "hits": hits,
            }
    gen_hits, gen_score = _scan(text, GENERAL_FACTORS)
    scale_hits, scale_score, scale_floor = _scan_scores(scores)

    active = set(categories)
    raw = sum(c["subscore"] for c in categories.values()) + gen_score + scale_score

    # 2) 복합 배수
    factor = 1.0
    if len(active) >= 2:
        factor = COMPOSITE_FACTORS.get(frozenset(active), DEFAULT_COMPOSITE_FACTOR)
    adjusted = round(raw * factor, 2)

    # 3) floor(OR): 위해 유형 강신호(subscore>=3) 또는 지정 복합조합.
    #    약/모호 키워드 단독으로 적색 오탐 방지(예: '멍이' 1회 ≠ 즉시 적색).
    FLOOR_MIN = 3
    floor_reasons = []
    for cat_id, c in categories.items():
        if c["floor"] and c["subscore"] >= FLOOR_MIN:
            floor_reasons.append(f"{c['label']} 신호 탐지")
    for combo in FLOOR_COMBOS:
        if combo.issubset(active):
            labels = " + ".join(CATEGORIES[c]["label"] for c in combo)
            floor_reasons.append(f"고위험 복합조합({labels})")
    floor_reasons += scale_floor  # 검사점수 고위험(자살위험 문항 등) → 즉시 적색

    # 4) 색 결정
    if floor_reasons:
        color = "red"
    elif adjusted >= preset["red"]:
        color = "red"
    elif adjusted >= preset["yellow"]:
        color = "yellow"
    else:
        color = "green"

    return {
        "color": color,
        "score": adjusted,
        "raw_score": raw,
        "composite_factor": factor,
        "floor_triggered": bool(floor_reasons),
        "floor_reasons": floor_reasons,
        "categories": categories,
        "general_factors": {"hits": gen_hits, "score": gen_score},
        "scale_factors": {"hits": scale_hits, "score": scale_score},
        "labels": [c["label"] for c in categories.values()],
        "school": {"key": school, **preset},
    }
