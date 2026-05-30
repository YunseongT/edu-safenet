import unittest

from backend.app.dashboard_stats import stats


class DashboardStatsTest(unittest.TestCase):
    def test_stats_shape_matches_planned_dashboard(self):
        data = stats()

        self.assertEqual(data["source_type"], "seed")
        self.assertEqual(data["source_name"], "KEDI/KESS 데모 기준 통계")
        self.assertEqual(data["risk_index"]["school"], 0.62)
        self.assertEqual(data["risk_index"]["regional_average"], 0.45)
        self.assertEqual(data["risk_index"]["national_average"], 0.40)
        self.assertEqual(len(data["weekly_trend"]), 6)
        self.assertEqual(len(data["class_grid"]), 3)
        self.assertTrue(all(len(row["classes"]) == 5 for row in data["class_grid"]))


if __name__ == "__main__":
    unittest.main()
