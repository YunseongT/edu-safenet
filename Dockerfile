# ---- 1단계: 프런트 빌드 ----
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# 단일 도메인 서빙: API base를 동일 출처로
ENV VITE_API_BASE=""
RUN npm run build

# ---- 2단계: 파이썬 런타임 ----
FROM python:3.12-slim AS app
WORKDIR /app
RUN pip install --no-cache-dir "fastapi" "uvicorn[standard]" "httpx" "python-dotenv"
COPY backend/app ./app
COPY --from=web /web/dist ./frontend/dist
# 상시 데모 기본값: LLM 비활성(GPU 불필요) + 데모 배너 ON
ENV LLM_ENABLED=0 DEMO_MODE=1 PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
