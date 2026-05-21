"""보고서 초안 + 검증 패스 — 라이브 경로 밖(속도 무관).

생성 LLM은 개요·우려점만. 검증 LLM이 처방·결정문 침범을 별도로 점검·차단한다.
'AI는 자료까지, 결정은 사람'을 눈에 보이는 안전장치로 구현.
"""
from .llm import LLM_ENABLED, chat

_GEN_SYS = (
    "너는 학교 위기지원 보고서 '초안' 보조 도구다. 절대 금지: 처방, 진단, 처분 결정, "
    "조치 명령, '~해야 한다'식 결정문. 허용: 관찰된 사실 개요와 우려점 정리까지만. "
    "결정은 위기관리위원회(사람)가 한다."
)

# 결정/처방으로 읽힐 수 있는 표현 — 검증 패스가 탐지.
_BANNED = ["진단", "처방", "투약", "퇴학", "전학 조치", "징계", "확정한다", "결정한다", "조치한다"]


def _template_draft(refined_text: str, rule: dict) -> str:
    """LLM 미가용(상시 데모) 시 규칙 데이터로 보고서 초안 생성. 결정·처방 없음."""
    labels = ", ".join(rule["labels"]) or "특이 유형 없음"
    concerns = []
    for c in rule.get("categories", {}).values():
        kws = ", ".join(h["keyword"] for h in c["hits"])
        concerns.append(f"* {c['label']} 관련 신호 관찰됨 ({kws}).")
    if rule.get("floor_reasons"):
        concerns.append(f"* 바닥선 발동: {', '.join(rule['floor_reasons'])} — 즉시 대응 필요.")
    if rule["general_factors"]["score"] > 0:
        gk = ", ".join(h["keyword"] for h in rule["general_factors"]["hits"])
        concerns.append(f"* 일반 위기신호 관찰됨 ({gk}).")
    return (
        "## 위기지원 보고서 (초안)\n\n"
        f"**[개요]**\n관찰 기록: {refined_text}\n"
        f"규칙 분류: {labels} · 위험도 {rule['color']}(점수 {rule['score']}).\n\n"
        "**[우려점]**\n" + "\n".join(concerns)
    )


def draft(refined_text: str, rule: dict) -> str:
    if not LLM_ENABLED:
        return _template_draft(refined_text, rule)
    labels = ", ".join(rule["labels"]) or "특이 유형 없음"
    try:
        return chat(
            f"다음 정보로 위기관리위원회 검토용 보고서 '초안'을 작성해줘. "
            f"형식: [개요] 2~3문장, [우려점] 불릿 2~3개. 결정·처방·조치명령은 절대 쓰지 말 것.\n"
            f"- 정제된 관찰: {refined_text}\n- 규칙 분류: {labels} (위험 {rule['color']})",
            system=_GEN_SYS, max_tokens=320,
        )
    except Exception:
        return _template_draft(refined_text, rule)  # LLM 다운 시에도 보고서 생성


def verify(report_text: str) -> dict:
    """검증 패스: 결정/처방 표현 탐지. 규칙 1차 + LLM 2차."""
    rule_hits = [w for w in _BANNED if w in report_text]
    if not LLM_ENABLED:
        return {"passed": not rule_hits, "rule_hits": rule_hits,
                "llm_review": "규칙 점검만 적용(데모 모드)"}
    llm_flag = ""
    try:
        llm_flag = chat(
            "다음 보고서에 '결정·처방·조치 명령'에 해당하는 문장이 있으면 그 문장만 인용하고, "
            f"없으면 '없음'이라고만 답해라:\n{report_text}",
            system="너는 안전 검증기다. 보고서가 결정권을 침범했는지만 본다.",
            max_tokens=120,
        )
    except Exception:
        llm_flag = "검증기 호출 실패(규칙 점검만 적용)"
    passed = not rule_hits and llm_flag.strip() in ("없음", "없음.", "")
    return {"passed": passed, "rule_hits": rule_hits, "llm_review": llm_flag}


def build(refined_text: str, rule: dict) -> dict:
    text = draft(refined_text, rule)
    check = verify(text)
    if not check["passed"]:
        text += "\n\n[검증 경고] 결정·처방으로 읽힐 수 있는 표현이 감지되어 위원회 검토가 필요합니다."
    return {"report": text, "verification": check}
