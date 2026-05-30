import { useCallback, useEffect, useRef, useState } from "react";
import { api, onHealthChange } from "./api";
import { REGIONS, DEFAULT_REGION } from "./core/resources";
import { pkgLabel } from "./core/packageLabel";
import Signal from "./Signal";
import Evidence from "./Evidence";
import Package from "./Package";
import Dashboard from "./Dashboard";
import Guardian from "./Guardian";
import Protocols from "./Protocols";
import "./App.css";

const ROLES = ["교사", "업무담당교사", "관리자", "학생·학부모"];

const isCrisis = (color) => color === "red" || color === "yellow";

// AI 보조의견 정제 — 빈값·'특이사항 없음'은 표시 안 함.
const cleanAdvisory = (a) => {
  const t = (a || "").trim();
  return t && !["특이사항 없음", "특이사항없음"].includes(t) ? t : "";
};

// 패키지 생성 시 로딩 메시지
const PKG_MESSAGES = [
  "관련 법령 및 지침을 확인하는 중입니다...",
  "학교를 중심으로 주변의 가용 자원을 확인하는 중입니다...",
  "초동 대처 가이드라인을 작성하는 중입니다...",
  "제출용 사안 보고서 초안을 구성하는 중입니다..."
];

// 일지 저장 시 로딩 메시지
const SAVE_MESSAGES = [
  "일지를 분석하며 관련 키워드들을 점검하는 중입니다...",
  "일지의 내용에 따라 가정 내 상황을 유추하는 중입니다...",
  "위험 요인을 종합하여 신호등을 확정하는 중입니다...",
  "교사를 위한 AI 보조 의견을 생성하는 중입니다..."
];

function useLoadingMessage(isBusy, messages, interval = 2500) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!isBusy) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, interval);
    return () => clearInterval(timer);
  }, [isBusy, messages, interval]);
  return messages[index];
}

// 패키지 생성 버튼 + 안내문(교사 탭·업무담당교사 탭 공용).
function PackageGen({ color, busy, onGen, note, children }) {
  const loadingMsg = useLoadingMessage(busy, PKG_MESSAGES);
  return (
    <div className="evidence-wrap">
      <button className={`pkg-btn${busy ? " busy" : ""}`} disabled={busy} onClick={onGen}>
        {busy && <span className="spinner" aria-hidden="true" />}
        {busy ? "패키지 생성 중…" : pkgLabel(color) + " 생성"}
      </button>
      <div className="muted" style={{ marginTop: 6 }}>
        {busy ? loadingMsg : note}
      </div>
      {children}
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState("교사");
  const [school, setSchool] = useState("A");
  const [region, setRegion] = useState(DEFAULT_REGION);  // 자원지도 시군구 프리셋
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
  const savingRef = useRef(false);  // 동기 잠금 — 연타·빠른 폴백 경로의 중복 저장 차단(state는 비동기라 부족).
  const [note, setNote] = useState("");          // 교사 소견(이의·동의·대응 사유) 입력
  const [noteSaving, setNoteSaving] = useState(false);
  const [cfg, setCfg] = useState({ llm_enabled: true, demo_mode: false });
  const [isFallback, setIsFallback] = useState(false);
  const debounce = useRef(null);
  
  const saveLoadingMsg = useLoadingMessage(busy, SAVE_MESSAGES);

  const isTeacher = role === "교사";        // 담임·상담 통합: 기록+대응
  const isStaff = role === "업무담당교사";   // 생활부장 등: 행동지침
  const isAdmin = role === "관리자";
  const isGuardian = role === "학생·학부모";
  const canEdit = isTeacher;

  useEffect(() => {
    onHealthChange(setIsFallback);
  }, []);

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

  // 신호+같은 인덱스 일지 → 뷰 객체(저장된 과거 신호 표시·소견 입력용).
  const sigToView = useCallback((sig, journal) => sig ? {
    rule: sig.breakdown, llm_context: journal?.llm_context || "", saved: true,
    text: journal ? (journal.refined_text || journal.raw_text) : "",
    signalId: sig.id, teacher_note: sig.teacher_note, note_at: sig.note_at,
    school: sig.breakdown?.school?.key || school,
  } : null, [school]);

  const loadHistory = useCallback((id) => {
    api.journals(id)
      .then((h) => {
        if (h && Array.isArray(h.journals) && Array.isArray(h.signals)) {
          setHistory(h);
          const li = h.signals.length - 1;  // 마지막 신호+일지(배열 길이 어긋남 방지)
          const next = sigToView(h.signals[li], h.journals[li]);
          setViewing(next);
          setNote(next?.teacher_note || "");
        } else {
          console.error("journals history is invalid:", h);
        }
      })
      .catch((err) => {
        console.error("Failed to load history:", err);
      });
  }, [sigToView]);

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

  // sch·reg 인자로 프리셋을 명시 전달(변경 시 stale 클로저 방지).
  function onText(v, sch = school, reg = region) {
    setText(v);
    clearTimeout(debounce.current);
    if (!v.trim()) { setLive(null); setEvidence(null); return; }
    debounce.current = setTimeout(async () => {
      try {
        const r = await api.assess(v, sch);
        setLive(r);
        if (isTeacher && isCrisis(r.rule.color)) setEvidence(await api.evidence(v, sch, reg));
        else setEvidence(null);
      } catch { /* ignore */ }
    }, 450);
  }

  // 학교/지역 프리셋 변경 → 현재 입력 즉시 재평가(effect 대신 핸들러에서 처리).
  function onSchoolChange(sch) {
    setSchool(sch);
    if (text.trim()) onText(text, sch, region);
  }

  function onRegionChange(reg) {
    setRegion(reg);
    if (text.trim()) onText(text, school, reg);
  }

  async function save() {
    if (!text.trim() || !studentId || savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    try {
      await api.addJournal(studentId, text, school);
      setText(""); setLive(null); setEvidence(null);
      loadHistory(studentId);  // 저장된 신호+보조의견(llm_context)을 다시 불러 viewing에 반영.
    } finally { setBusy(false); savingRef.current = false; }
  }

  const studentName = students.find((s) => s.id === studentId)?.display_name || "";

  async function genPackage(txt, sch, reg = region) {
    if (!txt) return;
    setPkgBusy(true);
    try { setPkg(await api.package(txt, sch, reg)); } finally { setPkgBusy(false); }
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>Edu-SafeNet <small>위기학생 통합지원 · 온프레미스 데모</small></h1>
            <p className="tagline">위기 학생을 지키고, 교사를 보호하고, 교육공동체의 신뢰를 떠받친다.</p>
          </div>
          <div className="health-badge" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", padding: "6px 10px", borderRadius: "20px", background: isFallback ? "#f0f0f0" : "#e6f4ea", color: isFallback ? "#666" : "#137333", fontWeight: 500 }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: isFallback ? "#999" : "#34a853" }} />
            {isFallback ? "정적 폴백 모드 (백엔드 끊김)" : "백엔드·LLM 정상 연결"}
          </div>
        </div>
        <div className="roles">
          {ROLES.map((r) => (
            <button key={r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
      </header>

      {!isAdmin && (
        <div className="bar">
          <label>학생&nbsp;
            <select value={studentId ?? ""} onChange={(e) => setStudentId(Number(e.target.value))}>
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
          {(canEdit || isStaff) && (
            <label>지역(자원지도)&nbsp;
              <select value={region} onChange={(e) => onRegionChange(e.target.value)}>
                {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {isAdmin && <Dashboard />}

      {isStaff && (
        <>
          {isCrisis(lastColor) && lastText && (
            <PackageGen color={lastColor} busy={pkgBusy} onGen={() => genPackage(lastText, lastSchool)}
              note={`${studentName} 최근 저장 신호(${lastColor}) 기준 · ${lastColor === "red" ? "위원회 제출 자료 준비" : "담당자 사안 검토 자료 준비"}`} />
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
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <button className="save" onClick={save} disabled={busy || !text.trim()}>
                  {busy ? "저장 중..." : "일지 저장 (신호등 확정)"}
                </button>
                {busy && (
                  <div className="muted" style={{ fontSize: "0.85rem", textAlign: "center" }}>
                    {saveLoadingMsg}
                  </div>
                )}
              </div>

              <h3>누적 일지 / 신호 이력</h3>
              <div className="timeline">
                {history.journals.length === 0 && <div className="muted">아직 기록 없음</div>}
                {history.journals.map((j, i) => (
                  <div key={j.id} className="tl-item clickable"
                    onClick={() => {
                      const next = sigToView(history.signals[i], j);
                      setViewing(next);
                      setNote(next?.teacher_note || "");
                    }}>
                    <span className={`dot ${history.signals[i]?.color}`} />
                    <div>
                      <div className="tl-text">{j.refined_text || j.raw_text}</div>
                      <div className="tl-meta">{j.created_at} · {history.signals[i]?.color} {history.signals[i]?.score}점
                        {cleanAdvisory(j.llm_context) && <span className="note-flag"> · 🤖 AI 보조의견</span>}
                        {history.signals[i]?.teacher_note && <span className="note-flag"> · 📝 교사 소견</span>}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="col">
              <h2>위험도 신호등 {live ? "(라이브 입력)" : viewing?.saved ? "(저장된 최근 신호)" : "(라이브)"}</h2>
              <Signal result={live || viewing} />

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

          {shownColor && pkgText && (
            <PackageGen color={shownColor} busy={pkgBusy}
              onGen={() => genPackage(pkgText, live ? school : (viewing?.school || school))}
              note="교사가 시스템·AI 의견을 검토한 뒤 도움이 필요하다고 판단하면 생성합니다.">
              {evidence && <Evidence data={evidence} />}
            </PackageGen>
          )}
        </>
      )}

      <Package data={pkg} onClose={() => setPkg(null)} />
    </div>
  );
}
