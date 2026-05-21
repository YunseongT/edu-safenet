// 자원매칭 (backend/app/resources.py 포팅). 정적 데모: 외부 실시간 호출 없이 시드 데이터.
const SCHOOL_INTERNAL = {
  A: { wee_class: true, note: "교내 Wee클래스 운영 · 내부 상담전문가 배치(학교알리미 공시 기준)" },
  B: { wee_class: false, note: "교내 Wee클래스 미설치 · 외부 상담자원 연계 필요(학교알리미 공시 기준)" },
};

const SEED = {
  "정신건강의학과": [{ name: "○○정신건강의학과의원", addr: "통학구역 인근 1.2km", tel: "공개정보", source: "HIRA 병원정보(시드)" }],
  "정신건강복지센터": [{ name: "○○구 정신건강복지센터", addr: "구청 인근 2.0km", tel: "1577-0199", source: "공공데이터(시드)" }],
  "아동보호전문기관": [{ name: "○○지역 아동보호전문기관", addr: "관할 3.1km", tel: "112 / 1391", source: "공공데이터(시드)" }],
  "청소년상담복지센터": [{ name: "○○시 청소년상담복지센터(CYS-Net)", addr: "시내 2.5km", tel: "1388", source: "여가부(시드)" }],
  "특수교육지원센터": [{ name: "○○교육지원청 특수교육지원센터", addr: "교육지원청 4.0km", tel: "공개정보", source: "공공데이터(시드)" }],
};

export function match(caseResources, school) {
  const internal = SCHOOL_INTERNAL[school] || SCHOOL_INTERNAL.A;
  const internalOut = [], externalOut = [];
  for (const kind of caseResources) {
    if (kind === "wee_class") {
      internalOut.push({ kind: "교내 Wee클래스", available: internal.wee_class,
        note: internal.note, source: "학교알리미 OpenAPI" });
    } else if (kind === "112_신고" || kind === "학교폭력대책심의위원회") {
      internalOut.push({ kind, available: true, note: "법정 절차 · 교내/관할 연계", source: "법령 절차" });
    } else {
      externalOut.push({ kind, source_mode: "시드(데모)", items: SEED[kind] || [] });
    }
  }
  return {
    internal: internalOut, external: externalOut,
    deidentified: {
      "외부전송_데이터": { "통학구역_중심좌표": [37.5012, 127.0396], "사안코드": "C-RED" },
      "포함되지_않음": ["학생명", "주소", "주민번호", "연락처"],
    },
  };
}
