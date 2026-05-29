import assert from "node:assert/strict";
import { test } from "node:test";

import { dashboardStats } from "../frontend/src/core/dashboardStats.js";

test("dashboard stats expose planned risk index comparison", () => {
  const stats = dashboardStats();

  assert.equal(stats.source_type, "seed");
  assert.equal(stats.source_name, "KEDI/KESS 데모 기준 통계");
  assert.equal(stats.risk_index.school, 0.62);
  assert.equal(stats.risk_index.regional_average, 0.45);
  assert.equal(stats.risk_index.national_average, 0.4);
});

test("dashboard stats include six-week trend and 3x5 class grid", () => {
  const stats = dashboardStats();

  assert.equal(stats.weekly_trend.length, 6);
  assert.ok(stats.weekly_trend.every((p) => "school" in p && "regional_average" in p));
  assert.equal(stats.class_grid.length, 3);
  assert.ok(stats.class_grid.every((grade) => grade.classes.length === 5));
});
