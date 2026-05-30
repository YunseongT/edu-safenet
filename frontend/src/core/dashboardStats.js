export function dashboardStats() {
  return {
    source_type: "seed",
    source_name: "KEDI/KESS 데모 기준 통계",
    retrieved_at: "2026-05-18T09:00:00",
    stale_reason: "위험지수·추이·학급위험은 신호등 모델 집계(기획 기준). 학교 메타는 NEIS 실데이터로 앵커.",
    // 정적 배포본은 빌드타임 NEIS 스냅샷. 라이브 백엔드(/dashboard)는 호출 시점 실데이터로 대체.
    school_meta: {
      source_type: "snapshot",
      source_name: "NEIS 교육정보 개방 포털(빌드 스냅샷)",
      school_name: "개포중학교",
      class_count: 35,
      foundation: "공립",
      location: "서울특별시 강남구 선릉로 9",
      coedu: "남여공학",
      stale_reason: "정적 배포 스냅샷 — 라이브 백엔드 연결 시 호출 시점 NEIS 실데이터로 대체",
    },
    risk_index: {
      school: 0.62,
      regional_average: 0.45,
      national_average: 0.40,
    },
    weekly_trend: [
      { week: "6주 전", school: 0.48, regional_average: 0.42 },
      { week: "5주 전", school: 0.50, regional_average: 0.43 },
      { week: "4주 전", school: 0.53, regional_average: 0.43 },
      { week: "3주 전", school: 0.57, regional_average: 0.44 },
      { week: "2주 전", school: 0.60, regional_average: 0.45 },
      { week: "이번 주", school: 0.62, regional_average: 0.45 },
    ],
    class_grid: [
      { grade: 1, classes: [
        { class_name: "1-1", risk: 0.38, color: "green" },
        { class_name: "1-2", risk: 0.44, color: "green" },
        { class_name: "1-3", risk: 0.58, color: "yellow" },
        { class_name: "1-4", risk: 0.47, color: "green" },
        { class_name: "1-5", risk: 0.64, color: "yellow" },
      ] },
      { grade: 2, classes: [
        { class_name: "2-1", risk: 0.51, color: "yellow" },
        { class_name: "2-2", risk: 0.66, color: "yellow" },
        { class_name: "2-3", risk: 0.74, color: "red" },
        { class_name: "2-4", risk: 0.43, color: "green" },
        { class_name: "2-5", risk: 0.59, color: "yellow" },
      ] },
      { grade: 3, classes: [
        { class_name: "3-1", risk: 0.69, color: "yellow" },
        { class_name: "3-2", risk: 0.72, color: "red" },
        { class_name: "3-3", risk: 0.55, color: "yellow" },
        { class_name: "3-4", risk: 0.49, color: "green" },
        { class_name: "3-5", risk: 0.63, color: "yellow" },
      ] },
    ],
  };
}
