import os
from pathlib import Path


PAYMENT_METHODS = ("wechat", "alipay")
PAYMENT_METHOD_LABELS = {
    "wechat": "微信支付",
    "alipay": "支付宝",
}
MAX_QR_BYTES = max(32 * 1024, int(os.environ.get("VOCAB_PAYMENT_QR_MAX_BYTES", str(3 * 1024 * 1024))))
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

_PLAN_FILENAMES = {
    "trial_single_language": "trial_single_language.png",
    "dual_language_monthly": "dual_language_monthly.png",
    "tools_monthly": "tools_monthly.png",
    "all_access_monthly": "all_access_monthly.png",
    "dual_language_lifetime": "dual_language_lifetime.png",
    "all_access_lifetime": "all_access_lifetime.png",
}


class PaymentAssetError(Exception):
    def __init__(self, message, code="payment_qr_unavailable"):
        super().__init__(message)
        self.code = code


def normalize_payment_method(value):
    method = str(value or "").strip().lower()
    if method not in PAYMENT_METHODS:
        raise PaymentAssetError("请选择微信支付或支付宝", "payment_method_invalid")
    return method


def qr_resource_id_for(method, plan_code):
    method = normalize_payment_method(method)
    plan_code = str(plan_code or "").strip()
    if plan_code not in _PLAN_FILENAMES:
        raise PaymentAssetError("该套餐未配置收款二维码", "payment_qr_not_configured")
    return f"qr-v1:{method}:{plan_code}"


def _resource_filename(method, plan_code, resource_id):
    expected_id = qr_resource_id_for(method, plan_code)
    if str(resource_id or "") != expected_id:
        raise PaymentAssetError("订单二维码资源不匹配", "payment_qr_mismatch")
    return f"{method}_{_PLAN_FILENAMES[plan_code]}"


def payment_qr_root():
    configured = str(os.environ.get("VOCAB_PAYMENT_QR_DIR", "")).strip()
    return Path(configured) if configured else Path(__file__).resolve().parent / "data" / "payment" / "qrcodes"


def load_qr_asset(method, plan_code, resource_id):
    filename = _resource_filename(method, plan_code, resource_id)
    root = payment_qr_root().resolve()
    candidate = (root / filename).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise PaymentAssetError("二维码资源路径无效", "payment_qr_path_invalid") from exc
    if not candidate.is_file():
        raise PaymentAssetError("该收款二维码暂不可用，请联系管理员", "payment_qr_unavailable")
    size = candidate.stat().st_size
    if size < len(PNG_SIGNATURE) or size > MAX_QR_BYTES:
        raise PaymentAssetError("二维码资源大小无效", "payment_qr_invalid")
    content = candidate.read_bytes()
    if len(content) != size or not content.startswith(PNG_SIGNATURE):
        raise PaymentAssetError("二维码资源格式无效", "payment_qr_invalid")
    return content, "image/png"


def public_payment_methods():
    return [
        {"code": method, "name": PAYMENT_METHOD_LABELS[method]}
        for method in PAYMENT_METHODS
    ]
