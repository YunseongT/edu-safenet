"""케이스별 큐레이션 법령 — 실제 조문 요지 + 출처. 임베딩 없이 결정적 인용.

조문 요지는 큐레이션(결정적). 법제처 국가법령정보 공유서비스(data.go.kr 1170000)로
법령 존재·공식 링크를 실시간 확인(live=True, 위원회 패키지 등 slow 경로에서만).
키없음·실패 시 law.go.kr 검색 링크로 폴백(데모 안전).
"""
import os
import re

import httpx

LAW_BY_CATEGORY = {
    "self_harm": [
        {
            "title": "자살예방 및 생명존중문화 조성을 위한 법률 제2조·제7조",
            "summary": "국가·지자체는 자살위험자 조기발견·개입 체계를 마련하고, 발견 시 적절한 서비스로 연계할 책무가 있다.",
            "source": "국가법령정보센터",
        },
        {
            "title": "학교보건법 제11조(치료 및 예방조치 등)",
            "summary": "학교의 장은 학생의 신체적·정신적 건강에 문제가 있다고 인정되면 보호자와 협의하여 필요한 조치를 하여야 한다.",
            "source": "국가법령정보센터",
        },
    ],
    "abuse": [
        {
            "title": "아동학대범죄의 처벌 등에 관한 특례법 제10조(신고의무)",
            "summary": "교직원은 직무상 아동학대를 알게 되거나 의심이 있는 경우 즉시 수사기관 또는 아동보호전문기관에 신고하여야 한다(신고의무자).",
            "source": "국가법령정보센터",
        },
        {
            "title": "아동복지법 제26조(아동학대 신고의무자에 대한 교육)",
            "summary": "신고의무자는 아동학대 예방·신고의무 관련 교육을 받아야 한다.",
            "source": "국가법령정보센터",
        },
    ],
    "violence": [
        {
            "title": "학교폭력예방 및 대책에 관한 법률 제20조(학교폭력의 신고의무)",
            "summary": "학교폭력 현장을 보거나 사실을 알게 된 자는 학교 등 관계기관에 신고하여야 한다.",
            "source": "국가법령정보센터",
        },
        {
            "title": "동법 제16조(피해학생의 보호)",
            "summary": "심의위원회는 피해학생 보호를 위해 상담·일시보호·치료요양 등 조치를 요청할 수 있다.",
            "source": "국가법령정보센터",
        },
    ],
    "special_ed": [
        {
            "title": "장애인 등에 대한 특수교육법 제15조·제28조",
            "summary": "특수교육대상자 선정 및 통합교육·특수교육 관련서비스(상담지원 등) 제공 근거.",
            "source": "국가법령정보센터",
        },
    ],
    # 특정 유형 미분류 + 일반 위기신호(결석·위축·고립 등)만 있을 때의 기본 근거.
    "general": [
        {
            "title": "학교보건법 제11조(치료 및 예방조치 등)",
            "summary": "학교의 장은 학생의 신체적·정신적 건강에 문제가 있다고 인정되면 보호자와 협의하여 필요한 조치를 하여야 한다.",
            "source": "국가법령정보센터",
        },
        {
            "title": "초·중등교육법 제20조(교직원의 임무)",
            "summary": "교원은 학생을 교육하고 생활을 지도한다 — 위기 징후 관찰 시 교내 상담 등 1차 지도 근거.",
            "source": "국가법령정보센터",
        },
    ],
}


def _law_name(title: str) -> str:
    """'학교폭력예방 및 대책에 관한 법률 제20조(...)' → 법령명만."""
    return title.split(" 제")[0].split("(")[0].strip()


def _article_no(title: str) -> str | None:
    """'... 제20조(...)' / '... 제2조·제7조' → 첫 조 번호('20'). 없으면 None."""
    m = re.search(r"제(\d+)조", title)
    return m.group(1) if m else None


def _article_link(name: str, title: str) -> str:
    """법제처 국가법령정보 조문 딥링크: /법령/{법령명}/제N조 — 클릭 시 해당 조문이 바로 열린다.
    조 번호 없으면 법령 본문, 법령명 없으면 검색 폴백."""
    from urllib.parse import quote
    if not name:
        return f"https://www.law.go.kr/LSW/lsSc.do?menuId=1&query={quote(_law_name(title))}"
    base = "https://www.law.go.kr/법령/" + name.replace(" ", "")
    art = _article_no(title)
    return base + (f"/제{art}조" if art else "")


def _key() -> str | None:
    return os.getenv("LAW_API_KEY") or os.getenv("DATA_GO_KR_API_KEY")


_LIVE_CACHE: dict[str, dict] = {}


def _law_live(name: str, title: str) -> dict | None:
    """법제처 1170000/law 실시간 검색 → {verified, link}. 키없음·실패 시 None.

    operation/필드명은 서비스 스펙에 맞춰 보정 필요(추정 파싱, 실패 시 폴백)."""
    key = _key()
    if not key:
        return None
    if name in _LIVE_CACHE:
        return _LIVE_CACHE[name]
    endpoint = os.getenv("LAW_API_ENDPOINT", "https://apis.data.go.kr/1170000/law")
    try:
        # 파라미터: serviceKey·target=law·query·numOfRows·pageNo (type 주면 거부됨).
        r = httpx.get(f"{endpoint}/lawSearchList.do",
                      params={"serviceKey": key, "target": "law", "query": name,
                              "numOfRows": 1, "pageNo": 1},
                      timeout=7.0)
        r.raise_for_status()
        body = r.text
        # resultCode 00 + 검색결과 존재 시 확인. 법령상세링크(DRF)를 공식 링크로 사용.
        verified = "<resultCode>00</resultCode>" in body and "<법령상세링크>" in body
        m = re.search(r"<법령상세링크>(/DRF/[^<]+)</법령상세링크>", body)
        link = ("https://www.law.go.kr" + m.group(1).replace("&amp;", "&")) if m \
            else _article_link(name, title)
        result = {"verified": verified, "link": link}
    except Exception:
        result = None
    _LIVE_CACHE[name] = result
    return result


def laws_for(labels_by_id: dict, live: bool = False) -> list[dict]:
    """live=True면 법제처 API로 존재 확인·공식 링크 보강(slow 경로 전용).

    링크는 법제처 조문 딥링크(/법령/{명}/제N조) — 클릭 시 해당 조문이 바로 열린다.
    '동법'은 같은 카테고리 직전 법령명을 상속한다."""
    out, seen = [], set()
    for cat_id in labels_by_id:
        prev_name = None
        for law in LAW_BY_CATEGORY.get(cat_id, []):
            title = law["title"]
            # '동법 제16조' → 직전 실제 법령명 사용. 그 외엔 제목에서 추출.
            name = prev_name if title.startswith("동법") and prev_name else _law_name(title)
            prev_name = name
            if title in seen:
                continue
            seen.add(title)
            entry = {**law, "category": cat_id, "link": _article_link(name, title)}
            if live:
                lv = _law_live(name, title)
                if lv:
                    # link(조문 딥링크)은 유지 — 클릭 시 해당 조문이 바로 열린다.
                    # 법제처 실시간 확인 결과는 verified 플래그 + 원문(전체법령 DRF) 링크로 부가.
                    entry["verified"] = lv["verified"]
                    entry["official_link"] = lv["link"]
                    if lv["verified"]:
                        entry["source"] = law["source"] + " · 법제처 실시간 확인"
            out.append(entry)
    return out
