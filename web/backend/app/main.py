"""NB PDF Tools web API giris noktasi."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth_routes import router as auth_router
from app.api.routes import router

app = FastAPI(
    title="NB PDF Tools Web API",
    version="0.1.0",
    description="Masaustu PDF aracinin web arayuzu icin API katmani.",
)

# CORS: virgülle ayrılmış kökenler (ör. https://app.example.com) veya boş = yalnızca localhost/127.0.0.1 her port.
_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(router)
app.include_router(auth_router, prefix="/api")
