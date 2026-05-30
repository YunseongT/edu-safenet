import assert from "node:assert/strict";
import { test } from "node:test";

import { match } from "../frontend/src/core/resources.js";

test("resource matching exposes honest source metadata for static resources", () => {
  const result = match(["wee_class", "청소년상담복지센터"], "A", "seoul_gangnam", "yellow");

  assert.equal(result.internal[0].source_type, "preset");
  assert.equal(result.internal[0].source_name, "학교알리미 데모 프리셋");
  assert.ok(result.internal[0].retrieved_at);
  assert.equal(result.internal[0].stale_reason, "정적 배포에서는 학교알리미 OpenAPI를 호출하지 않음");

  assert.equal(result.external[0].source_type, "cached");
  assert.equal(result.external[0].source_name, "청소년상담복지센터 시드 캐시");
  assert.equal(result.external[0].items[0].source_type, "cached");
  assert.equal(result.external[0].items[0].source_name, "청소년상담복지센터 시드 캐시");
});

test("resource matching includes color-specific deidentified case code", () => {
  const result = match(["청소년상담복지센터"], "A", "seoul_gangnam", "red");

  assert.equal(result.deidentified["외부전송_데이터"]["사안코드"], "C-RED");
});
