// 인메모리 데이터 (backend/app/seed.py + db 포팅). 정적 데모: 새로고침 시 초기화.
import { assess, combineObs, SCHOOL_PRESETS } from "./engine";
import { dashboardStats } from "./dashboardStats";

const STUDENTS = [
  { id: 1, token: "S-A1F3", display_name: "학생 가 (자해 위기)", school: "A" },
  { id: 2, token: "S-B7C2", display_name: "학생 나 (학교폭력)", school: "A" },
  { id: 3, token: "S-A9D1", display_name: "학생 다 (아동학대)", school: "A" },
  { id: 4, token: "S-B4E8", display_name: "학생 라 (특수교육+학폭)", school: "B" },
  { id: 5, token: "S-A2K5", display_name: "학생 마 (경미·녹색대조)", school: "A" },
];

const SEED_JOURNALS = [
  [1, "A", "지수가 오늘 점심을 거르고 혼자 앉아 말이 없었다."],
  [1, "A", "이틀째 결석이다. 무기력해 보이고 위축된 모습이다."],
  [1, "A", "민수가 죽고 싶다고 말했고 손목에 흉터가 보였다."],
  [2, "A", "나가 따돌림을 당하고 욕설과 협박을 들었다고 한다."],
  [3, "A", "다의 팔에 멍이 보였고 집에 가기 싫다며 맞았다고 말했다."],
  [4, "B", "라는 발달이 느린 편인데 괴롭힘과 따돌림을 당했다."],
  [5, "A", "마는 평소처럼 친구들과 어울리고 수업에 잘 참여했다."],
];

// student_id -> { journals:[], signals:[] }
const records = {};
let _seq = 0;

function ts(i) {
  const d = new Date(2026, 4, 18, 9, 0); // 2026-05-18 09:00
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 19);
}

function init() {
  for (const s of STUDENTS) records[s.id] = { journals: [], signals: [] };
  SEED_JOURNALS.forEach(([sid, school, text], i) => {
    const r = assess(text, school);
    const created = ts(i);
    records[sid].journals.push({ id: ++_seq, raw_text: text, refined_text: text, created_at: created });
    records[sid].signals.push({ id: ++_seq, score: r.score, color: r.color, breakdown: r, created_at: created, teacher_note: null, note_at: null });
  });
}
init();

export const store = {
  students: () => STUDENTS.map((s) => ({ id: s.id, token: s.token, display_name: s.display_name, school_id: s.school })),
  schools: () => Object.entries(SCHOOL_PRESETS).map(([k, v]) => ({ key: k, ...v })),
  journals: (id) => records[id] || { journals: [], signals: [] },
  addJournal: (id, text, school, counsel = "", scores = null) => {
    const r = assess(combineObs(text, counsel), school, scores);
    const created = new Date().toISOString().slice(0, 19);
    records[id].journals.push({ id: ++_seq, raw_text: text, refined_text: text, counsel_text: counsel, scores_json: JSON.stringify(scores || {}), created_at: created });
    records[id].signals.push({ id: ++_seq, score: r.score, color: r.color, breakdown: r, created_at: created, teacher_note: null, note_at: null });
    return r;
  },
  addNote: (sigId, note) => {
    for (const id in records) {
      const s = records[id].signals.find((x) => x.id === sigId);
      if (s) { s.teacher_note = note; s.note_at = new Date().toISOString().slice(0, 19); return s; }
    }
    return null;
  },
  dashboard: () => {
    const rows = STUDENTS.map((s) => {
      const sig = records[s.id].signals;
      const last = sig[sig.length - 1];
      return { id: s.id, token: s.token, display_name: s.display_name, school: s.school,
        color: last ? last.color : "none", score: last ? last.score : null,
        updated: last ? last.created_at : null };
    });
    const by_school = {};
    for (const r of rows) {
      const b = (by_school[r.school] ||= { green: 0, yellow: 0, red: 0, none: 0 });
      b[r.color] = (b[r.color] || 0) + 1;
    }
    return { students: rows, by_school, reds: rows.filter((r) => r.color === "red"), total: rows.length, stats: dashboardStats() };
  },
};
