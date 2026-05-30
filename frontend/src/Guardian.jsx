import { useEffect, useState } from "react";
import { api } from "./api";
import { summarizeGuardianHistory } from "./core/guardianSummary";

const LABEL = { green: "관찰 단계", yellow: "주의 단계", red: "집중지원 단계" };
const C = { green: "#1f7a3a", yellow: "#c98a00", red: "#c0392b" };

// 학생·학부모 = 열람 전용. 점수·키워드 등 내부 분해는 가린다(낙인·민감정보 보호).
export default function Guardian({ studentId, studentName }) {
  const [hist, setHist] = useState({ journals: [], signals: [] });
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!studentId) return;
    let live = true;
    api.journals(studentId).then((h) => { if (live) { setHist(h); setAsked(false); } });
    return () => { live = false; };
  }, [studentId]);

  const latest = hist.signals[hist.signals.length - 1];
  const summary = summarizeGuardianHistory(hist);
  return (
    <div className="guardian">
      <h2>내 정보 열람 <small className="muted">· {studentName} · 열람 전용</small></h2>

      {latest ? (
        <div className="g-status" style={{ borderColor: C[latest.color] }}>
          <div className="g-state" style={{ color: C[latest.color] }}>{LABEL[latest.color]}</div>
          <div className="muted">최근 갱신 {latest.created_at}</div>
        </div>
      ) : <div className="muted">기록 없음</div>}

      <h3>보호자 안내</h3>
      <div className="g-summary">
        <div>{summary.summary_text}</div>
        <div className="muted">현재 안내 단계: {summary.stage_text}</div>
        {summary.guardian_actions.length > 0 && (
          <ul className="g-actions">
            {summary.guardian_actions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        )}
        {summary.contact_channels.length > 0 && (
          <div className="g-channels">
            상담·연락: {summary.contact_channels.join(", ")}
          </div>
        )}
      </div>
      <h3>지원 경과</h3>
      {hist.journals.map((j, i) => (
        <div key={j.id} className="g-row">
          <span className="dot" style={{ background: C[hist.signals[i]?.color] }} />
          <span>{hist.signals[i]?.created_at} · {LABEL[hist.signals[i]?.color]}</span>
        </div>
      ))}
      <div className="g-note muted">
        ※ 위험 점수·유형·세부 판단 근거는 학생 보호를 위해 표시하지 않습니다.
        필요한 맥락은 담임·상담교사와의 상담을 통해 확인해 주세요.
      </div>

      <button className="g-correct" onClick={() => setAsked(true)} disabled={asked}>
        {asked ? "정정 청구가 접수되었습니다 (담당 교사 검토 예정)" : "기록 정정 청구하기"}
      </button>
    </div>
  );
}
