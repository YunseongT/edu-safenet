"""자원매칭 — 교내(학교알리미) 우선 → 교외(실시간 API + 캐시 폴백).

데모 안전 원칙: 외부 API를 실제로 호출하되, 실패·키없음·지연 시 마지막 캐시로 대체.
신호등은 이 모듈에 의존하지 않는다(라이브 경로 보호).
"""
import json
import os
from pathlib import Path

import httpx

CACHE_PATH = Path(__file__).resolve().parent / "resource_cache.json"

# 학교알리미 기반 교내 자원 보유(학교별). 실배포 시 OpenAPI(상담현황·Wee클래스 설치여부).
SCHOOL_INTERNAL = {
    "A": {"wee_class": True, "counselor_internal": True,
          "note": "교내 Wee클래스 운영 · 내부 상담전문가 배치(학교알리미 공시 기준)"},
    "B": {"wee_class": False, "counselor_internal": False,
          "note": "교내 Wee클래스 미설치 · 외부 상담자원 연계 필요(학교알리미 공시 기준)"},
}

# 캐시(=마지막 성공 응답 또는 시드). 외부 API 죽어도 이걸로 표시.
def _load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def _seed_cache() -> dict:
    return {
        "정신건강의학과": [
            {"name": "○○정신건강의학과의원", "addr": "통학구역 인근 1.2km", "tel": "공개정보",
             "source": "HIRA 병원정보(캐시)"},
        ],
        "정신건강복지센터": [
            {"name": "○○구 정신건강복지센터", "addr": "구청 인근 2.0km", "tel": "1577-0199",
             "source": "공공데이터(캐시)"},
        ],
        "아동보호전문기관": [
            {"name": "○○지역 아동보호전문기관", "addr": "관할 3.1km", "tel": "112 / 1391",
             "source": "공공데이터(캐시)"},
        ],
        "청소년상담복지센터": [
            {"name": "○○시 청소년상담복지센터(CYS-Net)", "addr": "시내 2.5km", "tel": "1388",
             "source": "여가부(캐시)"},
        ],
        "특수교육지원센터": [
            {"name": "○○교육지원청 특수교육지원센터", "addr": "교육지원청 4.0km", "tel": "공개정보",
             "source": "공공데이터(캐시)"},
        ],
    }


def _fetch_live(kind: str) -> list[dict] | None:
    """실시간 호출 시도. 키 없거나 실패 시 None → 호출부가 캐시로 폴백."""
    if kind == "정신건강의학과" and os.getenv("HIRA_API_KEY"):
        try:
            # HIRA 병원정보서비스 (정신건강의학과 표시과목) — 키 있을 때만 실제 호출
            r = httpx.get(
                "http://apis.data.go.kr/B551182/hospInfoServicebyLocation/getHospBasisList",
                params={"serviceKey": os.getenv("HIRA_API_KEY"), "_type": "json",
                        "dgsbjtCd": "23", "numOfRows": 5},
                timeout=4.0)
            r.raise_for_status()
            items = r.json()["response"]["body"]["items"]["item"]
            live = [{"name": it.get("yadmNm"), "addr": it.get("addr"),
                     "tel": it.get("telno"), "source": "HIRA 병원정보(실시간)"} for it in items]
            _save_to_cache(kind, live)
            return live
        except Exception:
            return None
    return None


def _save_to_cache(kind: str, items: list[dict]) -> None:
    cache = _load_cache()
    cache[kind] = items
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


# 비식별: 외부로는 좌표·코드만 나간다(시연용 표기).
def deidentified_payload(school: str) -> dict:
    return {"외부전송_데이터": {"통학구역_중심좌표": [37.5012, 127.0396], "사안코드": "C-RED"},
            "포함되지_않음": ["학생명", "주소", "주민번호", "연락처"]}


def match(case_resources: list[str], school: str) -> dict:
    internal = SCHOOL_INTERNAL.get(school, SCHOOL_INTERNAL["A"])
    cache = _load_cache() or _seed_cache()

    internal_out, external_out = [], []
    for kind in case_resources:
        if kind == "wee_class":
            internal_out.append({
                "kind": "교내 Wee클래스",
                "available": internal["wee_class"],
                "note": internal["note"],
                "source": "학교알리미 OpenAPI",
            })
        elif kind in ("112_신고", "학교폭력대책심의위원회"):
            internal_out.append({"kind": kind, "available": True,
                                 "note": "법정 절차 · 교내/관할 연계", "source": "법령 절차"})
        else:
            live = _fetch_live(kind)
            items = live if live is not None else cache.get(kind, [])
            external_out.append({
                "kind": kind,
                "source_mode": "실시간" if live is not None else "캐시 폴백",
                "items": items,
            })
    return {
        "internal": internal_out,
        "external": external_out,
        "deidentified": deidentified_payload(school),
    }
