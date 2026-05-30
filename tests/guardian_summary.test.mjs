import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeGuardianHistory } from "../frontend/src/core/guardianSummary.js";

function signal(id, color, categories) {
  return {
    id,
    color,
    created_at: `2026-05-${18 + id}T09:00:00`,
    breakdown: { categories },
  };
}

test("guardian summary gives guidance without exposing category counts", () => {
  const hist = {
    journals: Array.from({ length: 7 }, (_, i) => ({ id: i + 1 })),
    signals: [
      signal(1, "yellow", { violence: { label: "학교폭력" } }),
      signal(2, "yellow", { violence: { label: "학교폭력" } }),
      signal(3, "green", {}),
      signal(4, "yellow", { violence: { label: "학교폭력" } }),
      signal(5, "red", { self_harm: { label: "자해" } }),
      signal(6, "yellow", { violence: { label: "학교폭력" } }),
      signal(7, "yellow", { violence: { label: "학교폭력" } }),
    ],
  };

  const summary = summarizeGuardianHistory(hist);

  assert.equal(summary.stage_text, "학교 상담 안내");
  assert.equal(summary.summary_text, "학교에서 보호자와 함께 확인하면 좋은 지원 상황을 관찰했습니다.");
  assert.ok(summary.guardian_actions.includes("학생을 추궁하거나 단정하지 말고, 평소와 다른 점을 차분히 들어 주세요."));
  assert.ok(summary.contact_channels.includes("학교 상담창구"));
  assert.equal(summary.category_counts, undefined);
  assert.equal(summary.dominant_label, undefined);
  assert.equal(summary.dominant_count, undefined);
  assert.equal(summary.recommended_resources, undefined);
  assert.ok(!/진단|처방|확정|학교폭력|자해|7건|5건/.test(JSON.stringify(summary)));
});

test("guardian summary returns a safe empty state", () => {
  const summary = summarizeGuardianHistory({ journals: [], signals: [] });

  assert.equal(summary.stage_text, "안내 없음");
  assert.equal(summary.summary_text, "현재 보호자에게 안내할 지원 상황이 없습니다.");
  assert.deepEqual(summary.guardian_actions, []);
  assert.deepEqual(summary.contact_channels, []);
});
