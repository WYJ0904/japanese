import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from payment_assets import (
    PAYMENT_METHODS,
    PNG_SIGNATURE,
    PaymentAssetError,
    load_qr_asset,
    public_payment_methods,
    qr_resource_id_for,
)


PLAN_CODES = (
    "trial_single_language",
    "dual_language_monthly",
    "tools_monthly",
    "all_access_monthly",
    "japanese_lifetime",
    "all_access_lifetime",
)


class PaymentAssetTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.environment = mock.patch.dict(
            os.environ,
            {"VOCAB_PAYMENT_QR_DIR": str(self.root)},
        )
        self.environment.start()

    def tearDown(self):
        self.environment.stop()
        self.temporary.cleanup()

    def write_asset(self, method, plan_code, content=None):
        path = self.root / f"{method}_{plan_code}.png"
        path.write_bytes(content if content is not None else PNG_SIGNATURE + b"sanitized")
        return path

    def test_catalog_contains_only_wechat_and_alipay(self):
        self.assertEqual(PAYMENT_METHODS, ("wechat", "alipay"))
        self.assertEqual(
            {item["code"] for item in public_payment_methods()},
            {"wechat", "alipay"},
        )

    def test_every_purchasable_plan_has_a_fixed_resource_for_each_method(self):
        resources = {
            qr_resource_id_for(method, plan)
            for method in PAYMENT_METHODS
            for plan in PLAN_CODES
        }
        self.assertEqual(len(resources), 12)
        self.assertEqual(
            qr_resource_id_for("wechat", "tools_monthly"),
            "qr-v1:wechat:tools_monthly",
        )
        self.assertEqual(
            qr_resource_id_for("alipay", "japanese_lifetime"),
            "qr-v1:alipay:japanese_lifetime",
        )

    def test_resource_id_mismatch_and_unknown_plan_are_rejected(self):
        self.write_asset("wechat", "tools_monthly")
        with self.assertRaises(PaymentAssetError) as mismatch:
            load_qr_asset(
                "wechat",
                "tools_monthly",
                "qr-v1:wechat:all_access_monthly",
            )
        self.assertEqual(mismatch.exception.code, "payment_qr_mismatch")
        with self.assertRaises(PaymentAssetError) as unknown:
            qr_resource_id_for("wechat", "../../secret")
        self.assertEqual(unknown.exception.code, "payment_qr_not_configured")

    def test_loader_uses_exact_file_and_accepts_only_png_signature(self):
        expected = PNG_SIGNATURE + b"sanitized-qr"
        self.write_asset("alipay", "all_access_monthly", expected)
        content, content_type = load_qr_asset(
            "alipay",
            "all_access_monthly",
            "qr-v1:alipay:all_access_monthly",
        )
        self.assertEqual(content, expected)
        self.assertEqual(content_type, "image/png")
        self.write_asset("alipay", "all_access_monthly", b"not-a-png")
        with self.assertRaises(PaymentAssetError) as invalid:
            load_qr_asset(
                "alipay",
                "all_access_monthly",
                "qr-v1:alipay:all_access_monthly",
            )
        self.assertEqual(invalid.exception.code, "payment_qr_invalid")

    def test_missing_asset_error_does_not_disclose_local_path(self):
        with self.assertRaises(PaymentAssetError) as missing:
            load_qr_asset(
                "wechat",
                "japanese_lifetime",
                "qr-v1:wechat:japanese_lifetime",
            )
        self.assertEqual(missing.exception.code, "payment_qr_unavailable")
        self.assertNotIn(str(self.root), str(missing.exception))


if __name__ == "__main__":
    unittest.main()
