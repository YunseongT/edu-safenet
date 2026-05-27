"""자원매칭 — 교내(학교알리미) 우선 → 교외(실시간 API + 캐시 폴백).

데모 안전 원칙: 외부 API를 실제로 호출하되, 실패·키없음·지연 시 마지막 캐시로 대체.
신호등은 이 모듈에 의존하지 않는다(라이브 경로 보호).

실 API: HIRA 병원정보 · 여가부 청소년상담복지센터 · VWorld 지오코딩(주소→좌표).
data.go.kr 공통 일반 인증키는 DATA_GO_KR_API_KEY로 받고, 서비스별 키가 따로 있으면 우선.
"""
import json
import math
import os
from pathlib import Path

import httpx

CACHE_PATH = Path(__file__).resolve().parent / "resource_cache.json"

# 통학구역 중심(=학교 비식별 좌표). 외부 자원은 이 중심 기준으로 표시(데모 좌표).
SCHOOL_CENTER = [37.5012, 127.0396]


def _key(name: str) -> str | None:
    """서비스 전용 키 → 없으면 data.go.kr 공통 일반 인증키."""
    return os.getenv(name) or os.getenv("DATA_GO_KR_API_KEY")


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


# 자원유형별 데모 좌표/지도그룹. 실시간 호출 성공 시 주소→좌표 지오코딩으로 대체.
def _seed_cache() -> dict:
    return {
        "정신건강의학과": [
            {"name": "○○정신건강의학과의원", "addr": "통학구역 인근 1.2km", "tel": "공개정보",
             "source": "HIRA 병원정보(캐시)", "lat": 37.5085, "lng": 127.0490, "group": "medical"},
        ],
        "정신건강복지센터": [
            {"name": "○○구 정신건강복지센터", "addr": "구청 인근 2.0km", "tel": "1577-0199",
             "source": "공공데이터(캐시)", "lat": 37.4980, "lng": 127.0560, "group": "medical"},
        ],
        "아동보호전문기관": [
            {"name": "○○지역 아동보호전문기관", "addr": "관할 3.1km", "tel": "112 / 1391",
             "source": "공공데이터(캐시)", "lat": 37.4760, "lng": 127.0300, "group": "child"},
        ],
        "청소년상담복지센터": [
            {"name": "○○시 청소년상담복지센터(CYS-Net)", "addr": "시내 2.5km", "tel": "1388",
             "source": "여가부(캐시)", "lat": 37.5180, "lng": 127.0250, "group": "counsel"},
        ],
        "특수교육지원센터": [
            {"name": "○○교육지원청 특수교육지원센터", "addr": "교육지원청 4.0km", "tel": "공개정보",
             "source": "공공데이터(캐시)", "lat": 37.5300, "lng": 127.0600, "group": "special"},
        ],
    }


def _dist_km(lat: float, lng: float) -> float:
    """통학구역 중심에서의 거리(km) — 하버사인."""
    a, b = SCHOOL_CENTER[0], SCHOOL_CENTER[1]
    p = math.pi / 180
    h = (math.sin((lat - a) * p / 2) ** 2
         + math.cos(a * p) * math.cos(lat * p) * math.sin((lng - b) * p / 2) ** 2)
    return round(2 * 6371 * math.asin(math.sqrt(h)), 1)


def _geocode(addr: str) -> tuple[float, float] | None:
    """VWorld 지오코딩: 주소 → (lat, lng). 키없음·실패 시 None."""
    key = os.getenv("VWORLD_API_KEY")
    if not key or not addr:
        return None
    for atype in ("road", "parcel"):
        try:
            r = httpx.get(
                "https://api.vworld.kr/req/address",
                params={"service": "address", "request": "getcoord", "version": "2.0",
                        "crs": "epsg:4326", "address": addr, "type": atype,
                        "format": "json", "key": key},
                timeout=4.0)
            r.raise_for_status()
            pt = r.json()["response"]["result"]["point"]
            return float(pt["y"]), float(pt["x"])
        except Exception:
            continue
    return None


def _fetch_live(kind: str) -> list[dict] | None:
    """실시간 호출 시도. 키 없거나 실패 시 None → 호출부가 캐시로 폴백."""
    if kind == "정신건강의학과" and _key("HIRA_API_KEY"):
        try:
            # HIRA 위치기반(radius) 호출은 서버측 계산이 느려 타임아웃 잦음.
            # 빠른 기본 조회로 좌표 포함 다수를 받아 통학구역 기준 거리순 정렬·근접 5개.
            r = httpx.get(
                os.getenv("HIRA_API_ENDPOINT",
                          "https://apis.data.go.kr/B551182/hospInfoServicev2") +
                "/getHospBasisList",
                params={"serviceKey": _key("HIRA_API_KEY"), "_type": "json",
                        "dgsbjtCd": "23", "numOfRows": 50},
                timeout=6.0)
            r.raise_for_status()
            items = r.json()["response"]["body"]["items"]["item"]
            if isinstance(items, dict):
                items = [items]
            scored = []
            for it in items:
                if not (it.get("XPos") and it.get("YPos")):
                    continue
                lat, lng = float(it["YPos"]), float(it["XPos"])
                scored.append((_dist_km(lat, lng), it, lat, lng))
            scored.sort(key=lambda t: t[0])
            live = [{"name": it.get("yadmNm"),
                     "addr": f"{it.get('addr')} (약 {d}km)" if it.get("addr") else f"약 {d}km",
                     "tel": it.get("telno"), "source": "HIRA 병원정보(실시간·거리순)",
                     "lat": lat, "lng": lng, "group": "medical"}
                    for d, it, lat, lng in scored[:5]]
            if live:
                _save_to_cache(kind, live)
                return live
            return None
        except Exception:
            return None

    if kind == "청소년상담복지센터" and _key("TEEN_COUNSEL_API_KEY"):
        try:
            # operation 경로는 data.go.kr 서비스 Swagger에서 확인 후 TEEN_COUNSEL_OPERATION에 지정.
            # (서비스 alias != operation이라 추정 불가 — 미설정 시 캐시 폴백)
            op = os.getenv("TEEN_COUNSEL_OPERATION")
            if not op:
                return None
            r = httpx.get(
                os.getenv("TEEN_COUNSEL_API_ENDPOINT",
                          "https://apis.data.go.kr/1383000/gmis/teenDscsnSrcnServiceV2") +
                "/" + op,
                params={"serviceKey": _key("TEEN_COUNSEL_API_KEY"), "type": "json",
                        "numOfRows": 5, "pageNo": 1},
                timeout=4.0)
            r.raise_for_status()
            items = r.json()["response"]["body"]["items"]["item"]
            if isinstance(items, dict):
                items = [items]
            live = []
            for it in items:
                addr = it.get("adres") or it.get("addr")
                coord = _geocode(addr) if addr else None
                live.append({"name": it.get("fcltyNm") or it.get("instNm") or "청소년상담복지센터",
                             "addr": addr, "tel": it.get("telno") or "1388",
                             "source": "여가부(실시간)",
                             "lat": coord[0] if coord else None,
                             "lng": coord[1] if coord else None, "group": "counsel"})
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
    return {"외부전송_데이터": {"통학구역_중심좌표": SCHOOL_CENTER, "사안코드": "C-RED"},
            "포함되지_않음": ["학생명", "주소", "주민번호", "연락처"]}


def match(case_resources: list[str], school: str) -> dict:
    internal = SCHOOL_INTERNAL.get(school, SCHOOL_INTERNAL["A"])
    cache = _load_cache() or _seed_cache()

    internal_out, external_out, points = [], [], []
    # 학교(통학구역 중심) 마커는 항상 표시.
    points.append({"kind": "학교(통학구역 중심)", "name": "본교",
                   "lat": SCHOOL_CENTER[0], "lng": SCHOOL_CENTER[1], "group": "school"})

    for kind in case_resources:
        if kind == "wee_class":
            internal_out.append({
                "kind": "교내 Wee클래스",
                "available": internal["wee_class"],
                "note": internal["note"],
                "source": "학교알리미 OpenAPI",
            })
            if internal["wee_class"]:
                points.append({"kind": "교내 Wee클래스", "name": "교내 Wee클래스",
                               "lat": SCHOOL_CENTER[0] + 0.0008, "lng": SCHOOL_CENTER[1] + 0.0008,
                               "group": "wee"})
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
            for it in items:
                if it.get("lat") and it.get("lng"):
                    points.append({"kind": kind, "name": it.get("name"),
                                   "lat": it["lat"], "lng": it["lng"],
                                   "group": it.get("group", "etc")})
    return {
        "internal": internal_out,
        "external": external_out,
        "map": {"center": SCHOOL_CENTER, "points": points},
        "deidentified": deidentified_payload(school),
    }
