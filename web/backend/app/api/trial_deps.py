"""
FastAPI helpers: client IP and optional X-NB-Device-Id (desktop sends this header).

Web clients can mirror the desktop behaviour via JS (localStorage UUID + header) or
HttpOnly cookie read server-side — keep UI unchanged; only send the header/cookie.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status


def get_request_client_ip(request: Request) -> str:
    """
    Prefer the left-most X-Forwarded-For hop when present (use only behind a trusted reverse proxy).

    Spoofing risk: if this app is exposed directly to clients, configure your edge to strip
    untrusted X-Forwarded-For or stop reading it.
    """
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        part = xff.split(",")[0].strip()
        if part:
            return part
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def optional_nb_device_id(
    request: Request,
    x_nb_device_id: Annotated[str | None, Header(alias="X-NB-Device-Id")] = None,
) -> str | None:
    if x_nb_device_id and x_nb_device_id.strip():
        return x_nb_device_id.strip()
    return getattr(request.state, "nb_device_id", None)


OptionalNbDeviceId = Annotated[str | None, Depends(optional_nb_device_id)]


def require_nb_device_id(
    device_id: Annotated[str | None, Depends(optional_nb_device_id)],
) -> str:
    """Fail closed when trial / registration logic requires a stable device id."""
    if not device_id or len(device_id.strip()) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-NB-Device-Id header is required for registration.",
        )
    return device_id.strip()


RequiredNbDeviceId = Annotated[str, Depends(require_nb_device_id)]
