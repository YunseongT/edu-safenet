import unittest
from unittest.mock import patch

from backend.app.resources import match


class ResourceMetadataTest(unittest.TestCase):
    def test_resource_matching_exposes_honest_source_metadata(self):
        with patch.dict("os.environ", {"SCHOOLINFO_API_KEY": "", "DATA_GO_KR_API_KEY": ""}, clear=False):
            result = match(["wee_class", "청소년상담복지센터"], "A", "seoul_gangnam", "yellow")

        self.assertEqual(result["internal"][0]["source_type"], "preset")
        self.assertEqual(result["internal"][0]["source_name"], "학교알리미 데모 프리셋")
        self.assertTrue(result["internal"][0]["retrieved_at"])
        self.assertEqual(
            result["internal"][0]["stale_reason"],
            "온프레미스 기본값은 학교알리미 OpenAPI를 호출하지 않음",
        )

        self.assertEqual(result["external"][0]["source_type"], "cached")
        self.assertEqual(result["external"][0]["source_name"], "청소년상담복지센터 시드 캐시")
        self.assertEqual(result["external"][0]["items"][0]["source_type"], "cached")
        self.assertEqual(result["external"][0]["items"][0]["source_name"], "청소년상담복지센터 시드 캐시")

    def test_wee_class_uses_schoolinfo_live_api_when_key_exists(self):
        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "resultCode": "success",
                    "list": [{
                        "SCHUL_NM": "테스트중학교",
                        "SCHUL_CODE": "S000000001",
                        "WEE_CINSTL_YN": "N",
                        "INNER_CNSL_SPLST_OPER_YN": "Y",
                        "COSE_CNSL_TLGM_TCR_FGR": 42,
                    }],
                }

        with patch.dict("os.environ", {
            "SCHOOLINFO_API_KEY": "test-key",
            "SCHOOLINFO_PBAN_YR": "2026",
            "SCHOOLINFO_A_SCHUL_CODE": "S000000001",
            # per-school 지역 오버라이드 미사용 시 region(강남)이 sido를 결정함을 검증.
            "SCHOOLINFO_A_SIDO_CODE": "",
            "SCHOOLINFO_A_SGG_CODE": "",
            "SCHOOLINFO_A_SCHUL_KND_CODE": "",
        }, clear=False), patch("backend.app.resources.httpx.post", return_value=Response()) as post:
            result = match(["wee_class"], "A", "seoul_gangnam", "yellow")

        internal = result["internal"][0]
        self.assertEqual(internal["source_type"], "live")
        self.assertEqual(internal["source_name"], "학교알리미 OpenAPI")
        self.assertEqual(internal["available"], False)
        self.assertIn("테스트중학교", internal["note"])
        params = post.call_args.kwargs["data"]
        self.assertEqual(params["apiType"], "61")
        self.assertEqual(params["apiKey"], "test-key")
        self.assertEqual(params["pbanYr"], "2026")
        self.assertEqual(params["sidoCode"], "11")

    def test_pinned_code_not_in_response_falls_back_to_preset_not_first_row(self):
        """지정 학교코드가 응답에 없으면 rows[0]을 라이브로 위장하지 않고 프리셋 폴백."""
        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {"resultCode": "success", "list": [{
                    "SCHUL_NM": "다른학교", "SCHUL_CODE": "S000000999",
                    "WEE_CINSTL_YN": "Y", "INNER_CNSL_SPLST_OPER_YN": "Y",
                    "COSE_CNSL_TLGM_TCR_FGR": 7,
                }]}

        with patch.dict("os.environ", {
            "SCHOOLINFO_API_KEY": "test-key",
            "SCHOOLINFO_A_SCHUL_CODE": "S000000001",  # 응답에 없는 코드
            "SCHOOLINFO_A_SCHUL_NM": "",
            "SCHOOLINFO_A_SIDO_CODE": "",
            "SCHOOLINFO_A_SGG_CODE": "",
            "SCHOOLINFO_A_SCHUL_KND_CODE": "",
        }, clear=False), patch("backend.app.resources.httpx.post", return_value=Response()):
            result = match(["wee_class"], "A", "seoul_gangnam", "yellow")

        internal = result["internal"][0]
        self.assertEqual(internal["source_type"], "preset")
        self.assertNotIn("다른학교", internal.get("note", ""))

    def test_hira_psychiatry_uses_center_radius_and_maps_coordinates(self):
        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "response": {
                        "body": {
                            "items": {
                                "item": [{
                                    "yadmNm": "마음건강의원",
                                    "addr": "서울 강남구 테스트로 1",
                                    "telno": "02-000-0000",
                                    "XPos": "127.0401",
                                    "YPos": "37.5018",
                                }]
                            }
                        }
                    }
                }

        with patch.dict("os.environ", {
            "HIRA_API_KEY": "hira-key",
            "HIRA_API_ENDPOINT": "https://example.test/hira",
            "SCHOOLINFO_API_KEY": "",
            "DATA_GO_KR_API_KEY": "",
        }, clear=False), \
            patch("backend.app.resources.httpx.get", return_value=Response()) as get, \
            patch("backend.app.resources._save_to_cache"):
            result = match(["정신건강의학과"], "A", "seoul_gangnam", "red")

        params = get.call_args.kwargs["params"]
        self.assertEqual(get.call_args.kwargs["timeout"], 15.0)
        self.assertEqual(params["serviceKey"], "hira-key")
        self.assertEqual(params["dgsbjtCd"], "03")
        self.assertEqual(params["xPos"], 127.0396)
        self.assertEqual(params["yPos"], 37.5012)
        self.assertEqual(params["radius"], 3000)

        external = result["external"][0]
        item = external["items"][0]
        self.assertEqual(external["source_mode"], "실시간")
        self.assertEqual(item["name"], "마음건강의원")
        self.assertEqual(item["lat"], 37.5018)
        self.assertEqual(item["lng"], 127.0401)
        self.assertEqual(item["group"], "medical")

        point = next(p for p in result["map"]["points"] if p["name"] == "마음건강의원")
        self.assertEqual(point["addr"], item["addr"])
        self.assertEqual(point["tel"], item["tel"])
        self.assertEqual(point["source"], item["source"])


if __name__ == "__main__":
    unittest.main()
