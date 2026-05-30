import os
from datetime import datetime

import httpx

# 대시보드 대표 학교(메타 1줄용). NEIS 교육정보 개방 포털 기준. env로 교체 가능.
NEIS_ENDPOINT = "https://open.neis.go.kr/hub"
DASHBOARD_ATPT = os.getenv("NEIS_DASHBOARD_ATPT_CODE", "B10")        # 서울특별시교육청
DASHBOARD_SCHUL = os.getenv("NEIS_DASHBOARD_SCHUL_CODE", "7091421")  # 개포중학교(강남)


def _school_meta() -> dict:
    """학교 메타 1줄 — NEIS 실데이터(학교명·설립·소재지·학급수). 키없음·실패 시 seed 폴백.

    위험지수는 신호등 모델 집계라 실데이터 없음. 메타만 공공데이터로 앵커(정직한 근거)."""
    seed = {
        "source_type": "seed",
        "source_name": "데모 기준 학교 메타",
        "school_name": "데모 중학교",
        "class_count": 15,
        "foundation": "공립",
        "location": "데모 권역",
        "stale_reason": "NEIS_API_KEY 미설정 또는 호출 실패 시 기획 기준 메타 사용",
    }
    key = os.getenv("NEIS_API_KEY")
    if not key:
        return seed
    try:
        base = {"KEY": key, "Type": "json", "pIndex": 1,
                "ATPT_OFCDC_SC_CODE": DASHBOARD_ATPT, "SD_SCHUL_CODE": DASHBOARD_SCHUL}
        si = httpx.get(f"{NEIS_ENDPOINT}/schoolInfo", params={**base, "pSize": 1}, timeout=6.0)
        si.raise_for_status()
        row = si.json()["schoolInfo"][1]["row"][0]
        ci = httpx.get(f"{NEIS_ENDPOINT}/classInfo",
                       params={**base, "pSize": 200, "AY": str(datetime.now().year - 1)}, timeout=6.0)
        ci.raise_for_status()
        class_count = len(ci.json()["classInfo"][1]["row"])
        return {
            "source_type": "live",
            "source_name": "NEIS 교육정보 개방 포털",
            "school_name": row.get("SCHUL_NM") or seed["school_name"],
            "class_count": class_count,
            "foundation": row.get("FOND_SC_NM") or "",
            "location": row.get("ORG_RDNMA") or "",
            "coedu": row.get("COEDU_SC_NM") or "",
            "retrieved_at": datetime.now().isoformat(timespec="seconds"),
            "stale_reason": None,
        }
    except Exception:
        return seed


def stats() -> dict:
    return {
        "source_type": "seed",
        "source_name": "KEDI/KESS 데모 기준 통계",
        "retrieved_at": "2026-05-18T09:00:00",
        "stale_reason": "위험지수·추이·학급위험은 신호등 모델 집계(기획 기준). 학교 메타는 NEIS 실데이터로 앵커.",
        "school_meta": _school_meta(),
        "risk_index": {
            "school": 0.62,
            "regional_average": 0.45,
            "national_average": 0.40,
        },
        "weekly_trend": [
            {"week": "6주 전", "school": 0.48, "regional_average": 0.42},
            {"week": "5주 전", "school": 0.50, "regional_average": 0.43},
            {"week": "4주 전", "school": 0.53, "regional_average": 0.43},
            {"week": "3주 전", "school": 0.57, "regional_average": 0.44},
            {"week": "2주 전", "school": 0.60, "regional_average": 0.45},
            {"week": "이번 주", "school": 0.62, "regional_average": 0.45},
        ],
        "class_grid": [
            {"grade": 1, "classes": [
                {"class_name": "1-1", "risk": 0.38, "color": "green"},
                {"class_name": "1-2", "risk": 0.44, "color": "green"},
                {"class_name": "1-3", "risk": 0.58, "color": "yellow"},
                {"class_name": "1-4", "risk": 0.47, "color": "green"},
                {"class_name": "1-5", "risk": 0.64, "color": "yellow"},
            ]},
            {"grade": 2, "classes": [
                {"class_name": "2-1", "risk": 0.51, "color": "yellow"},
                {"class_name": "2-2", "risk": 0.66, "color": "yellow"},
                {"class_name": "2-3", "risk": 0.74, "color": "red"},
                {"class_name": "2-4", "risk": 0.43, "color": "green"},
                {"class_name": "2-5", "risk": 0.59, "color": "yellow"},
            ]},
            {"grade": 3, "classes": [
                {"class_name": "3-1", "risk": 0.69, "color": "yellow"},
                {"class_name": "3-2", "risk": 0.72, "color": "red"},
                {"class_name": "3-3", "risk": 0.55, "color": "yellow"},
                {"class_name": "3-4", "risk": 0.49, "color": "green"},
                {"class_name": "3-5", "risk": 0.63, "color": "yellow"},
            ]},
        ],
    }
