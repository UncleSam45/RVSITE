import json
import sys
import unittest

import main


class OrjsonFallbackTests(unittest.TestCase):
    def tearDown(self) -> None:
        sys.modules.pop("orjson", None)

    def test_fallback_exposes_compatible_json_api(self) -> None:
        main.install_orjson_fallback()
        import orjson

        encoded = orjson.dumps(
            {"café": 2, "answer": 42},
            option=orjson.OPT_SORT_KEYS | orjson.OPT_APPEND_NEWLINE,
        )

        self.assertIsInstance(encoded, bytes)
        self.assertTrue(encoded.endswith(b"\n"))
        self.assertEqual(orjson.loads(encoded), {"answer": 42, "café": 2})
        self.assertIsNotNone(orjson.__spec__)

    def test_fallback_supports_default_serializer(self) -> None:
        main.install_orjson_fallback()
        import orjson

        encoded = orjson.dumps({"values": {1, 2}}, default=sorted)

        self.assertEqual(json.loads(encoded), {"values": [1, 2]})


if __name__ == "__main__":
    unittest.main()
