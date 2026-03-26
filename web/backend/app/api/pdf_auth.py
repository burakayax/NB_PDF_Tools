"""PDF multipart isteklerinde Bearer veya form access_token."""

from __future__ import annotations

from typing import Annotated

from fastapi import Form, Header, HTTPException


def extract_pdf_access_token(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    access_token: Annotated[str, Form()] = "",
) -> str:
    if authorization and authorization.startswith("Bearer "):
        t = authorization[7:].strip()
        if t:
            return t
    if access_token and str(access_token).strip():
        return str(access_token).strip()
    raise HTTPException(
        status_code=401,
        detail="Oturum gerekli. Authorization: Bearer veya access_token form alanı gerekli.",
    )


def extract_bearer_header_only(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> str:
    if authorization and authorization.startswith("Bearer "):
        t = authorization[7:].strip()
        if t:
            return t
    raise HTTPException(status_code=401, detail="Authorization: Bearer gerekli.")
