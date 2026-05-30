"""검증 패스(verify) 안전게이트 회귀 테스트 — 핵심 차별점 'AI는 자료까지, 결정은 사람'.

결정적 규칙 게이트(_BANNED 스캔)만 검사한다. LLM 2차는 환경의존(가용성)이라
report.LLM_ENABLED=False로 강제해 규칙 경로를 결정적으로 본다.
"""
import unittest

from backend.app import report


class VerifyGateTest(unittest.TestCase):
    def setUp(self):
        self._orig = report.LLM_ENABLED
        report.LLM_ENABLED = False  # 규칙 게이트만 (LLM 비의존·결정적)

    def tearDown(self):
        report.LLM_ENABLED = self._orig

    def test_banned_words_block(self):
        # 결정·처방·조치 명령 표현은 통과 못 함(rule_hits에 인용).
        for bad in ["퇴학 조치한다", "징계를 결정한다", "약을 처방함", "전학 조치 필요", "확정한다"]:
            r = report.verify(f"[개요] 학생 관찰. {bad}.")
            self.assertFalse(r["passed"], f"통과되면 안 됨: {bad}")
            self.assertTrue(r["rule_hits"], f"rule_hits 비면 안 됨: {bad}")

    def test_clean_report_passes(self):
        r = report.verify("[개요] 결석이 누적되어 관찰이 필요한 상황으로 보인다. "
                          "[우려점] 정서적 위축 신호가 관찰된다.")
        self.assertTrue(r["passed"])
        self.assertEqual(r["rule_hits"], [])

    def test_banned_list_not_empty(self):
        # 누군가 _BANNED를 비우면 게이트가 무력화된다 — 가드.
        self.assertGreaterEqual(len(report._BANNED), 5)

    def test_build_appends_warning_on_violation(self):
        # refined 관찰에 결정문이 섞이면 템플릿 보고서에 실려 게이트가 잡고 경고를 덧붙인다.
        rule = {"labels": ["자해"], "color": "red", "score": 7.0, "categories": {},
                "general_factors": {"score": 0, "hits": []}, "floor_reasons": []}
        out = report.build("학생을 퇴학 조치한다.", rule)
        self.assertFalse(out["verification"]["passed"])
        self.assertIn("검증 경고", out["report"])


if __name__ == "__main__":
    unittest.main()
