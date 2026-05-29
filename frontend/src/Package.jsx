import ResourceMap from "./ResourceMap";
import { pkgLabel } from "./core/packageLabel";

export default function Package({ data, onClose }) {
  if (!data) return null;
  const v = data.report.verification;
  const title = pkgLabel(data.signal.color);
  return (
    <div className="pkg-overlay" onClick={onClose}>
      <div className="pkg" onClick={(e) => e.stopPropagation()}>
        <div className="pkg-head">
          <h2>{title}</h2>
          <button onClick={onClose}>닫기</button>
        </div>

        <div className="pkg-sig">
          신호등: <b className={data.signal.color}>{data.signal.color.toUpperCase()}</b> · 점수 {data.signal.score} · {data.signal.labels.join(", ") || "유형 없음"}
          {data.signal.floor_reasons.length > 0 && <span> · floor: {data.signal.floor_reasons.join(", ")}</span>}
        </div>

        <h3>보고서 초안 <span className={`vbadge ${v.passed ? "ok" : "warn"}`}>
          {v.passed ? "✓ 검증 통과 (결정·처방 없음)" : "⚠ 검증 경고"}
        </span></h3>
        <pre className="report">{data.report.report}</pre>
        <div className="vdetail">
          검증 패스: 규칙 점검 {v.rule_hits.length ? `위반(${v.rule_hits.join(", ")})` : "이상 없음"} · AI 검토: {v.llm_review.slice(0, 80)}
        </div>

        <h3>법령 근거 ({data.laws.length})</h3>
        {data.laws.map((l) => (
          <div key={l.title} className="pkg-law">· {l.link
            ? <a href={l.link} target="_blank" rel="noreferrer">{l.title}</a>
            : l.title}
            {l.verified && <span className="vbadge ok" style={{ marginLeft: 6 }}>✓ 법제처 확인</span>}</div>
        ))}

        <h3>자원 지도 <span className="muted">· V-WORLD · {data.resources.map?.region_label || "거리순 매칭"} 기준</span></h3>
        {data.resources.map && <ResourceMap map={data.resources.map} />}

        <h3>자원</h3>
        {data.resources.internal.map((r, i) => (
          <div key={i} className="pkg-law">· [교내] {r.kind} — {r.available ? "보유" : "미보유"}</div>
        ))}
        {data.resources.external.map((e, i) => (
          <div key={i} className="pkg-law">· [교외] {e.kind} ({e.source_mode}) — {e.items.length}건</div>
        ))}

        <div className="pkg-note">※ 본 패키지는 {data.signal.color === "red" ? "위원회" : "담당자"} '검토 자료'다. 최종 결정은 사람이 한다.</div>
      </div>
    </div>
  );
}
