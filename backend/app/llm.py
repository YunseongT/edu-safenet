import os

import httpx

# OpenAI 호환 엔드포인트. 로컬 LMStudio(:1234) · Ollama(:11434) 또는 터널 경유.
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:1234/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "local-model")
# 일부 게이트웨이는 Bearer 키 요구(LMStudio/Ollama는 불필요 → 빈값이면 헤더 생략).
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
# reasoning_effort는 일부 제공자 전용 파라미터 → 설정된 경우에만 전송.
LLM_REASONING_EFFORT = os.getenv("LLM_REASONING_EFFORT", "")
# thinking 토글 디렉티브(모델별). gemma-4 reasoning 모델은 "/think"를 system에 넣으면
# 추론을 reasoning_content로 분리(=content는 깨끗·짧음·파싱가능). LMStudio 토글 OFF여도
# 요청별로 재활성된다. 미설정 시 미주입(provider-agnostic). 예: LLM_THINK_DIRECTIVE=/think
LLM_THINK_DIRECTIVE = os.getenv("LLM_THINK_DIRECTIVE", "")
# reasoning 모델은 thinking에 토큰을 먼저 써 content가 빌 수 있다(max_tokens는 추론+content 합산).
# 설정 시 호출별 max_tokens의 하한으로 적용(추론+content 둘 다 수용 보장).
LLM_MIN_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "0") or 0)
# 상시 데모(GPU 없는 호스트)에선 LLM_ENABLED=0 → 규칙 기반 폴백만 동작.
LLM_ENABLED = os.getenv("LLM_ENABLED", "1") not in ("0", "false", "False", "")


class LLMUnavailable(RuntimeError):
    pass


def chat(prompt: str, *, system: str | None = None, max_tokens: int = 256,
         temperature: float = 0.2) -> str:
    """Single-turn call against an OpenAI-compatible endpoint.

    Provider-agnostic: LMStudio·Ollama 등은 LLM_BASE_URL만 바꾸면 동작.
    reasoning 모델은 LLM_THINK_DIRECTIVE(예: /think)로 추론을 reasoning_content에
    분리 → content는 깨끗·짧음. content만 반환하므로 호출부는 추론 프로즈에 노출 안 됨.
    """
    if not LLM_ENABLED:
        raise LLMUnavailable("LLM disabled (demo mode)")
    if LLM_THINK_DIRECTIVE:
        system = f"{LLM_THINK_DIRECTIVE}\n{system}" if system else LLM_THINK_DIRECTIVE
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "max_tokens": max(max_tokens, LLM_MIN_MAX_TOKENS),
        "temperature": temperature,
    }
    if LLM_REASONING_EFFORT:
        payload["reasoning_effort"] = LLM_REASONING_EFFORT
    headers = {"Authorization": f"Bearer {LLM_API_KEY}"} if LLM_API_KEY else {}
    resp = httpx.post(
        f"{LLM_BASE_URL}/chat/completions",
        json=payload,
        headers=headers,
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()
