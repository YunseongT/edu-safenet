import { useEffect, useState } from "react";
import { api } from "./api";

// 업무담당교사(생활부장 등) — 사안별 행동지침. 가이드북 근거.
export default function Protocols({ studentId, studentName }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { api.protocols(studentId).then((d) => { setData(d); setOpen(d.protocols[0]?.id); }); }, [studentId]);
  if (!data) return <div className="muted">불러오는 중...</div>;

  return (
    <div className="protocols">
      <h2>사안별 행동지침 <small className="muted">· 업무담당교사 · {studentName} 활성 사안 우선</small></h2>
      <div className="muted" style={{ marginBottom: 10 }}>
        ※ 공공 가이드북 절차 요지. 실제 처리는 전담기구·위원회 결정에 따른다.
      </div>

      {data.protocols.map((p) => (
        <div key={p.id} className={`proto ${p.relevant ? "relevant" : ""}`}>
          <div className="proto-head" onClick={() => setOpen(open === p.id ? null : p.id)}>
            <span>{p.relevant ? "★ " : ""}{p.label}</span>
            <span className="proto-toggle">{open === p.id ? "−" : "+"}</span>
          </div>
          {open === p.id && (
            <div className="proto-body">
              <div className="proto-principle">원칙: {p.principle}</div>
              {p.steps.map((s, i) => (
                <div key={i} className="proto-step">
                  <div className="ps-title">{s.step} <span className="ps-deadline">{s.deadline}</span></div>
                  <div className="ps-do">{s.do}</div>
                </div>
              ))}
              <div className="proto-src">근거: {p.source}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
