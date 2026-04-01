"""
Runtime-only API path materialization (not stored as plain route strings in call sites).
Release builds may replace this module with a hardened variant.
"""

from __future__ import annotations

import base64


def _route(encoded: str) -> str:
    return base64.b64decode(encoded).decode("ascii")


LICENSE_CHECK = _route("L2xpY2Vuc2UvY2hlY2s=")
LICENSE_AUTHORIZE = _route("L2xpY2Vuc2UvYXV0aG9yaXpl")
SUBSCRIPTION_STATUS = _route("L3N1YnNjcmlwdGlvbi9zdGF0dXM=")
SUBSCRIPTION_CURRENT = _route("L3N1YnNjcmlwdGlvbi9jdXJyZW50")
SUBSCRIPTION_PLANS = _route("L3N1YnNjcmlwdGlvbi9wbGFucw==")
USER_PROFILE = _route("L3VzZXIvcHJvZmlsZQ==")
AUTH_PROFILE = _route("L2F1dGgvcHJvZmlsZQ==")
AUTH_CHANGE_PASSWORD = _route("L2F1dGgvY2hhbmdlLXBhc3N3b3Jk")
PAYMENT_CREATE = _route("L3BheW1lbnQvY3JlYXRl")
CONTACT = _route("L2NvbnRhY3Q=")
AUTH_LOGIN = _route("L2F1dGgvbG9naW4=")
