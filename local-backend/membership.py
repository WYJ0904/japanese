from calendar import monthrange
from datetime import datetime, timezone


ENTITLEMENT_LABELS = {
    "language_japanese_access": "日语会员功能",
    "language_all_access": "全部语言会员功能",
    "tools_access": "在线工具箱",
    "tools_batch_access": "批量文件和图片处理",
    "temporary_share_access": "临时分享",
    "save_tool_config": "保存工具配置",
    "all_features_access": "全部普通高级功能",
}

ALL_ACCESS_ENTITLEMENTS = tuple(ENTITLEMENT_LABELS)

# This is the only price and entitlement source used by the backend and the UI.
MEMBERSHIP_PLANS = {
    "japanese_lifetime": {
        "name": "日语单项永久会员",
        "price_cents": 7000,
        "currency": "CNY",
        "lifetime": True,
        "duration_months": 0,
        "purchasable": True,
        "priority": 30,
        "description": "仅限日语语言测试会员功能，永久有效，不包含在线工具箱。",
        "entitlements": ("language_japanese_access",),
    },
    "all_access_monthly": {
        "name": "全功能月度会员",
        "price_cents": 3000,
        "currency": "CNY",
        "lifetime": False,
        "duration_months": 1,
        "purchasable": True,
        "priority": 80,
        "description": "全部语言测试和在线工具箱功能，有效期一个月。",
        "entitlements": ALL_ACCESS_ENTITLEMENTS,
    },
    "all_access_lifetime": {
        "name": "全功能永久会员",
        "price_cents": 10000,
        "currency": "CNY",
        "lifetime": True,
        "duration_months": 0,
        "purchasable": True,
        "priority": 100,
        "description": "全部语言测试和在线工具箱功能，永久有效。",
        "entitlements": ALL_ACCESS_ENTITLEMENTS,
    },
    "trial_single_language": {
        "name": "历史单语言体验版",
        "price_cents": 500,
        "currency": "CNY",
        "lifetime": False,
        "duration_months": 1,
        "purchasable": False,
        "priority": 10,
        "description": "兼容原有单语言体验会员。",
        "entitlements": (),
    },
    "legacy_all_monthly": {
        "name": "历史双语言包月会员",
        "price_cents": 1000,
        "currency": "CNY",
        "lifetime": False,
        "duration_months": 1,
        "purchasable": False,
        "priority": 50,
        "description": "保留改版前双语言包月权益，不包含在线工具箱。",
        "entitlements": ("language_all_access", "language_japanese_access"),
    },
    "legacy_all_lifetime": {
        "name": "历史双语言永久会员",
        "price_cents": 7000,
        "currency": "CNY",
        "lifetime": True,
        "duration_months": 0,
        "purchasable": False,
        "priority": 60,
        "description": "保留改版前双语言永久权益，不包含在线工具箱。",
        "entitlements": ("language_all_access", "language_japanese_access"),
    },
}

PURCHASABLE_PLAN_CODES = tuple(
    code for code, plan in MEMBERSHIP_PLANS.items() if plan["purchasable"]
)

LEGACY_PLAN_MAP = {
    "trial_single_language": "trial_single_language",
    "monthly": "legacy_all_monthly",
    "lifetime": "legacy_all_lifetime",
}


def public_plan_payload(include_hidden=False):
    result = []
    for code, plan in MEMBERSHIP_PLANS.items():
        if not include_hidden and not plan["purchasable"]:
            continue
        result.append(
            {
                "code": code,
                "name": plan["name"],
                "price_cents": plan["price_cents"],
                "price": f"{plan['price_cents'] / 100:g}",
                "currency": plan["currency"],
                "lifetime": plan["lifetime"],
                "duration_months": plan["duration_months"],
                "purchasable": plan["purchasable"],
                "priority": plan["priority"],
                "description": plan["description"],
                "entitlements": list(plan["entitlements"]),
            }
        )
    return sorted(result, key=lambda item: (-item["priority"], item["code"]))


def add_calendar_months(value, months):
    local = value.astimezone()
    month_index = local.month - 1 + int(months)
    year = local.year + month_index // 12
    month = month_index % 12 + 1
    day = min(local.day, monthrange(year, month)[1])
    return local.replace(year=year, month=month, day=day)


def default_plan_expiry(plan_code, starts_at=None):
    plan = MEMBERSHIP_PLANS.get(plan_code)
    if not plan or plan["lifetime"]:
        return ""
    start = starts_at or datetime.now(timezone.utc)
    local_expiry = add_calendar_months(start, plan["duration_months"]).replace(
        hour=23, minute=59, second=59, microsecond=0
    )
    return local_expiry.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
