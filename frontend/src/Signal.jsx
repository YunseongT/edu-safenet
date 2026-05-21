const COLORS = {
  green: { bg: "#1f7a3a", label: "녹색 · 관찰" },
  yellow: { bg: "#c98a00", label: "황색 · 주의" },
  red: { bg: "#c0392b", label: "적색 · 즉시대응" },
};

export default function Signal({ result }) {
  if (!result) return <div className="signal-empty">일지를 입력하면 신호등이 산출됩니다.</div>;
  const rule = result.rule;
  const c = COLORS[rule.color];

  return (
    <div className="signal">
      <div className="lights">
        {["red", "yellow", "green"].map((k) => (
          <span
            key={k}
            className="bulb"
            style={{ background: rule.color === k ? COLORS[k].bg : "#2a2a2a",
                     boxShadow: rule.color === k ? `0 0 18px ${COLORS[k].bg}` : "none" }}
          />
        ))}
      </div>
      <div className="signal-head" style={{ color: c.bg }}>
        {c.label} · 점수 {rule.score}
      </div>

      {rule.floor_triggered && (
        <div className="floor-badge">
          ⚠ 바닥선(floor) 발동 — {rule.floor_reasons.join(", ")} · 학교 자원과 무관하게 적색
        </div>
      )}

      <div className="breakdown">
        <div className="bd-title">규칙 점수 분해 (재현·설명 가능)</div>
        {Object.entries(rule.categories).map(([id, cat]) => (
          <div key={id} className="bd-row">
            <b>{cat.label}{cat.floor ? " (위해유형)" : ""}</b>: {cat.subscore}점
            <span className="hits"> {cat.hits.map((h) => `${h.keyword}+${h.weight}`).join(" ")}</span>
          </div>
        ))}
        {rule.general_factors.score > 0 && (
          <div className="bd-row">
            <b>일반 위기신호</b>: {rule.general_factors.score}점
            <span className="hits"> {rule.general_factors.hits.map((h) => `${h.keyword}+${h.weight}`).join(" ")}</span>
          </div>
        )}
        <div className="bd-row calc">
          원점수 {rule.raw_score} × 복합배수 {rule.composite_factor} = {rule.score}
          {" · "}임계값 {rule.school.name}: 황{rule.school.yellow}/적{rule.school.red}
        </div>
      </div>

      {result.llm_context && (
        <div className="llm-context">
          <span className="tag">AI 맥락 보조</span> {result.llm_context}
          <div className="note">※ AI는 맥락만 제안. 색·결정은 규칙·사람이 한다.</div>
        </div>
      )}
    </div>
  );
}
