"""하네스 파이프라인 — 코드가 흐름을 소유, LLM은 보조 부품.

정제 / 분류 보조 / 맥락 코멘트는 LLM이 *제안*하고, 신호등 색·floor·최종 분류는
engine(규칙)이 최종 결정한다. LLM 실패 시에도 규칙 결과는 항상 산출된다.
"""
import json

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


def analyze_once(raw_text: str, rule_result: dict) -> dict:
    """저장 경로용 LLM 호출. 정제·맥락 코멘트를 한 번에 받는다."""
    labels = ", ".join(rule_result["labels"]) or "특이 유형 없음"
    try:
        out = chat(
            "다음 교사 관찰 일지를 분석해 JSON만 출력해라. 다른 설명은 쓰지 마라.\n"
            "{\"refined_text\":\"관찰 사실만 한 문장으로 정제\","
            "\"llm_context\":\"규칙이 과소평가했을 가능성이 있으면 '⚠ 보조의견:'으로 시작하는 한 문장, 없으면 '특이사항 없음'\"}\n"
            f"규칙 결과: {labels}, 위험도 {rule_result['color']}.\n"
            "신호등 색은 절대 바꾸지 말고, 판단·처방·결정은 하지 마라.\n"
            f"일지:\n{raw_text}",
            system=_SYS, max_tokens=160,
        )
        start = out.find("{")
        end = out.rfind("}")
        data = json.loads(out[start:end + 1]) if start >= 0 and end >= start else {}
        return {
            "refined_text": data.get("refined_text") or raw_text,
            "llm_context": data.get("llm_context") or "",
        }
    except Exception:
        return {"refined_text": raw_text, "llm_context": ""}


def process(raw_text: str, school: str = "A", llm: bool = True) -> dict:
    """llm=False면 LLM 보조 생략(규칙만). 라이브 미리보기(/assess)는 타자마다 호출되므로
    LLM 미사용 — reasoning 모델 토큰 폭주·지연 방지. 색·분류는 항상 규칙이 결정."""
    rule = assess(raw_text, school)          # 규칙: 결정적 (색·floor·분류 최종)
    if not llm:
        return {"refined_text": raw_text, "rule": rule, "llm_context": ""}
    analysis = analyze_once(raw_text, rule)   # LLM 보조: 정제+맥락(1회 호출)
    return {
        "refined_text": analysis["refined_text"],
        "rule": rule,
        "llm_context": analysis["llm_context"],
    }
