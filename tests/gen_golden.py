"""골든 생성기 — backend 엔진(기준)으로 tests/golden.json 산출.
실행: cd backend && .venv/bin/python ../tests/gen_golden.py
엔진/케이스 수정 후 반드시 재생성하고 `node tests/parity.mjs`로 js 대조."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.engine import assess  # noqa: E402

# (name, text, school, scores). scores 없으면 None — 기존 케이스 동작 불변.
CASES = [
    ("자해 시드", "민수가 죽고 싶다고 말했고 손목에 흉터가 보였다.", "A", None),
    ("학폭 시드", "나가 따돌림을 당하고 욕설과 협박을 들었다고 한다.", "A", None),
    ("아동학대 시드", "다의 팔에 멍이 보였고 집에 가기 싫다며 맞았다고 말했다.", "A", None),
    ("특수+학폭 시드", "라는 발달이 느린 편인데 괴롭힘과 따돌림을 당했다.", "B", None),
    ("녹색대조", "마는 평소처럼 친구들과 어울리고 수업에 잘 참여했다.", "A", None),
    ("일반신호", "지수가 점심을 거르고 혼자 앉아 말이 없었다.", "A", None),
    ("오탐:보호자", "보호자에게 연락함.", "A", None),
    ("오탐:맞았", "시험 답이 맞았다.", "A", None),
    ("오탐:멍하니", "멍하니 창밖을 봤다.", "A", None),
    ("오탐:의미없", "의미 없는 숙제를 했다.", "A", None),
    ("오탐:서울", "서울에서 전학 옴.", "A", None),
    # 검사점수 척도 — 일지 텍스트 신호 없이 점수만으로 색 상승.
    ("점수:자살위험floor", "보호자 상담 예정.", "A", {"suicide_risk": 2}),
    ("점수:AMPQ적색", "특이사항 없이 평이함.", "A", {"ampq": 33}),
    ("점수:우울황색", "조용한 편.", "A", {"depression": 18}),
    ("점수:기준미달무시", "조용한 편.", "A", {"depression": 5, "ampq": 10}),
    ("점수+키워드합산", "지수가 점심을 거르고 혼자 앉아 말이 없었다.", "A", {"ampq": 26}),
]

out = []
for name, text, school, scores in CASES:
    r = assess(text, school, scores)
    out.append({"name": name, "text": text, "school": school, "scores": scores,
                "color": r["color"], "score": r["score"], "floor": r["floor_triggered"],
                "categories": sorted(r["categories"].keys()),
                "labels": sorted(r["labels"]),
                "gen_score": r["general_factors"]["score"],
                "scale_score": r["scale_factors"]["score"]})

dest = Path(__file__).resolve().parent / "golden.json"
dest.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"golden.json written: {len(out)} cases")
