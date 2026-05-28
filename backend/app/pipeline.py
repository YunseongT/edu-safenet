"""하네스 파이프라인 — 코드가 흐름을 소유, LLM은 보조 부품.

정제 / 분류 보조 / 맥락 코멘트는 LLM이 *제안*하고, 신호등 색·floor·최종 분류는
engine(규칙)이 최종 결정한다. LLM 실패 시에도 규칙 결과는 항상 산출된다.
"""
import json

from .cases import CATEGORIES
from .engine import assess
from .llm import chat

_SYS = "너는 학교 위기지원 시스템의 보조 도구다. 판단·처방·결정은 절대 하지 말고, 사실 정리와 보조 의견만 제공한다."


def refine(raw_text: str) -> str:
    try:
        return chat(
            f"다음 교사 관찰 일지를 사실 위주로 한 문장으로 정제해줘. 추측·평가는 빼고 관찰된 사실만:\n{raw_text}",
            system=_SYS, max_tokens=120,
        )
    except Exception:
        return raw_text  # LLM 실패 시 원본 보존


def context_comment(raw_text: str, rule_result: dict) -> str:
    labels = ", ".join(rule_result["labels"]) or "특이 유형 없음"
    try:
        return chat(
            f"규칙(키워드) 엔진이 이 일지를 '{labels}'(위험도 {rule_result['color']})로 보았다. "
            "규칙은 키워드 기반이라 의미·맥락(예: 기물 파손·이상행동·문학작품이 암시하는 정서위기 등)을 "
            "놓칠 수 있다. 규칙이 과소평가했을 가능성이 있으면 '⚠ 보조의견:'으로 시작해 무엇을/왜 "
            "한 문장으로 지적하고, 없으면 '특이사항 없음'이라고만 답해라. 신호등 색은 바꾸지 말 것"
            f"(보조 의견일 뿐 최종 분류는 규칙·사람):\n{raw_text}",
            system=_SYS, max_tokens=120,
        )
    except Exception:
        return ""


def suggest_labels(raw_text: str, rule_labels: list[str]) -> list[str]:
    """LLM이 규칙이 놓친 유형을 보조 제안. floor·최종은 규칙이 결정하므로 참고용."""
    catalog = ", ".join(f"{c['label']}" for c in CATEGORIES.values())
    try:
        out = chat(
            f"다음 일지에 해당할 수 있는 유형을 [{catalog}] 중에서만 골라 쉼표로 나열해줘. "
            f"없으면 '없음':\n{raw_text}",
            system=_SYS, max_tokens=40,
        )
        label_set = {c["label"] for c in CATEGORIES.values()}
        return [x.strip() for x in out.replace("\n", ",").split(",")
                if x.strip() in label_set and x.strip() not in rule_labels]
    except Exception:
        return []


def analyze_once(raw_text: str, rule_result: dict) -> dict:
    """저장 경로용 LLM 호출. 지연을 줄이기 위해 정제·맥락 코멘트를 한 번에 받는다."""
    labels = ", ".join(rule_result["labels"]) or "특이 유형 없음"
    catalog = ", ".join(f"{c['label']}" for c in CATEGORIES.values())
    try:
        out = chat(
            "다음 교사 관찰 일지를 분석해 JSON만 출력해라. 다른 설명은 쓰지 마라.\n"
            "{"
            "\"refined_text\":\"관찰 사실만 한 문장으로 정제\","
            "\"llm_context\":\"규칙이 과소평가했을 가능성이 있으면 '⚠ 보조의견:'으로 시작하는 한 문장, 없으면 '특이사항 없음'\","
            "\"llm_suggested_labels\":[\"아래 유형 중 해당 가능성이 있으나 규칙이 놓친 유형\"]"
            "}\n"
            f"허용 유형: [{catalog}]\n"
            f"규칙 결과: {labels}, 위험도 {rule_result['color']}.\n"
            "신호등 색은 절대 바꾸지 말고, 판단·처방·결정은 하지 마라.\n"
            f"일지:\n{raw_text}",
            system=_SYS, max_tokens=220,
        )
        start = out.find("{")
        end = out.rfind("}")
        data = json.loads(out[start:end + 1]) if start >= 0 and end >= start else {}
        label_set = {c["label"] for c in CATEGORIES.values()}
        suggested = [
            x for x in data.get("llm_suggested_labels", [])
            if isinstance(x, str) and x in label_set and x not in rule_result["labels"]
        ]
        return {
            "refined_text": data.get("refined_text") or raw_text,
            "llm_context": data.get("llm_context") or "",
            "llm_suggested_labels": suggested,
        }
    except Exception:
        return {"refined_text": raw_text, "llm_context": "", "llm_suggested_labels": []}


def process(raw_text: str, school: str = "A", llm: bool = True) -> dict:
    """llm=False면 LLM 보조 생략(규칙만). 라이브 미리보기(/assess)는 타자마다 호출되므로
    LLM 미사용 — reasoning 모델 토큰 폭주·지연 방지. 색·분류는 항상 규칙이 결정."""
    rule = assess(raw_text, school)          # 규칙: 결정적 (색·floor·분류 최종)
    if not llm:
        return {"refined_text": raw_text, "rule": rule,
                "llm_context": "", "llm_suggested_labels": []}
    analysis = analyze_once(raw_text, rule)   # LLM 보조: 정제+맥락(1회 호출)
    return {
        "refined_text": analysis["refined_text"],
        "rule": rule,
        "llm_context": analysis["llm_context"],
        "llm_suggested_labels": analysis["llm_suggested_labels"],
    }
