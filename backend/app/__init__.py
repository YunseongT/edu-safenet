"""app 패키지 — 서브모듈 import 전에 .env를 먼저 로드한다.

llm.py 등은 모듈 import 시점에 os.getenv로 설정을 캡처한다.
패키지 __init__은 어떤 서브모듈보다 먼저 실행되므로, 여기서 .env를 로드해야
LLM_BASE_URL·LLM_API_KEY·LLM_MODEL 등이 기본값이 아닌 .env 값으로 잡힌다.
"""
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
