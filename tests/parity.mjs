// 엔진 드리프트 방지: backend(py)가 만든 golden.json을 frontend core(js) 엔진과 대조.
// 실행: node tests/parity.mjs   (edu-safenet/ 에서)
// golden 갱신: backend venv로 tests/golden.json 재생성(아래 README 참조).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assess } from "../frontend/src/core/engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(here, "golden.json"), "utf-8"));

let fail = 0;
for (const g of golden) {
  const r = assess(g.text, g.school, g.scores);
  const cats = JSON.stringify([...Object.keys(r.categories)].sort());
  const labels = JSON.stringify([...r.labels].sort());
  const ok =
    r.color === g.color &&
    r.score === g.score &&
    r.floor_triggered === g.floor &&
    cats === JSON.stringify(g.categories) &&
    labels === JSON.stringify(g.labels) &&
    r.general_factors.score === g.gen_score &&
    r.scale_factors.score === g.scale_score;
  if (!ok) {
    fail++;
    console.error(
      `DRIFT [${g.name}]\n` +
      `  color:       py=${g.color} js=${r.color}\n` +
      `  score:       py=${g.score} js=${r.score}\n` +
      `  floor:       py=${g.floor} js=${r.floor_triggered}\n` +
      `  categories:  py=${JSON.stringify(g.categories)} js=${cats}\n` +
      `  labels:      py=${JSON.stringify(g.labels)} js=${labels}\n` +
      `  gen_score:   py=${g.gen_score} js=${r.general_factors.score}\n` +
      `  scale_score: py=${g.scale_score} js=${r.scale_factors.score}`,
    );
  }
}
if (fail) {
  console.error(`\n✗ parity FAIL: ${fail}/${golden.length} 케이스 불일치 (py↔js 엔진 드리프트)`);
  process.exit(1);
}
console.log(`✓ parity OK: ${golden.length}/${golden.length} 케이스 py↔js 일치`);
