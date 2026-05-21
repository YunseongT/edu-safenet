// 보고서 초안 + 검증 (backend/app/report.py 포팅). 정적: LLM 없음 → 규칙 템플릿.
const BANNED = ["진단", "처방", "투약", "퇴학", "전학 조치", "징계", "확정한다", "결정한다", "조치한다"];

function templateDraft(refinedText, rule) {
  const labels = rule.labels.join(", ") || "특이 유형 없음";
  const concerns = [];
  for (const c of Object.values(rule.categories)) {
    const kws = c.hits.map((h) => h.keyword).join(", ");
    concerns.push(`* ${c.label} 관련 신호 관찰됨 (${kws}).`);
  }
  if (rule.floor_reasons.length) concerns.push(`* 바닥선 발동: ${rule.floor_reasons.join(", ")} — 즉시 대응 필요.`);
  if (rule.general_factors.score > 0) {
    const gk = rule.general_factors.hits.map((h) => h.keyword).join(", ");
    concerns.push(`* 일반 위기신호 관찰됨 (${gk}).`);
  }
  return `## 위기지원 보고서 (초안)\n\n**[개요]**\n관찰 기록: ${refinedText}\n규칙 분류: ${labels} · 위험도 ${rule.color}(점수 ${rule.score}).\n\n**[우려점]**\n${concerns.join("\n")}`;
}

export function buildReport(refinedText, rule) {
  const text = templateDraft(refinedText, rule);
  const ruleHits = BANNED.filter((w) => text.includes(w));
  return {
    report: text,
    verification: { passed: ruleHits.length === 0, rule_hits: ruleHits, llm_review: "규칙 점검만 적용(데모 모드)" },
  };
}
