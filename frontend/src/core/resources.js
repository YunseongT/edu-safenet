// 자원매칭 (backend/app/resources.py 포팅). 정적 데모: 외부 실시간 호출 없이 시드 데이터.
const SCHOOL_INTERNAL = {
  A: { wee_class: true, note: "교내 Wee클래스 운영 · 내부 상담전문가 배치(학교알리미 공시 기준)" },
  B: { wee_class: false, note: "교내 Wee클래스 미설치 · 외부 상담자원 연계 필요(학교알리미 공시 기준)" },
};

// 지역(시군구) 프리셋 — 통학구역 중심(=학교 비식별 좌표). 권역별 데모 5종.
export const REGIONS = {
  seoul_gangnam:    { label: "서울 강남구",  center: [37.5012, 127.0396] },
  gyeonggi_suwon:   { label: "경기 수원시",  center: [37.2636, 127.0286] },
  daejeon_seo:      { label: "대전 서구",    center: [36.3550, 127.3839] },
  gangwon_chuncheon:{ label: "강원 춘천시",  center: [37.8813, 127.7300] },
  busan_haeundae:   { label: "부산 해운대구", center: [35.1631, 129.1635] },
};
export const DEFAULT_REGION = "seoul_gangnam";

// 자원유형별 중심 대비 오프셋(시드). 지역을 바꿔도 중심 주변에 그려지게 상대좌표.
const SEED_OFFSETS = {
  "정신건강의학과": [{ name: "○○정신건강의학과의원", tel: "공개정보", source: "HIRA 병원정보(시드)", d: [0.0073, 0.0094], group: "medical" }],
  "정신건강복지센터": [{ name: "○○구 정신건강복지센터", tel: "1577-0199", source: "공공데이터(시드)", d: [-0.0032, 0.0164], group: "medical" }],
  "아동보호전문기관": [{ name: "○○지역 아동보호전문기관", tel: "112 / 1391", source: "공공데이터(시드)", d: [-0.0252, -0.0096], group: "child" }],
  "청소년상담복지센터": [{ name: "○○시 청소년상담복지센터(CYS-Net)", tel: "1388", source: "여가부(시드)", d: [0.0168, -0.0146], group: "counsel" }],
  "특수교육지원센터": [{ name: "○○교육지원청 특수교육지원센터", tel: "공개정보", source: "공공데이터(시드)", d: [0.0288, 0.0204], group: "special" }],
};

function distKm(lat, lng, center) {
  const [a, b] = center, p = Math.PI / 180;
  const h = Math.sin((lat - a) * p / 2) ** 2
    + Math.cos(a * p) * Math.cos(lat * p) * Math.sin((lng - b) * p / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

function seedFor(kind, center) {
  return (SEED_OFFSETS[kind] || []).map((s) => {
    const lat = center[0] + s.d[0], lng = center[1] + s.d[1];
    return { name: s.name, addr: `통학구역 중심 인근 약 ${distKm(lat, lng, center)}km`,
      tel: s.tel, source: s.source, lat, lng, group: s.group };
  });
}

export function match(caseResources, school, region, color = "green") {
  const internal = SCHOOL_INTERNAL[school] || SCHOOL_INTERNAL.A;
  const rkey = REGIONS[region] ? region : DEFAULT_REGION;
  const center = REGIONS[rkey].center;
  const internalOut = [], externalOut = [], points = [];

  // 학교(통학구역 중심) 마커는 항상 표시.
  points.push({ kind: "학교(통학구역 중심)", name: `본교 · ${REGIONS[rkey].label}`, lat: center[0], lng: center[1], group: "school" });

  for (const kind of caseResources) {
    if (kind === "wee_class") {
      internalOut.push({ kind: "교내 Wee클래스", available: internal.wee_class,
        note: internal.note, source: "학교알리미 OpenAPI" });
      if (internal.wee_class)
        points.push({ kind: "교내 Wee클래스", name: "교내 Wee클래스", lat: center[0] + 0.0008, lng: center[1] + 0.0008, group: "wee" });
    } else if (kind === "112_신고" || kind === "학교폭력대책심의위원회") {
      internalOut.push({ kind, available: true, note: "법정 절차 · 교내/관할 연계", source: "법령 절차" });
    } else {
      const items = seedFor(kind, center);
      externalOut.push({ kind, source_mode: "시드(데모)", items });
      for (const it of items)
        if (it.lat && it.lng) points.push({ kind, name: it.name, lat: it.lat, lng: it.lng, group: it.group });
    }
  }
  return {
    internal: internalOut, external: externalOut, region: rkey,
    map: { center, points, region_label: REGIONS[rkey].label },
    deidentified: {
      "외부전송_데이터": { "통학구역_중심좌표": center, "사안코드": `C-${color.toUpperCase()}` },
      "포함되지_않음": ["학생명", "주소", "주민번호", "연락처"],
    },
  };
}
