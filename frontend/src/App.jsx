import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import Signal from "./Signal";
import Evidence from "./Evidence";
import Package from "./Package";
import Dashboard from "./Dashboard";
import Guardian from "./Guardian";
import Protocols from "./Protocols";
import "./App.css";

const ROLES = ["교사", "업무담당교사", "관리자", "학생·학부모"];

export default function App() {
  const [role, setRole] = useState("교사");
  const [school, setSchool] = useState("A");
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState(null);
  const [text, setText] = useState("");
  const [live, setLive] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [pkg, setPkg] = useState(null);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [history, setHistory] = useState({ journals: [], signals: [] });
  const [busy, setBusy] = useState(false);
  const [advisory, setAdvisory] = useState("");  // 저장 시 LLM 보조의견(규칙이 놓친 의미·맥락)
  const [note, setNote] = useState("");          // 교사 소견(이의·동의·대응 사유) 입력
  const [noteSaving, setNoteSaving] = useState(false);
  const [cfg, setCfg] = useState({ llm_enabled: true, demo_mode: false });
  const debounce = useRef(null);

  const isTeacher = role === "교사";        // 담임·상담 통합: 기록+대응
  const isStaff = role === "업무담당교사";   // 생활부장 등: 행동지침
  const isAdmin = role === "관리자";
  const isGuardian = role === "학생·학부모";
  const canEdit = isTeacher;

  useEffect(() => {
    api.students()
      .then((s) => {
        if (Array.isArray(s)) {
          setStudents(s);
          setStudentId(s[0]?.id || null);
        } else {
          console.error("students is not an array:", s);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch students:", err);
      });
  }, []);

  useEffect(() => {
    api.config()
      .then(setCfg)
      .catch((err) => {
        console.error("Failed to fetch config:", err);
      });
  }, []);

  const loadHistory = useCallback((id) => {
    api.journals(id)
      .then((h) => {
        if (h && Array.isArray(h.journals) && Array.isArray(h.signals)) {
          setHistory(h);
          const li = h.signals.length - 1;
          const last = h.signals[li];
          const lastJ = h.journals[li];  // 신호와 같은 인덱스의 일지(배열 길이 어긋남 방지)
          const next = last ? { rule: last.breakdown, llm_context: "", saved: true,
            text: lastJ ? (lastJ.refined_text || lastJ.raw_text) : "",
            signalId: last.id, teacher_note: last.teacher_note, note_at: last.note_at,
            school: last.breakdown?.school?.key || school } : null;
          setViewing(next);
          setNote(next?.teacher_note || "");
        } else {
          console.error("journals history is invalid:", h);
        }
      })
      .catch((err) => {
        console.error("Failed to load history:", err);
      });
  }, [school]);

  useEffect(() => { if (studentId) loadHistory(studentId); }, [studentId, loadHistory]);

  async function saveNote() {
    if (viewing?.signalId == null) return;
    setNoteSaving(true);
    try {
      const res = await api.signalNote(viewing.signalId, note);
      setViewing({ ...viewing, teacher_note: note, note_at: res.note_at });
      loadHistory(studentId);
    } finally { setNoteSaving(false); }
  }

  // sch 인자로 학교 프리셋을 명시 전달(학교 변경 시 stale 클로저 방지).
  function onText(v, sch = school) {
    setText(v);
    if (advisory) setAdvisory("");
    clearTimeout(debounce.current);
    if (!v.trim()) { setLive(null); setEvidence(null); return; }
    debounce.current = setTimeout(async () => {
      try {
        const r = await api.assess(v, sch);
        setLive(r);
        if (isTeacher && isCrisis(r.rule.color)) setEvidence(await api.evidence(v, sch));
        else setEvidence(null);
      } catch { /* ignore */ }
    }, 450);
  }

  // 학교 프리셋 변경 → 현재 입력 즉시 재평가(effect 대신 핸들러에서 처리).
  function onSchoolChange(sch) {
    setSchool(sch);
    if (text.trim()) onText(text, sch);
  }

  async function save() {
    if (!text.trim() || !studentId) return;
    setBusy(true);
    try {
      const res = await api.addJournal(studentId, text, school);
      const a = (res && res.llm_context || "").trim();
      setAdvisory(a && !["특이사항 없음", "특이사항없음"].includes(a) ? a : "");
      setText(""); setLive(null); setEvidence(null);
      loadHistory(studentId);
    } finally { setBusy(false); }
  }

  const studentName = students.find((s) => s.id === studentId)?.display_name || "";

  // 위기수준별 패키지 라벨: 적색=위원회 자료, 황색=사안 검토 자료. 녹색은 패키지 없음(과잉대응 방지).
  const pkgLabel = (color) => color === "red" ? "위기관리위원회 참고자료 패키지" : "사안 검토 참고자료 패키지";
  const isCrisis = (color) => color === "red" || color === "yellow";

  async function genPackage(text, school) {
    if (!text) return;
    setPkgBusy(true);
    try { setPkg(await api.package(text, school)); } finally { setPkgBusy(false); }
  }

  // 교사 탭: 표시 중 신호(라이브 또는 저장된 과거) 기준.
  const shown = live || viewing;
  const shownColor = shown?.rule?.color;
  const pkgText = live ? text : (viewing?.text || "");

  // 업무담당교사 탭: 학생의 최근 저장 신호 기준(라이브 입력 없음).
  const li = history.signals.length - 1;
  const lastSig = history.signals[li];
  const lastJournal = history.journals[li];
  const lastColor = lastSig?.color;
  const lastText = lastJournal ? (lastJournal.refined_text || lastJournal.raw_text) : "";
  const lastSchool = lastSig?.breakdown?.school?.key || "A";

  return (
    <div className="app">
      {(cfg.demo_mode || !cfg.llm_enabled) && (
        <div className="demo-banner">
          공개 데모 · 모든 학생은 가상의 시드 데이터입니다
          {!cfg.llm_enabled && " · AI 보조(정제·맥락)는 비활성, 신호등·근거는 규칙 엔진으로 동작"}
        </div>
      )}
      <header>
        <h1>Edu-SafeNet <small>위기학생 통합지원 · 온프레미스 데모</small></h1>
        <p className="tagline">위기 학생을 지키고, 교사를 보호하고, 교육공동체의 신뢰를 떠받친다.</p>
        <div className="roles">
          {ROLES.map((r) => (
            <button key={r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
      </header>

      {!isAdmin && (
        <div className="bar">
          <label>학생&nbsp;
            <select value={studentId ?? ""} onChange={(e) => { setStudentId(Number(e.target.value)); setAdvisory(""); }}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.display_name} · {s.token}</option>)}
            </select>
          </label>
          {canEdit && (
            <label>학교 프리셋&nbsp;
              <select value={school} onChange={(e) => onSchoolChange(e.target.value)}>
                <option value="A">A학교 (상담·Wee 보유 · 임계값 높음)</option>
                <option value="B">B학교 (상담자원 부족 · 임계값 낮음)</option>
              </select>
            </label>
          )}
        </div>
      )}

      {isAdmin && <Dashboard />}

      {isStaff && (
        <>
          {isCrisis(lastColor) && lastText && (
            <div className="evidence-wrap">
              <button className="pkg-btn" disabled={pkgBusy} onClick={() => genPackage(lastText, lastSchool)}>
                {pkgBusy ? "패키지 생성 중..." : pkgLabel(lastColor) + " 생성"}
              </button>
              <div className="muted" style={{ marginTop: 6 }}>
                {studentName} 최근 저장 신호({lastColor}) 기준 · {lastColor === "red" ? "위원회 제출 자료 준비" : "담당자 사안 검토 자료 준비"}
              </div>
            </div>
          )}
          <Protocols studentId={studentId} studentName={studentName} />
        </>
      )}

      {isGuardian && <Guardian studentId={studentId} studentName={studentName} />}

      {canEdit && (
        <>
          <main>
            <section className="col">
              <h2>관찰 일지 입력 <small className="muted">· 교사: 기록·대응</small></h2>
              <textarea value={text} onChange={(e) => onText(e.target.value)}
                placeholder="예) 민수가 며칠째 결석하고, 죽고 싶다고 말했다..." rows={5} />
              <button className="save" onClick={save} disabled={busy || !text.trim()}>
                {busy ? "저장 중..." : "일지 저장 (신호등 확정)"}
              </button>

              <h3>누적 일지 / 신호 이력</h3>
              <div className="timeline">
                {history.journals.length === 0 && <div className="muted">아직 기록 없음</div>}
                {history.journals.map((j, i) => (
                  <div key={j.id} className="tl-item clickable"
                    onClick={() => {
                      const sig = history.signals[i];
                      const next = { rule: sig.breakdown, llm_context: "", saved: true,
                        text: j.refined_text || j.raw_text,
                        signalId: sig.id, teacher_note: sig.teacher_note,
                        note_at: sig.note_at, school: sig.breakdown?.school?.key || school };
                      setViewing(next);
                      setNote(next.teacher_note || "");
                    }}>
                    <span className={`dot ${history.signals[i]?.color}`} />
                    <div>
                      <div className="tl-text">{j.refined_text || j.raw_text}</div>
                      <div className="tl-meta">{j.created_at} · {history.signals[i]?.color} {history.signals[i]?.score}점
                        {history.signals[i]?.teacher_note && <span className="note-flag"> · 📝 교사 소견</span>}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="col">
              <h2>위험도 신호등 {live ? "(라이브 입력)" : viewing?.saved ? "(저장된 최근 신호)" : "(라이브)"}</h2>
              <Signal result={live || viewing} />
              {advisory && (
                <div className="advisory">
                  {advisory}
                  <div className="advisory-note">※ AI 보조 의견 — 규칙이 놓쳤을 수 있는 맥락. 신호등 색은 규칙·사람이 최종 결정.</div>
                </div>
              )}

              {viewing?.saved && viewing.signalId != null && (
                <div className="teacher-note">
                  <h3>교사 소견 <small className="muted">· 이의 / 동의 / 대응·무시 사유</small></h3>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                    placeholder="신호등 색은 규칙으로 고정됩니다. 교사의 판단·이의·후속 대응(또는 미대응) 사유를 기록으로 남기세요." />
                  <div className="tn-row">
                    <button className="tn-save" disabled={noteSaving} onClick={saveNote}>
                      {noteSaving ? "기록 중..." : "소견 기록"}
                    </button>
                    {viewing.note_at && <span className="muted">최근 기록: {viewing.note_at}</span>}
                  </div>
                  <div className="advisory-note">※ 색을 바꾸지 않습니다. 교사 판단은 감사기록으로 남아 책임을 명확히 합니다.</div>
                </div>
              )}
            </section>
          </main>

          {isCrisis(shownColor) && pkgText && (
            <div className="evidence-wrap">
              <button className="pkg-btn" disabled={pkgBusy} onClick={() => genPackage(pkgText, live ? school : (viewing?.school || school))}>
                {pkgBusy ? "패키지 생성 중..." : pkgLabel(shownColor) + " 생성"}
              </button>
              {evidence && <Evidence data={evidence} />}
            </div>
          )}
        </>
      )}

      <Package data={pkg} onClose={() => setPkg(null)} />
    </div>
  );
}
