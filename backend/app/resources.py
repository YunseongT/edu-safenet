"""자원매칭 — 교내(학교알리미) 우선 → 교외(실시간 API + 캐시 폴백).

데모 안전 원칙: 외부 API를 실제로 호출하되, 실패·키없음·지연 시 마지막 캐시로 대체.
신호등은 이 모듈에 의존하지 않는다(라이브 경로 보호).

실 API: HIRA 병원정보 · 여가부 청소년상담복지센터 · VWorld 지오코딩(주소→좌표).
data.go.kr 공통 일반 인증키는 DATA_GO_KR_API_KEY로 받고, 서비스별 키가 따로 있으면 우선.

지역(시군구) 프리셋으로 통학구역 중심을 바꾸면, 외부 자원은 그 중심 기준 거리순·
근접 표시된다(HIRA 실시간은 전국 응답을 중심 기준 정렬, 캐시 폴백은 중심 주변 시드).
"""
import json
import math
import os
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

CACHE_PATH = Path(__file__).resolve().parent / "resource_cache.json"

# 지역(시군구) 프리셋 — 통학구역 중심(=학교 비식별 좌표). 권역별 데모 5종.
REGIONS = {
    "seoul_gangnam":  {"label": "서울 강남구",  "center": [37.5012, 127.0396]},
    "gyeonggi_suwon": {"label": "경기 수원시",  "center": [37.2636, 127.0286]},
    "daejeon_seo":    {"label": "대전 서구",    "center": [36.3550, 127.3839]},
    "gangwon_chuncheon": {"label": "강원 춘천시", "center": [37.8813, 127.7300]},
    "busan_haeundae": {"label": "부산 해운대구", "center": [35.1631, 129.1635]},
}
DEFAULT_REGION = "seoul_gangnam"
STATIC_RETRIEVED_AT = "2026-05-18T09:00:00"
SCHOOLINFO_ENDPOINT = "https://www.schoolinfo.go.kr/openApi.do"
SCHOOLINFO_API_TYPE_COUNSELING = "61"

SCHOOLINFO_REGION_PARAMS = {
    "seoul_gangnam": {"sidoCode": "11", "sggCode": "11680"},
    "gyeonggi_suwon": {"sidoCode": "41", "sggCode": "41115"},  # 수원 팔달구(41110은 학교알리미 미존재 코드 → 0건)
    "daejeon_seo": {"sidoCode": "30", "sggCode": "30170"},
    "gangwon_chuncheon": {"sidoCode": "51", "sggCode": "51110"},
    "busan_haeundae": {"sidoCode": "26", "sggCode": "26350"},
}


def region_center(region: str | None) -> list[float]:
    return REGIONS.get(region or DEFAULT_REGION, REGIONS[DEFAULT_REGION])["center"]


def _key(name: str) -> str | None:
    """서비스 전용 키 → 없으면 data.go.kr 공통 일반 인증키."""
    return os.getenv(name) or os.getenv("DATA_GO_KR_API_KEY")


def _source_meta(source_type: str, source_name: str, stale_reason: str | None = None) -> dict:
    return {
        "source_type": source_type,
        "source_name": source_name,
        "retrieved_at": STATIC_RETRIEVED_AT,
        "stale_reason": stale_reason,
    }


def _live_source_meta(source_name: str) -> dict:
    return {
        "source_type": "live",
        "source_name": source_name,
        "retrieved_at": datetime.now().isoformat(timespec="seconds"),
        "stale_reason": None,
    }


def _items_with_source(items: list[dict], source_type: str, source_name: str, stale_reason: str | None) -> list[dict]:
    meta = _source_meta(source_type, source_name, stale_reason)
    return [{**it, **meta} for it in items]


# 학교알리미 기반 교내 자원 보유(학교별). 실배포 시 OpenAPI(상담현황·Wee클래스 설치여부).
SCHOOL_INTERNAL = {
    "A": {"wee_class": True, "counselor_internal": True,
          "note": "교내 Wee클래스 운영 · 내부 상담전문가 배치(학교알리미 공시 기준)"},
    "B": {"wee_class": False, "counselor_internal": False,
          "note": "교내 Wee클래스 미설치 · 외부 상담자원 연계 필요(학교알리미 공시 기준)"},
}


# 자원유형별 중심 대비 좌표 오프셋(시드). 지역을 바꿔도 중심 주변에 그려지게 상대좌표로 둔다.
_SEED_OFFSETS = {
    "정신건강의학과": [
        {"name": "○○정신건강의학과의원", "tel": "공개정보",
         "source": "HIRA 병원정보(캐시)", "d": (0.0073, 0.0094), "group": "medical"},
    ],
    "정신건강복지센터": [
        {"name": "○○구 정신건강복지센터", "tel": "1577-0199",
         "source": "공공데이터(캐시)", "d": (-0.0032, 0.0164), "group": "medical"},
    ],
    "아동보호전문기관": [
        {"name": "○○지역 아동보호전문기관", "tel": "112 / 1391",
         "source": "공공데이터(캐시)", "d": (-0.0252, -0.0096), "group": "child"},
    ],
    "청소년상담복지센터": [
        {"name": "○○시 청소년상담복지센터(CYS-Net)", "tel": "1388",
         "source": "여가부(캐시)", "d": (0.0168, -0.0146), "group": "counsel"},
    ],
    "특수교육지원센터": [
        {"name": "○○교육지원청 특수교육지원센터", "tel": "공개정보",
         "source": "공공데이터(캐시)", "d": (0.0288, 0.0204), "group": "special"},
    ],
}


def _dist_km(lat: float, lng: float, center: list[float]) -> float:
    """통학구역 중심에서의 거리(km) — 하버사인."""
    a, b = center[0], center[1]
    p = math.pi / 180
    h = (math.sin((lat - a) * p / 2) ** 2
         + math.cos(a * p) * math.cos(lat * p) * math.sin((lng - b) * p / 2) ** 2)
    return round(2 * 6371 * math.asin(math.sqrt(h)), 1)


# 캐시(=마지막 성공 응답). 지역별로 분리 저장(권역 바뀌어도 섞이지 않게).
def _load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def _seed_for(kind: str, center: list[float]) -> list[dict]:
    """중심 좌표 주변에 배치한 시드 자원(외부 API 죽거나 키없을 때 폴백)."""
    out = []
    meta = _source_meta("cached", f"{kind} 시드 캐시", "온프레미스 기본값은 해당 공공데이터 실시간 API를 호출하지 않음")
    for s in _SEED_OFFSETS.get(kind, []):
        lat, lng = center[0] + s["d"][0], center[1] + s["d"][1]
        out.append({"name": s["name"], "addr": f"통학구역 중심 인근 약 {_dist_km(lat, lng, center)}km",
                    "tel": s["tel"], "source": s["source"],
                    "lat": lat, "lng": lng, "group": s["group"], **meta})
    return out


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


def _schoolinfo_key() -> str | None:
    return os.getenv("SCHOOLINFO_API_KEY") or os.getenv("DATA_GO_KR_API_KEY")


def _schoolinfo_params(region: str, school: str | None = None) -> dict:
    params = SCHOOLINFO_REGION_PARAMS.get(region, SCHOOLINFO_REGION_PARAMS[DEFAULT_REGION]).copy()
    # 데모 학교를 특정 코드에 고정한 경우, 그 학교가 속한 지역으로 조회(UI region과 무관).
    if school:
        sido = os.getenv(f"SCHOOLINFO_{school}_SIDO_CODE")
        sgg = os.getenv(f"SCHOOLINFO_{school}_SGG_CODE")
        if sido and sgg:
            params["sidoCode"], params["sggCode"] = sido, sgg
        knd = os.getenv(f"SCHOOLINFO_{school}_SCHUL_KND_CODE")
        if knd:
            params["schulKndCode"] = knd
            return params
    params["schulKndCode"] = os.getenv("SCHOOLINFO_SCHUL_KND_CODE", "03")
    return params


def _yn(value) -> bool:
    return str(value or "").strip().upper() in ("Y", "YES", "1", "TRUE", "O", "설치", "있음")


def _select_schoolinfo_row(rows: list[dict], school: str) -> dict | None:
    code = os.getenv(f"SCHOOLINFO_{school}_SCHUL_CODE") or os.getenv("SCHOOLINFO_SCHUL_CODE")
    name = os.getenv(f"SCHOOLINFO_{school}_SCHUL_NM") or os.getenv("SCHOOLINFO_SCHUL_NM")
    if code:
        return next((r for r in rows if str(r.get("SCHUL_CODE")) == code), None)
    if name:
        return next((r for r in rows if name in str(r.get("SCHUL_NM", ""))), None)
    # 코드·이름 미지정(범용 데모) 시에만 첫 행. 지정했는데 못 찾으면 None → 프리셋 폴백.
    return rows[0] if rows else None


def _fetch_schoolinfo_internal(school: str, region: str) -> dict | None:
    key = _schoolinfo_key()
    if not key:
        return None
    try:
        data = {
            "apiKey": key,
            "apiType": SCHOOLINFO_API_TYPE_COUNSELING,
            # 당해년도 공시는 미확정(값 뒤집힘·필드 누락) → 직전 완료 연도 기본.
            "pbanYr": os.getenv("SCHOOLINFO_PBAN_YR", str(datetime.now().year - 1)),
            **_schoolinfo_params(region, school),
        }
        r = httpx.post(os.getenv("SCHOOLINFO_API_ENDPOINT", SCHOOLINFO_ENDPOINT), data=data, timeout=8.0)
        r.raise_for_status()
        payload = r.json()
        if payload.get("resultCode") != "success":
            return None
        rows = payload.get("list") or []
        if isinstance(rows, dict):
            rows = [rows]
        row = _select_schoolinfo_row(rows, school)
        if not row:
            return None
        school_name = row.get("SCHUL_NM") or "조회 학교"
        wee = _yn(row.get("WEE_CINSTL_YN"))
        internal_counsel = _yn(row.get("INNER_CNSL_SPLST_OPER_YN"))
        counsel_count = row.get("COSE_CNSL_TLGM_TCR_FGR")
        note = (
            f"{school_name} 학교알리미 기준 · "
            f"WEE클래스 {'설치' if wee else '미설치'} · "
            f"내부상담전문가 {'운영' if internal_counsel else '미운영'}"
        )
        if counsel_count is not None:
            note += f" · 내부상담실적 {counsel_count}건"
        return {
            "kind": "교내 Wee클래스",
            "available": wee,
            "note": note,
            "source": "학교알리미 OpenAPI",
            "school_name": school_name,
            "school_code": row.get("SCHUL_CODE"),
            "internal_counselor": internal_counsel,
            "internal_counsel_count": counsel_count,
            **_live_source_meta("학교알리미 OpenAPI"),
        }
    except Exception:
        return None


def _fetch_live(kind: str, center: list[float]) -> list[dict] | None:
    """실시간 호출 시도. 키 없거나 실패 시 None → 호출부가 캐시로 폴백.

    center 기준 거리순 정렬·근접 표시(지역 프리셋 반영)."""
    if kind == "정신건강의학과" and _key("HIRA_API_KEY"):
        try:
            # HIRA 위치기반(radius) 호출은 서버측 계산이 느려 타임아웃 잦음.
            # 빠른 기본 조회로 좌표 포함 다수를 받아 중심 기준 거리순 정렬·근접 5개.
            r = httpx.get(
                os.getenv("HIRA_API_ENDPOINT",
                          "https://apis.data.go.kr/B551182/hospInfoServicev2") +
                "/getHospBasisList",
                params={"serviceKey": _key("HIRA_API_KEY"), "_type": "json",
                        "dgsbjtCd": "23", "numOfRows": 200},
                timeout=9.0)
            r.raise_for_status()
            items = r.json()["response"]["body"]["items"]["item"]
            if isinstance(items, dict):
                items = [items]
            scored = []
            for it in items:
                if not (it.get("XPos") and it.get("YPos")):
                    continue
                lat, lng = float(it["YPos"]), float(it["XPos"])
                scored.append((_dist_km(lat, lng, center), it, lat, lng))
            scored.sort(key=lambda t: t[0])
            live = [{"name": it.get("yadmNm"),
                     "addr": f"{it.get('addr')} (약 {d}km)" if it.get("addr") else f"약 {d}km",
                     "tel": it.get("telno"), "source": "HIRA 병원정보(실시간·거리순)",
                     "lat": lat, "lng": lng, "group": "medical",
                     **_live_source_meta("HIRA 병원정보 실시간 API")}
                    for d, it, lat, lng in scored[:5]]
            if live:
                return live
            return None
        except Exception:
            return None
    return None


def _save_to_cache(kind: str, items: list[dict], region: str) -> None:
    cache = _load_cache()
    cache[f"{region}:{kind}"] = items
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


# 비식별: 외부로는 좌표·코드만 나간다(시연용 표기).
def deidentified_payload(school: str, center: list[float], color: str = "green") -> dict:
    return {"외부전송_데이터": {"통학구역_중심좌표": center, "사안코드": f"C-{color.upper()}"},
            "포함되지_않음": ["학생명", "주소", "주민번호", "연락처"]}


def match(case_resources: list[str], school: str, region: str | None = None, color: str = "green") -> dict:
    internal = SCHOOL_INTERNAL.get(school, SCHOOL_INTERNAL["A"])
    region = region if region in REGIONS else DEFAULT_REGION
    center = region_center(region)
    cache = _load_cache()

    internal_out, external_out, points = [], [], []
    # 학교(통학구역 중심) 마커는 항상 표시.
    points.append({"kind": "학교(통학구역 중심)", "name": f"본교 · {REGIONS[region]['label']}",
                   "lat": center[0], "lng": center[1], "group": "school"})

    for kind in case_resources:
        if kind == "wee_class":
            live_internal = _fetch_schoolinfo_internal(school, region)
            if live_internal is not None:
                internal_out.append(live_internal)
            else:
                internal_out.append({
                    "kind": "교내 Wee클래스",
                    "available": internal["wee_class"],
                    "note": internal["note"],
                    "source": "학교알리미 데모 프리셋",
                    **_source_meta("preset", "학교알리미 데모 프리셋", "온프레미스 기본값은 학교알리미 OpenAPI를 호출하지 않음"),
                })
            if internal_out[-1]["available"]:
                points.append({"kind": "교내 Wee클래스", "name": "교내 Wee클래스",
                               "lat": center[0] + 0.0008, "lng": center[1] + 0.0008,
                               "group": "wee"})
        elif kind in ("112_신고", "학교폭력대책심의위원회"):
            internal_out.append({"kind": kind, "available": True,
                                 "note": "법정 절차 · 교내/관할 연계", "source": "법령 절차",
                                 **_source_meta("curated", "법령 절차 큐레이션", None)})
        else:
            live = _fetch_live(kind, center)
            if live is not None:
                _save_to_cache(kind, live, region)
                items, mode = live, "실시간"
                meta = _source_meta("live", f"{kind} 실시간 API", None)
            else:
                cached_items = cache.get(f"{region}:{kind}")
                if cached_items:
                    items = _items_with_source(cached_items, "cached", f"{kind} 최근 성공 캐시", "실시간 API 실패 또는 키 없음")
                else:
                    items = _seed_for(kind, center)
                mode = "캐시 폴백"
                meta = _source_meta("cached", f"{kind} 시드 캐시", "실시간 API 실패 또는 키 없음")
            external_out.append({"kind": kind, "source_mode": mode, "items": items, **meta})
            for it in items:
                if it.get("lat") and it.get("lng"):
                    points.append({"kind": kind, "name": it.get("name"),
                                   "lat": it["lat"], "lng": it["lng"],
                                   "group": it.get("group", "etc")})
    return {
        "internal": internal_out,
        "external": external_out,
        "region": region,
        "map": {"center": center, "points": points, "region_label": REGIONS[region]["label"]},
        "deidentified": deidentified_payload(school, center, color),
    }
