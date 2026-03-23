"""
Meta WhatsApp Cloud API ile konuşan backend'inize HTTP üzerinden bağlanır.

Beklenen minimal REST sözleşmesi (path'ler yapılandırılabilir):
- POST {prefix}/sessions  -> { "session_id": "..." } veya { "id": "..." }
- POST {prefix}/sessions/{id}/messages  body: { "text": "..." }
- GET  {prefix}/sessions/{id}/messages?since=<iso veya unix>  -> { "messages": [...] }
- POST {prefix}/sessions/{id}/handoff  (opsiyonel body)

Mesaj öğesi: { "id": "...", "role": "user"|"assistant"|"system", "text": "...", "created_at": ... }
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Optional


class SupportApiError(Exception):
    pass


class SupportApiClient:
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        path_prefix: str = "",
        timeout_seconds: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.path_prefix = (path_prefix or "").rstrip("/")
        if self.path_prefix and not self.path_prefix.startswith("/"):
            self.path_prefix = "/" + self.path_prefix
        self.timeout_seconds = timeout_seconds

    def _url(self, path: str) -> str:
        p = path if path.startswith("/") else f"/{path}"
        return f"{self.base_url}{self.path_prefix}{p}"

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict[str, Any]] = None,
        query: Optional[dict[str, str]] = None,
    ) -> Any:
        url = self._url(path)
        if query:
            from urllib.parse import urlencode

            url = f"{url}?{urlencode(query)}"
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=self._headers(), method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                if not raw.strip():
                    return None
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode("utf-8", errors="replace")
            except Exception:
                detail = str(e)
            raise SupportApiError(f"HTTP {e.code}: {detail}") from e
        except urllib.error.URLError as e:
            raise SupportApiError(f"Bağlantı hatası: {e.reason}") from e
        except json.JSONDecodeError as e:
            raise SupportApiError(f"Geçersiz JSON yanıtı: {e}") from e

    def create_session(self, metadata: Optional[dict[str, Any]] = None) -> str:
        payload = metadata or {}
        data = self._request("POST", "/sessions", body=payload)
        if not isinstance(data, dict):
            raise SupportApiError("Oturum yanıtı beklenen formatta değil.")
        sid = data.get("session_id") or data.get("id") or data.get("sessionId")
        if not sid:
            raise SupportApiError("Oturum kimliği yanıtta bulunamadı.")
        return str(sid)

    def send_message(self, session_id: str, text: str) -> None:
        self._request("POST", f"/sessions/{session_id}/messages", body={"text": text})

    def fetch_messages(self, session_id: str, since: Optional[str] = None) -> list[dict[str, Any]]:
        query: dict[str, str] = {}
        if since:
            query["since"] = since
        data = self._request("GET", f"/sessions/{session_id}/messages", query=query or None)
        if data is None:
            return []
        if not isinstance(data, dict):
            raise SupportApiError("Mesaj listesi yanıtı beklenen formatta değil.")
        msgs = data.get("messages") or data.get("data") or []
        if not isinstance(msgs, list):
            return []
        out: list[dict[str, Any]] = []
        for m in msgs:
            if isinstance(m, dict):
                out.append(m)
        return out

    def request_handoff(self, session_id: str, reason: Optional[str] = None) -> None:
        body: dict[str, Any] = {}
        if reason:
            body["reason"] = reason
        self._request("POST", f"/sessions/{session_id}/handoff", body=body if body else {})
