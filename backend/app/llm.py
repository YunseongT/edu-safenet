import os

import httpx

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma4:e4b-it-q4_K_M")
# 상시 데모(GPU 없는 호스트)에선 LLM_ENABLED=0 → 규칙 기반 폴백만 동작.
LLM_ENABLED = os.getenv("LLM_ENABLED", "1") not in ("0", "false", "False", "")


class LLMUnavailable(RuntimeError):
    pass


def chat(prompt: str, *, system: str | None = None, max_tokens: int = 256,
         temperature: float = 0.2) -> str:
    """Single-turn call against an OpenAI-compatible endpoint.

    Provider-agnostic: works with Ollama or LM Studio by changing LLM_BASE_URL.
    Thinking is left off and output kept short to protect live demo latency.
    """
    if not LLM_ENABLED:
        raise LLMUnavailable("LLM disabled (demo mode)")
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    resp = httpx.post(
        f"{LLM_BASE_URL}/chat/completions",
        json={
            "model": LLM_MODEL,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "reasoning_effort": "none",
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()
