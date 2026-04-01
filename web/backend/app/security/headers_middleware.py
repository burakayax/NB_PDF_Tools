"""
Üretimde güvenlik başlıkları: nosniff, çerçeve kısıtı, CSP (API / PDF için sıkı), isteğe bağlı HSTS.

HTTPS zorunluluğu ters vekil arkasında `TRUSTED_HTTPS=true` ile HSTS eklenir.
"""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

        # JSON/PDF API: varsayılan olarak hiçbir kaynaktan yükleme yok
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        )

        if os.getenv("TRUSTED_HTTPS", "").strip().lower() in ("1", "true", "yes"):
            # Yalnızca TLS sonlandırıcı doğru yapılandırıldığında etkinleştirin
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )

        return response
