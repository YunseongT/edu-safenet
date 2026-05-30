// 두 가지 모드를 한 코드로:
//  - 정적 배포(Cloudflare Pages): VITE_STATIC=1 → 백엔드 없이 브라우저 내 규칙 엔진(core/).
//  - 온프레미스(이 맥): 기본 → FastAPI 백엔드 호출(로컬 LLM로 정제·맥락·보고서까지 라이브).
import { assess, combineObs } from "./core/engine";
import { lawsFor } from "./core/law";
import { match } from "./core/resources";
import { getProtocols } from "./core/protocols";
import { buildReport } from "./core/report";
import { CASE_RESOURCES } from "./core/cases";
import { store } from "./core/store";

// 도메인별 백엔드 자동선택(병행 운영). 빌드 env(VITE_API_BASE) 주면 그걸로 강제.
function hostBackend() {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return "http://localhost:8800";
  if (h.endsWith("aieduflare.com")) return "https://api.aieduflare.com";
  if (h.endsWith("yunseongt.com")) return "https://api.yunseongt.com";
  return "";  // 미지 호스트 → 백엔드 없음 → 정적(core) 폴백
}
const API_BASE = import.meta.env.VITE_API_BASE || hostBackend();
const STATIC = import.meta.env.VITE_STATIC === "1" || !API_BASE;

// ---------- 정적(core) 구현 ----------
const ok = (v) => Promise.resolve(v);
function resourceKinds(categories) {
  const kinds = [];
  for (const id of Object.keys(categories))
    for (const k of (CASE_RESOURCES[id] || [])) if (!kinds.includes(k)) kinds.push(k);
  return kinds;
}
const staticApi = {
  students: () => ok(store.students()),
  schools: () => ok(store.schools()),
  journals: (id) => ok(store.journals(id)),
  config: () => ok({ llm_enabled: false, demo_mode: true }),
  assess: (text, school, counsel, scores) => ok({ refined_text: text, rule: assess(combineObs(text, counsel), school, scores), llm_context: "" }),
  addJournal: (id, text, school, counsel, scores) => { store.addJournal(id, text, school, counsel, scores); return ok({ ok: true }); },
  signalNote: (sigId, note) => { const s = store.addNote(sigId, note); return ok({ ok: !!s, signal_id: sigId, teacher_note: note, note_at: s ? s.note_at : null }); },
  evidence: (text, school, region, counsel, scores) => { const r = assess(combineObs(text, counsel), school, scores);
    return ok({ color: r.color, labels: r.labels, laws: lawsFor(r.categories), resources: match(resourceKinds(r.categories), school, region, r.color) }); },
  package: (text, school, region, counsel, scores) => { const r = assess(combineObs(text, counsel), school, scores); const laws = lawsFor(r.categories);
    return ok({ signal: { color: r.color, score: r.score, labels: r.labels, floor_reasons: r.floor_reasons },
      laws, resources: match(resourceKinds(r.categories), school, region, r.color), report: buildReport(text, r, laws) }); },
  dashboard: () => ok(store.dashboard()),
  protocols: (studentId) => { let active = [];
    if (studentId) { const sig = store.journals(studentId).signals; const last = sig[sig.length - 1];
      if (last) active = Object.keys(last.breakdown.categories); }
    return ok({ active, protocols: getProtocols(active) }); },
};

// ---------- 백엔드(fetch) 구현 ----------
const BASE = API_BASE || "http://localhost:8800";

// 헬스 상태 구독/발행
export const healthState = { isFallback: false, listeners: [] };
export const onHealthChange = (cb) => { healthState.listeners.push(cb); cb(healthState.isFallback); };
const setFallbackState = (state) => {
  if (healthState.isFallback !== state) {
    healthState.isFallback = state;
    healthState.listeners.forEach((cb) => cb(state));
  }
};

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
  }
}

const fetchWithTimeout = async (url, options, timeout = 120000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e; // Network error or AbortError
  }
};

const fetchWithRetry = async (url, options, retries = 1) => {
  const actualRetries = (options && options.method === "POST") ? 0 : retries;
  
  for (let i = 0; i <= actualRetries; i++) {
    try {
      const r = await fetchWithTimeout(url, options, 120000);
      if (!r.ok) throw new HttpError(r.status, url);
      setFallbackState(false);
      return await r.json();
    } catch (e) {
      if (i === actualRetries) throw e;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

const jget = async (p) => fetchWithRetry(BASE + p);
const jpost = async (p, b) => fetchWithRetry(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

const backendApi = {
  students: () => jget("/students"),
  schools: () => jget("/schools"),
  journals: (id) => jget(`/students/${id}/journals`),
  config: () => jget("/config"),
  assess: (text, school, counsel, scores) => jpost("/assess", { text, school, counsel, scores }),
  addJournal: (id, text, school, counsel, scores) => jpost("/journals", { student_id: id, text, school, counsel, scores }),
  signalNote: (sigId, note) => jpost(`/signals/${sigId}/note`, { note }),
  evidence: (text, school, region, counsel, scores) => jpost("/evidence", { text, school, region, counsel, scores }),
  package: (text, school, region, counsel, scores) => jpost("/package", { text, school, region, counsel, scores }),
  dashboard: () => jget("/dashboard"),
  protocols: (studentId) => jget(`/protocols${studentId ? `?student_id=${studentId}` : ""}`),
};

// 백엔드(터널) 호출 실패 시 브라우저 내 규칙엔진(core)으로 폴백 — 데모가 죽지 않게.
function withFallback(primary, fallback) {
  const out = {};
  for (const k of Object.keys(primary)) {
    out[k] = async (...args) => {
      try { 
        return await primary[k](...args); 
      }
      catch (e) { 
        console.warn(`backend ${k} 실패 → core 폴백`, e); 
        // 524(Cloudflare Timeout) 등 HTTP 에러는 백엔드가 살아있으나 특정 요청만 실패한 것.
        // TypeError(네트워크 단절) 또는 AbortError(프론트엔드 타임아웃)일 때만 글로벌 폴백(회색 배지) 적용.
        // 502 Bad Gateway는 백엔드 서버 다운/터널 단절로 간주하여 폴백 적용.
        if (!(e instanceof HttpError) || e.status === 502) {
          setFallbackState(true);
        }
        return fallback[k](...args); 
      }
    };
  }
  return out;
}

export const api = STATIC ? staticApi : withFallback(backendApi, staticApi);
