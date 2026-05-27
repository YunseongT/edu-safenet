// 케이스별 큐레이션 법령 (backend/app/law.py 포팅).
export const LAW_BY_CATEGORY = {
  self_harm: [
    { title: "자살예방 및 생명존중문화 조성을 위한 법률 제2조·제7조",
      summary: "국가·지자체는 자살위험자 조기발견·개입 체계를 마련하고, 발견 시 적절한 서비스로 연계할 책무가 있다.",
      source: "국가법령정보센터" },
    { title: "학교보건법 제11조(치료 및 예방조치 등)",
      summary: "학교의 장은 학생의 신체적·정신적 건강에 문제가 있다고 인정되면 보호자와 협의하여 필요한 조치를 하여야 한다.",
      source: "국가법령정보센터" },
  ],
  abuse: [
    { title: "아동학대범죄의 처벌 등에 관한 특례법 제10조(신고의무)",
      summary: "교직원은 직무상 아동학대를 알게 되거나 의심이 있는 경우 즉시 수사기관 또는 아동보호전문기관에 신고하여야 한다(신고의무자).",
      source: "국가법령정보센터" },
    { title: "아동복지법 제26조(아동학대 신고의무자에 대한 교육)",
      summary: "신고의무자는 아동학대 예방·신고의무 관련 교육을 받아야 한다.",
      source: "국가법령정보센터" },
  ],
  violence: [
    { title: "학교폭력예방 및 대책에 관한 법률 제20조(학교폭력의 신고의무)",
      summary: "학교폭력 현장을 보거나 사실을 알게 된 자는 학교 등 관계기관에 신고하여야 한다.",
      source: "국가법령정보센터" },
    { title: "동법 제16조(피해학생의 보호)",
      summary: "심의위원회는 피해학생 보호를 위해 상담·일시보호·치료요양 등 조치를 요청할 수 있다.",
      source: "국가법령정보센터" },
  ],
  special_ed: [
    { title: "장애인 등에 대한 특수교육법 제15조·제28조",
      summary: "특수교육대상자 선정 및 통합교육·특수교육 관련서비스(상담지원 등) 제공 근거.",
      source: "국가법령정보센터" },
  ],
};

// 법제처 국가법령정보 검색 링크(결정적). 향후 LAW_API_KEY로 조문 본문 RAG 전환.
function lawLink(title) {
  const name = title.split(" 제")[0].split("(")[0].trim();
  return `https://www.law.go.kr/LSW/lsSc.do?menuId=1&query=${encodeURIComponent(name)}`;
}

export function lawsFor(categories) {
  const out = [], seen = new Set();
  for (const id of Object.keys(categories)) {
    for (const law of (LAW_BY_CATEGORY[id] || [])) {
      if (!seen.has(law.title)) { seen.add(law.title); out.push({ ...law, category: id, link: lawLink(law.title) }); }
    }
  }
  return out;
}
