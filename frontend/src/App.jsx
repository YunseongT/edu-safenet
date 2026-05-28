import { useEffect, useRef, useState } from "react";
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

  function loadHistory(id) {
    api.journals(id)
      .then((h) => {
        if (h && Array.isArray(h.journals) && Array.isArray(h.signals)) {
          setHistory(h);
          const last = h.signals[h.signals.length - 1];
          setViewing(last ? { rule: last.breakdown, llm_context: "", saved: true } : null);
        } else {
          console.error("journals history is invalid:", h);
        }
      })
      .catch((err) => {
        console.error("Failed to load history:", err);
      });
  }

  useEffect(() => { if (studentId) loadHistory(studentId); }, [studentId]);

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
        if (isTeacher && r.rule.color === "red") setEvidence(await api.evidence(v, sch));
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

      {isStaff && <Protocols studentId={studentId} studentName={studentName} />}

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
                    onClick={() => setViewing({ rule: history.signals[i].breakdown, llm_context: "", saved: true })}>
                    <span className={`dot ${history.signals[i]?.color}`} />
                    <div>
                      <div className="tl-text">{j.refined_text || j.raw_text}</div>
                      <div className="tl-meta">{j.created_at} · {history.signals[i]?.color} {history.signals[i]?.score}점</div>
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
            </section>
          </main>

          {evidence && (
            <div className="evidence-wrap">
              <button className="pkg-btn" disabled={pkgBusy} onClick={async () => {
                setPkgBusy(true);
                try { setPkg(await api.package(text, school)); } finally { setPkgBusy(false); }
              }}>
                {pkgBusy ? "패키지 생성 중..." : "위기관리위원회 참고자료 패키지 생성"}
              </button>
              <Evidence data={evidence} />
            </div>
          )}
        </>
      )}

      <Package data={pkg} onClose={() => setPkg(null)} />
    </div>
  );
}
