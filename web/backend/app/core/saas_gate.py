"""Node SaaS API (plan, kota, süre) ile PDF işlemlerini sunucu tarafında doğrular."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def _friction_from_assert_body(data: dict[str, Any]) -> dict[str, Any] | None:
    """Node 200 gövdesinden PDF API / istemciye iletilecek dönüşüm alanları."""
    if not data.get("throttleApplied"):
        return None
    out: dict[str, Any] = {
        "message": data.get("message"),
        "upgradeCta": data.get("upgradeCta"),
        "conversionTracking": data.get("conversionTracking"),
        "delayMs": data.get("delayMs"),
        "usageSummary": data.get("usageSummary"),
    }
    return out


def saas_api_base() -> str:
    return os.getenv("NB_SAAS_API_BASE", "http://127.0.0.1:4000").rstrip("/")


def _detail_from_response(r: httpx.Response) -> str:
    try:
        data = r.json()
        if isinstance(data, dict) and data.get("message"):
            return str(data["message"])
    except Exception:
        pass
    text = (r.text or "").strip()
    return text or getattr(r, "reason_phrase", None) or "SaaS isteği başarısız."


async def saas_session_ok(token: str) -> None:
    """inspect-pdf öncesi: geçerli oturum ve abonelik süresi (web ile aynı /subscription/status)."""
    base = saas_api_base()
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{base}/api/subscription/status",
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.status_code == 200:
            return
        if r.status_code == 401:
            raise HTTPException(status_code=401, detail=_detail_from_response(r))
        raise HTTPException(
            status_code=502,
            detail=f"Abonelik durumu alınamadı: {_detail_from_response(r)}",
        )


async def saas_assert_feature(
    token: str,
    feature_key: str,
    *,
    total_size_bytes: int | None = None,
) -> tuple[bool, dict[str, Any] | None, str]:
    """
    İşlem öncesi: plan + günlük kota (Node ile tek kaynak).
    Sunucu gecikmesi (ücretsiz kota aşımı) burada uygulanır.
    Dönüş: (reduced_output_quality, friction_payload | None, processing_tier).
    processing_tier: Node `X-NB-Processing-Tier` — premium | standard.
    """
    base = saas_api_base()
    body: dict = {"featureKey": feature_key}
    if total_size_bytes is not None and total_size_bytes >= 0:
        body["totalSizeBytes"] = int(total_size_bytes)

    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(
            f"{base}/api/subscription/assert-feature",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
        if r.status_code == 204:
            tier = (r.headers.get("X-NB-Processing-Tier") or "standard").strip() or "standard"
            return False, None, tier
        if r.status_code == 401:
            raise HTTPException(status_code=401, detail=_detail_from_response(r))
        if r.status_code == 403:
            raise HTTPException(status_code=403, detail=_detail_from_response(r))
        if r.status_code == 200:
            tier = (r.headers.get("X-NB-Processing-Tier") or "standard").strip() or "standard"
            try:
                data = r.json()
                if isinstance(data, dict):
                    reduced = bool(data.get("reducedOutputQuality"))
                    friction = _friction_from_assert_body(data)
                    return reduced, friction, tier
            except Exception:
                logger.debug("assert-feature 200 body parse skipped", exc_info=True)
            return False, None, tier
        raise HTTPException(
            status_code=502,
            detail=f"Plan doğrulaması başarısız: {_detail_from_response(r)}",
        )


async def saas_record_usage(token: str, feature_key: str) -> None:
    """Başarılı işlem sonrası kota (Node tek yazar)."""
    base = saas_api_base()
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{base}/api/subscription/record-usage",
            headers={"Authorization": f"Bearer {token}"},
            json={"featureKey": feature_key},
        )
        if r.status_code == 200:
            return
        logger.warning(
            "saas record-usage failed: %s %s",
            r.status_code,
            _detail_from_response(r),
        )


def saas_record_usage_sync(token: str, feature_key: str) -> None:
    """Arka plan iş parçacığında (merge worker) kota kaydı."""
    base = saas_api_base()
    try:
        with httpx.Client(timeout=60.0) as client:
            r = client.post(
                f"{base}/api/subscription/record-usage",
                headers={"Authorization": f"Bearer {token}"},
                json={"featureKey": feature_key},
            )
            if r.status_code != 200:
                logger.warning("saas record-usage sync failed: %s", r.status_code)
    except Exception as exc:
        logger.warning("saas record-usage sync error: %s", exc)
