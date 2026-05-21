// 배포: 단일 도메인(FastAPI가 정적 프런트도 서빙)이면 VITE_API_BASE="" (동일 출처).
// 로컬 개발: 기본값 http://localhost:8800.
const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8800";

async function jget(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(path);
  return r.json();
}
async function jpost(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(path);
  return r.json();
}

export const api = {
  students: () => jget("/students"),
  schools: () => jget("/schools"),
  journals: (id) => jget(`/students/${id}/journals`),
  assess: (text, school) => jpost("/assess", { text, school }),
  evidence: (text, school) => jpost("/evidence", { text, school }),
  package: (text, school) => jpost("/package", { text, school }),
  dashboard: () => jget("/dashboard"),
  protocols: (studentId) => jget(`/protocols${studentId ? `?student_id=${studentId}` : ""}`),
  config: () => jget("/config"),
  addJournal: (student_id, text, school) =>
    jpost("/journals", { student_id, text, school }),
};
