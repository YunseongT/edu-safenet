// 자원매칭 (backend/app/resources.py 포팅). 정적 데모: 외부 실시간 호출 없이 시드 데이터.
const SCHOOL_INTERNAL = {
  A: { wee_class: true, note: "교내 Wee클래스 운영 · 내부 상담전문가 배치(학교알리미 공시 기준)" },
  B: { wee_class: false, note: "교내 Wee클래스 미설치 · 외부 상담자원 연계 필요(학교알리미 공시 기준)" },
};

// 통학구역 중심(=학교 비식별 좌표). 외부 자원은 이 중심 기준 거리순 매칭(데모 좌표).
const SCHOOL_CENTER = [37.5012, 127.0396];

// 자원유형별 데모 좌표 + 지도 그룹(마커 색). 실배포 시 VWorld 지오코딩으로 주소→좌표.
const SEED = {
  "정신건강의학과": [{ name: "○○정신건강의학과의원", addr: "통학구역 인근 1.2km", tel: "공개정보", source: "HIRA 병원정보(시드)", lat: 37.5085, lng: 127.0490, group: "medical" }],
  "정신건강복지센터": [{ name: "○○구 정신건강복지센터", addr: "구청 인근 2.0km", tel: "1577-0199", source: "공공데이터(시드)", lat: 37.4980, lng: 127.0560, group: "medical" }],
  "아동보호전문기관": [{ name: "○○지역 아동보호전문기관", addr: "관할 3.1km", tel: "112 / 1391", source: "공공데이터(시드)", lat: 37.4760, lng: 127.0300, group: "child" }],
  "청소년상담복지센터": [{ name: "○○시 청소년상담복지센터(CYS-Net)", addr: "시내 2.5km", tel: "1388", source: "여가부(시드)", lat: 37.5180, lng: 127.0250, group: "counsel" }],
  "특수교육지원센터": [{ name: "○○교육지원청 특수교육지원센터", addr: "교육지원청 4.0km", tel: "공개정보", source: "공공데이터(시드)", lat: 37.5300, lng: 127.0600, group: "special" }],
};

export function match(caseResources, school) {
  const internal = SCHOOL_INTERNAL[school] || SCHOOL_INTERNAL.A;
  const internalOut = [], externalOut = [], points = [];

  // 학교(통학구역 중심) 마커는 항상 표시.
  points.push({ kind: "학교(통학구역 중심)", name: "본교", lat: SCHOOL_CENTER[0], lng: SCHOOL_CENTER[1], group: "school" });

  for (const kind of caseResources) {
    if (kind === "wee_class") {
      internalOut.push({ kind: "교내 Wee클래스", available: internal.wee_class,
        note: internal.note, source: "학교알리미 OpenAPI" });
      if (internal.wee_class)
        points.push({ kind: "교내 Wee클래스", name: "교내 Wee클래스", lat: SCHOOL_CENTER[0] + 0.0008, lng: SCHOOL_CENTER[1] + 0.0008, group: "wee" });
    } else if (kind === "112_신고" || kind === "학교폭력대책심의위원회") {
      internalOut.push({ kind, available: true, note: "법정 절차 · 교내/관할 연계", source: "법령 절차" });
    } else {
      const items = SEED[kind] || [];
      externalOut.push({ kind, source_mode: "시드(데모)", items });
      for (const it of items)
        if (it.lat && it.lng) points.push({ kind, name: it.name, lat: it.lat, lng: it.lng, group: it.group });
    }
  }
  return {
    internal: internalOut, external: externalOut,
    map: { center: SCHOOL_CENTER, points },
    deidentified: {
      "외부전송_데이터": { "통학구역_중심좌표": SCHOOL_CENTER, "사안코드": "C-RED" },
      "포함되지_않음": ["학생명", "주소", "주민번호", "연락처"],
    },
  };
}
