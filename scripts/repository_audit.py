#!/usr/bin/env python3
"""Fail CI when tracked files contain private runtime data or stale plan metadata."""

from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "local-backend"
EXPECTED_PLAN_NAME = "日语单项永久会员"
OLD_REPOSITORY_PATTERNS = (
    re.compile(r"WYJ0904/japanese"),
    re.compile(r"github\.com/WYJ0904/japanese"),
    re.compile(r"japanese\.git"),
)
SECRET_PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub token": re.compile(r"gh[pousr]_[A-Za-z0-9_]{30,}"),
    "API key": re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    "AWS access key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "Cloudflare or Tunnel token": re.compile(
        r"(?im)\b(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|TUNNEL_TOKEN|CF_TUNNEL_TOKEN)"
        r"\s*[:=]\s*['\"]?[A-Za-z0-9._~-]{20,}"
    ),
}
PRIVATE_PATH_PATTERNS = (
    re.compile(r"[A-Za-z]:[\\/]Users[\\/][^\\/\r\n]+", re.IGNORECASE),
    re.compile(r"/(?:Users|home)/[^/\s]+/"),
)


def repository_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [item.decode("utf-8") for item in result.stdout.split(b"\0") if item]


def sensitive_path_reason(relative: str) -> str:
    normalized = relative.replace("\\", "/")
    lower = normalized.lower()
    parts = lower.split("/")
    name = parts[-1]
    suffix = Path(name).suffix.lower()

    if ".idea" in parts:
        return "IDE settings"
    if "__pycache__" in parts or suffix == ".pyc":
        return "Python runtime cache"
    if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
        return "environment file"
    if suffix in {".sqlite", ".sqlite3", ".db", ".db3"} or any(
        marker in name for marker in (".sqlite-", ".sqlite3-", ".db-")
    ):
        return "database"
    if "data" in parts or name == "users.txt":
        return "account runtime data"
    if (
        "/payment/qrcodes/" in f"/{lower}"
        or (("payment" in lower or "收款" in lower) and ("qr" in name or "二维码" in name))
    ) and suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return "private payment QR image"
    if (
        suffix in {".pem", ".key", ".p12", ".pfx"}
        or name == "credentials.json"
        or (".cloudflared" in parts and suffix in {".json", ".yml", ".yaml", ".pem"})
    ):
        return "credential material"
    if suffix in {".log", ".trace"} or name.endswith((".out", ".err")) or any(
        marker in name for marker in ("日志", "错误报告", "后台启动错误")
    ):
        return "runtime log or error report"
    return ""


def read_text(relative: str) -> str | None:
    data = (ROOT / relative).read_bytes()
    if b"\0" in data:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def load_membership_module():
    spec = importlib.util.spec_from_file_location("ci_membership", BACKEND / "membership.py")
    if not spec or not spec.loader:
        raise RuntimeError("membership.py could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    files = repository_files()
    errors: list[str] = []

    for relative in files:
        reason = sensitive_path_reason(relative)
        if reason:
            errors.append(f"{relative}: tracked {reason}")
            continue
        text = read_text(relative)
        if text is None:
            continue
        is_audit_script = relative == "scripts/repository_audit.py"
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"{relative}: contains a possible {label}")
        if Path(relative).name.lower() in {"config.yml", "config.yaml"} and re.search(
            r"(?im)^\s*tunnel\s*:", text
        ) and re.search(r"(?im)^\s*credentials-file\s*:", text):
            errors.append(f"{relative}: contains a Cloudflare Tunnel configuration")
        if not is_audit_script and any(
            pattern.search(text) for pattern in OLD_REPOSITORY_PATTERNS
        ):
            errors.append(f"{relative}: contains the old GitHub repository name")
        if any(pattern.search(text) for pattern in PRIVATE_PATH_PATTERNS):
            errors.append(f"{relative}: contains a user-specific absolute path")
        if not is_audit_script and ("日语永久会员" in text or "70 CNY 日语永久" in text):
            errors.append(f"{relative}: contains an incomplete 70 CNY plan name")

    membership = load_membership_module()
    japanese = membership.MEMBERSHIP_PLANS.get("japanese_lifetime", {})
    if japanese.get("name") != EXPECTED_PLAN_NAME:
        errors.append("membership.py: japanese_lifetime display name changed")
    if japanese.get("price_cents") != 7000:
        errors.append("membership.py: japanese_lifetime price changed")
    if tuple(japanese.get("entitlements", ())) != ("language_japanese_access",):
        errors.append("membership.py: japanese_lifetime entitlements changed")
    historical = membership.MEMBERSHIP_PLANS.get("dual_language_lifetime", {})
    if historical.get("purchasable") is not False:
        errors.append("membership.py: historical dual_language_lifetime became purchasable")

    account_source = (BACKEND / "account_store.py").read_text(encoding="utf-8")
    if re.search(r"^MEMBERSHIPS\s*=", account_source, re.MULTILINE):
        errors.append("account_store.py: generic MEMBERSHIPS constant returned")
    if re.search(r"^RECHARGE_PLANS\s*=", account_source, re.MULTILINE):
        errors.append("account_store.py: obsolete RECHARGE_PLANS constant returned")
    if "LEGACY_MEMBERSHIP_CODES" not in account_source:
        errors.append("account_store.py: legacy membership compatibility is undocumented")

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    if any(pattern.search(readme) for pattern in OLD_REPOSITORY_PATTERNS):
        errors.append("README.md: an obsolete clone URL remains")
    if "https://github.com/WYJ0904/thewyj.uk.git" not in readme:
        errors.append("README.md: current clone URL is missing")
    if "actions/workflows/ci.yml/badge.svg" not in readme:
        errors.append("README.md: CI status badge is missing")

    if errors:
        print("Repository audit failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Repository audit passed: {len(files)} tracked and candidate files checked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
