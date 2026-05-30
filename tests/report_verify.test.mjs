// 정적(core) 보고서 검증 게이트 회귀 — py verify와 대칭(금지어 차단).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../frontend/src/core/report.js";

const rule = { labels: ["자해"], color: "red", score: 7, categories: {},
  general_factors: { score: 0, hits: [] }, floor_reasons: [] };

test("금지어(결정·처방) 섞이면 검증 실패", () => {
  const out = buildReport("학생을 퇴학 조치한다.", rule);
  assert.equal(out.verification.passed, false);
  assert.ok(out.verification.rule_hits.length > 0, "rule_hits 비면 안 됨");
});

test("깨끗한 보고서는 통과", () => {
  const out = buildReport("결석이 누적되어 관찰이 필요해 보인다.", rule);
  assert.equal(out.verification.passed, true);
  assert.deepEqual(out.verification.rule_hits, []);
});
