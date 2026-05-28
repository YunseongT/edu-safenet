// 두 가지 모드를 한 코드로:
//  - 정적 배포(Cloudflare Pages): VITE_STATIC=1 → 백엔드 없이 브라우저 내 규칙 엔진(core/).
//  - 온프레미스(이 맥): 기본 → FastAPI 백엔드 호출(로컬 LLM로 정제·맥락·보고서까지 라이브).
import { assess } from "./core/engine";
import { lawsFor } from "./core/law";
import { match } from "./core/resources";
import { getProtocols } from "./core/protocols";
import { buildReport } from "./core/report";
import { CASE_RESOURCES } from "./core/cases";
import { store } from "./core/store";

const STATIC = 
  import.meta.env.VITE_STATIC === "1" || 
  (import.meta.env.PROD && !import.meta.env.VITE_API_BASE) ||
  (typeof window !== "undefined" && 
   window.location.hostname !== "localhost" && 
   window.location.hostname !== "127.0.0.1" && 
   !import.meta.env.VITE_API_BASE);

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
  assess: (text, school) => ok({ refined_text: text, rule: assess(text, school), llm_context: "", llm_suggested_labels: [] }),
  addJournal: (id, text, school) => { store.addJournal(id, text, school); return ok({ ok: true }); },
  signalNote: (sigId, note) => { const s = store.addNote(sigId, note); return ok({ ok: !!s, signal_id: sigId, teacher_note: note, note_at: s ? s.note_at : null }); },
  evidence: (text, school, region) => { const r = assess(text, school);
    return ok({ color: r.color, labels: r.labels, laws: lawsFor(r.categories), resources: match(resourceKinds(r.categories), school, region) }); },
  package: (text, school, region) => { const r = assess(text, school);
    return ok({ signal: { color: r.color, score: r.score, labels: r.labels, floor_reasons: r.floor_reasons },
      laws: lawsFor(r.categories), resources: match(resourceKinds(r.categories), school, region), report: buildReport(text, r) }); },
  dashboard: () => ok(store.dashboard()),
  protocols: (studentId) => { let active = [];
    if (studentId) { const sig = store.journals(studentId).signals; const last = sig[sig.length - 1];
      if (last) active = Object.keys(last.breakdown.categories); }
    return ok({ active, protocols: getProtocols(active) }); },
};

// ---------- 백엔드(fetch) 구현 ----------
const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8800";
const jget = async (p) => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(p); return r.json(); };
const jpost = async (p, b) => { const r = await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(p); return r.json(); };
const backendApi = {
  students: () => jget("/students"),
  schools: () => jget("/schools"),
  journals: (id) => jget(`/students/${id}/journals`),
  config: () => jget("/config"),
  assess: (text, school) => jpost("/assess", { text, school }),
  addJournal: (id, text, school) => jpost("/journals", { student_id: id, text, school }),
  signalNote: (sigId, note) => jpost(`/signals/${sigId}/note`, { note }),
  evidence: (text, school, region) => jpost("/evidence", { text, school, region }),
  package: (text, school, region) => jpost("/package", { text, school, region }),
  dashboard: () => jget("/dashboard"),
  protocols: (studentId) => jget(`/protocols${studentId ? `?student_id=${studentId}` : ""}`),
};

// 백엔드(터널) 호출 실패 시 브라우저 내 규칙엔진(core)으로 폴백 — 데모가 죽지 않게.
function withFallback(primary, fallback) {
  const out = {};
  for (const k of Object.keys(primary)) {
    out[k] = async (...args) => {
      try { return await primary[k](...args); }
      catch (e) { console.warn(`backend ${k} 실패 → core 폴백`, e); return fallback[k](...args); }
    };
  }
  return out;
}

export const api = STATIC ? staticApi : withFallback(backendApi, staticApi);
