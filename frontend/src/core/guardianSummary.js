const STAGE_TEXT = {
  green: "일상 관찰 안내",
  yellow: "학교 상담 안내",
  red: "긴급 안전 확인 안내",
};

const SUMMARY_TEXT = {
  green: "현재 보호자에게 추가로 안내할 지원 상황은 없습니다.",
  yellow: "학교에서 보호자와 함께 확인하면 좋은 지원 상황을 관찰했습니다.",
  red: "학생의 안전을 우선 확인해야 하는 지원 상황이 관찰되었습니다.",
};

const ACTIONS = {
  green: [
    "평소 생활 리듬과 등교 상태를 조용히 살펴봐 주세요.",
    "걱정되는 변화가 있으면 담임교사에게 상담을 요청해 주세요.",
  ],
  yellow: [
    "학생을 추궁하거나 단정하지 말고, 평소와 다른 점을 차분히 들어 주세요.",
    "학교 상담창구를 통해 맥락과 지원 방법을 함께 확인해 주세요.",
  ],
  red: [
    "학생이 혼자 위험한 상황에 놓이지 않도록 즉시 안전을 확인해 주세요.",
    "긴급 위험이 의심되면 학교 연락과 별개로 112 또는 1393에 바로 연락해 주세요.",
  ],
};

const CHANNELS = {
  green: ["담임교사"],
  yellow: ["학교 상담창구", "담임교사", "청소년상담 1388"],
  red: ["학교 상담창구", "112", "자살예방상담 1393", "청소년상담 1388"],
};

export function summarizeGuardianHistory(hist) {
  const journals = hist?.journals || [];
  const signals = hist?.signals || [];
  const latest = signals[signals.length - 1] || null;

  if (journals.length === 0 || signals.length === 0) {
    return {
      latest_color: null,
      stage_text: "안내 없음",
      summary_text: "현재 보호자에게 안내할 지원 상황이 없습니다.",
      guardian_actions: [],
      contact_channels: [],
    };
  }

  const color = latest.color || "green";

  return {
    latest_color: color,
    stage_text: STAGE_TEXT[color] || STAGE_TEXT.green,
    summary_text: SUMMARY_TEXT[color] || SUMMARY_TEXT.green,
    guardian_actions: ACTIONS[color] || ACTIONS.green,
    contact_channels: CHANNELS[color] || CHANNELS.green,
  };
}
