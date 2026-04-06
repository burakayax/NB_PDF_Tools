"""NB PDF Tools web API giris noktasi."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.auth_routes import router as auth_router
from app.api.routes import router

# Trial abuse reference routes (disabled by default; see app.auth.registration_workflow_example):
# from app.auth.registration_workflow_example import example_router
from app.limiter import limiter, rate_limit_key_func
from app.security.headers_middleware import SecurityHeadersMiddleware

logger = logging.getLogger(__name__)

app = FastAPI(
    title="NB PDF Tools Web API",
    version="0.1.0",
    description="Masaustu PDF aracinin web arayuzu icin API katmani.",
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exception_handler(request: Request, exc: RateLimitExceeded):
    logger.warning(
        "security type=rate_limit_exceeded ip=%s path=%s detail=%s",
        rate_limit_key_func(request),
        request.url.path,
        getattr(exc, "detail", exc),
    )
    return _rate_limit_exceeded_handler(request, exc)


# CORS: virgülle ayrılmış kökenler (ör. https://app.example.com) veya boş = yalnızca localhost/127.0.0.1 her port.
_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-NB-SaaS-Friction", "X-NB-Processing-Tier"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-NB-SaaS-Friction", "X-NB-Processing-Tier"],
    )

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


@app.middleware("http")
async def attach_nb_device_id(request: Request, call_next):
    """Expose X-NB-Device-Id on request.state for trial / abuse hooks (desktop already sends this)."""
    raw = request.headers.get("X-NB-Device-Id") or request.headers.get("x-nb-device-id")
    request.state.nb_device_id = raw.strip() if raw and raw.strip() else None
    return await call_next(request)


app.include_router(router)
app.include_router(auth_router, prefix="/api")
# app.include_router(example_router, prefix="/api")
