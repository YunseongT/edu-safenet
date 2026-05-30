// 신호등 하네스 (backend/app/engine.py 포팅). 결정적·재현·설명 가능.
import {
  CATEGORIES, GENERAL_FACTORS, FLOOR_COMBOS,
  COMPOSITE_FACTORS, DEFAULT_COMPOSITE_FACTOR, SCALE_FACTORS,
} from "./cases.js";

export const SCHOOL_PRESETS = {
  A: { name: "A학교(상담전문가·Wee 보유)", yellow: 4, red: 8 },
  B: { name: "B학교(상담자원 부족)", yellow: 3, red: 6 },
};

function scan(text, keywords) {
  const hits = [];
  let score = 0;
  for (const [kw, w] of keywords) {
    if (text.includes(kw)) { hits.push({ keyword: kw, weight: w }); score += w; }
  }
  return { hits, score };
}

// 일지 + 상담기록 합쳐 스캔 대상으로 (backend combine_obs 포팅).
export function combineObs(journal, counsel = "") {
  const c = (counsel || "").trim();
  return c ? `${journal}\n[상담기록] ${c}` : journal;
}

// 검사점수 척도 → 가중치·floor (backend _scan_scores 포팅).
function scanScores(scores) {
  const hits = [], floorReasons = [];
  let score = 0;
  if (!scores) return { hits, score, floorReasons };
  for (const [key, cfg] of Object.entries(SCALE_FACTORS)) {
    const v = scores[key];
    if (v === null || v === undefined || v === "") continue;
    const val = Number(v);
    if (Number.isNaN(val)) continue;
    let w, level;
    if (val >= cfg.red) { w = cfg.weight_red; level = "red"; }
    else if (val >= cfg.yellow) { w = cfg.weight_yellow; level = "yellow"; }
    else continue;
    hits.push({ key, label: cfg.label, value: val, weight: w, level });
    score += w;
    if (cfg.floor_at !== undefined && val >= cfg.floor_at) floorReasons.push(`${cfg.label} 고위험 점수(${val})`);
  }
  return { hits, score, floorReasons };
}

export function assess(text, school = "A", scores = null) {
  const preset = SCHOOL_PRESETS[school] || SCHOOL_PRESETS.A;

  const categories = {};
  for (const [id, cfg] of Object.entries(CATEGORIES)) {
    const { hits, score } = scan(text, cfg.keywords);
    if (score > 0) categories[id] = { label: cfg.label, floor: cfg.floor, subscore: score, hits };
  }
  const gen = scan(text, GENERAL_FACTORS);
  const scale = scanScores(scores);

  const active = Object.keys(categories);
  const raw = Object.values(categories).reduce((s, c) => s + c.subscore, 0) + gen.score + scale.score;

  let factor = 1.0;
  if (active.length >= 2) {
    const key = [...active].sort().join("|");
    factor = COMPOSITE_FACTORS[key] ?? DEFAULT_COMPOSITE_FACTOR;
  }
  const adjusted = Math.round(raw * factor * 100) / 100;

  // floor: 위해 유형 강신호(subscore>=3)만. 약/모호 키워드 단독 적색 오탐 방지.
  const FLOOR_MIN = 3;
  const floorReasons = [];
  for (const c of Object.values(categories)) if (c.floor && c.subscore >= FLOOR_MIN) floorReasons.push(`${c.label} 신호 탐지`);
  for (const combo of FLOOR_COMBOS) {
    if (combo.every((c) => active.includes(c))) {
      floorReasons.push(`고위험 복합조합(${combo.map((c) => CATEGORIES[c].label).join(" + ")})`);
    }
  }
  floorReasons.push(...scale.floorReasons);  // 검사점수 고위험(자살위험 문항 등) → 즉시 적색

  let color;
  if (floorReasons.length) color = "red";
  else if (adjusted >= preset.red) color = "red";
  else if (adjusted >= preset.yellow) color = "yellow";
  else color = "green";

  return {
    color, score: adjusted, raw_score: raw, composite_factor: factor,
    floor_triggered: floorReasons.length > 0, floor_reasons: floorReasons,
    categories, general_factors: { hits: gen.hits, score: gen.score },
    scale_factors: { hits: scale.hits, score: scale.score },
    labels: Object.values(categories).map((c) => c.label),
    school: { key: school, ...preset },
  };
}
