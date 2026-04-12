from __future__ import annotations

import base64
import ctypes
from dataclasses import dataclass
import json
import os
import threading
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Optional

from modules.email_identity_normalize import normalize_email_for_storage
from modules.desktop_security_runtime import (
    AUTH_CHANGE_PASSWORD,
    AUTH_LOGIN,
    AUTH_PROFILE,
    CONTACT,
    LICENSE_AUTHORIZE,
    LICENSE_CHECK,
    PAYMENT_CREATE,
    SUBSCRIPTION_CURRENT,
    SUBSCRIPTION_PLANS,
    SUBSCRIPTION_STATUS,
    USER_PROFILE,
)
from modules.device_identity import get_device_id


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_uint), ("pbData", ctypes.POINTER(ctypes.c_char))]


class DesktopAuthError(Exception):
    pass


class DesktopNetworkError(DesktopAuthError):
    pass


def _is_connection_refused(url_error: urllib.error.URLError) -> bool:
    """Windows 10061 / Linux 111 — hedef portta dinleyen süreç yok."""
    reason = url_error.reason
    if isinstance(reason, OSError):
        errno = getattr(reason, "winerror", None) or getattr(reason, "errno", None)
        if errno in (10061, 111):
            return True
    text = str(reason).lower()
    return (
        "10061" in text
        or "actively refused" in text
        or "connection refused" in text
        or "reddettiğinden" in text
        or "bağlantı kurulamadı" in text
    )


def _format_network_error(url_error: urllib.error.URLError) -> str:
    detail = str(url_error.reason)
    if _is_connection_refused(url_error):
        return (
            "Kimlik API’ye ulaşılamıyor (bağlantı reddedildi / WinError 10061). "
            "Bu adreste sunucu dinlemiyor olabilir.\n\n"
            "• Proje kökünde `npm run dev` çalıştırın veya ayrı terminalde `cd web\\api` → `npm run dev` (port 4000).\n"
            "• `desktop_auth_config.json` içinde `api_base_url` doğru mu kontrol edin (örn. http://127.0.0.1:4000/api).\n"
            "• Uzak sunucu kullanıyorsanız güvenlik duvarı ve VPN’i kontrol edin.\n\n"
            f"(Teknik: {detail})"
        )
    return f"Sunucuya bağlanılamadı: {detail}"


class DesktopAuthExpiredError(DesktopAuthError):
    pass


class DesktopAccessBlockedError(DesktopAuthError):
    pass


DEFAULT_GUEST_OPERATION_LIMIT = 3


def normalize_api_base_url(url: str) -> str:
    """
    Kimlik API kökü: .../api ile bitmeli (örn. http://127.0.0.1:4000/api).
    Sadece host:port verilmişse /api eklenir; aksi halde /auth/login yanlış yola gider.
    """
    u = (url or "").strip().rstrip("/")
    if not u:
        return "http://127.0.0.1:4000/api"
    if u.endswith("/api"):
        return u
    return f"{u}/api"


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _load_json_file(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as file_handle:
        data = json.load(file_handle)
    return data if isinstance(data, dict) else {}


def load_desktop_auth_config() -> dict[str, Any]:
    file_data: dict[str, Any] = {}
    cwd_file = Path.cwd() / "desktop_auth_config.json"
    root_file = _project_root() / "desktop_auth_config.json"
    if cwd_file.is_file():
        file_data.update(_load_json_file(cwd_file))
    elif root_file.is_file():
        file_data.update(_load_json_file(root_file))

    api_base_url = normalize_api_base_url(
        str(
            os.environ.get("NB_SAAS_API_BASE_URL")
            or file_data.get("api_base_url")
            or "http://127.0.0.1:4000/api",
        ),
    )
    web_app_url = (
        os.environ.get("NB_WEB_APP_URL")
        or file_data.get("web_app_url")
        or "http://localhost:5173"
    ).strip().rstrip("/")
    register_url = (
        os.environ.get("NB_WEB_REGISTER_URL")
        or file_data.get("register_url")
        or f"{web_app_url}/register"
    ).strip()
    upgrade_url = (
        os.environ.get("NB_WEB_UPGRADE_URL")
        or file_data.get("upgrade_url")
        or f"{web_app_url}/workspace"
    ).strip()
    update_manifest_url = (
        os.environ.get("NB_UPDATE_MANIFEST_URL") or str(file_data.get("update_manifest_url") or "")
    ).strip()

    return {
        "api_base_url": api_base_url,
        "web_app_url": web_app_url,
        "register_url": register_url,
        "upgrade_url": upgrade_url,
        "update_manifest_url": update_manifest_url,
    }


def _make_blob(data: bytes) -> _DataBlob:
    buffer = ctypes.create_string_buffer(data)
    return _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))


def _protect_bytes(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    in_blob = _make_blob(data)
    out_blob = _DataBlob()
    if not crypt32.CryptProtectData(
        ctypes.byref(in_blob),
        "NB PDF PLARTFORM desktop session",
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    ):
        raise DesktopAuthError("Desktop session could not be secured on this system.")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _unprotect_bytes(data: bytes) -> bytes:
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    in_blob = _make_blob(data)
    out_blob = _DataBlob()
    if not crypt32.CryptUnprotectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    ):
        raise DesktopAuthError("Saved desktop session could not be unlocked.")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


class DesktopSessionStore:
    def __init__(self):
        appdata_root = Path(os.environ.get("APPDATA") or _project_root())
        self.session_path = appdata_root / "NB PDF PLARTFORM" / "desktop_session.json"

    def load(self) -> Optional[dict[str, Any]]:
        if not self.session_path.is_file():
            return None
        try:
            payload = json.loads(self.session_path.read_text(encoding="utf-8"))
            encoded = payload.get("payload")
            if not encoded:
                return None
            decrypted = _unprotect_bytes(base64.b64decode(encoded))
            data = json.loads(decrypted.decode("utf-8"))
            return data if isinstance(data, dict) else None
        except Exception:
            self.clear()
            return None

    def save(self, session_data: dict[str, Any]) -> None:
        self.session_path.parent.mkdir(parents=True, exist_ok=True)
        raw = json.dumps(session_data, ensure_ascii=False).encode("utf-8")
        encrypted = _protect_bytes(raw)
        payload = {
            "version": 1,
            "payload": base64.b64encode(encrypted).decode("ascii"),
        }
        self.session_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def clear(self) -> None:
        try:
            if self.session_path.is_file():
                self.session_path.unlink()
        except Exception:
            pass


@dataclass
class DesktopGuestState:
    mode: str = "guest"
    guest_operations_used: int = 0
    guest_limit: int = DEFAULT_GUEST_OPERATION_LIMIT
    guest_locked: bool = False

    @property
    def remaining_operations(self) -> int:
        return max(0, self.guest_limit - self.guest_operations_used)

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "guestOperationsUsed": self.guest_operations_used,
            "guestLimit": self.guest_limit,
            "guestLocked": self.guest_locked,
            "remainingOperations": self.remaining_operations,
        }

    @classmethod
    def from_dict(cls, payload: Optional[dict[str, Any]], default_limit: int = DEFAULT_GUEST_OPERATION_LIMIT) -> "DesktopGuestState":
        if not isinstance(payload, dict):
            payload = {}
        guest_limit = payload.get("guestLimit", default_limit)
        try:
            guest_limit = max(1, int(guest_limit))
        except (TypeError, ValueError):
            guest_limit = default_limit
        guest_operations_used = payload.get("guestOperationsUsed", 0)
        try:
            guest_operations_used = max(0, int(guest_operations_used))
        except (TypeError, ValueError):
            guest_operations_used = 0
        guest_operations_used = min(guest_operations_used, guest_limit)
        guest_locked = bool(payload.get("guestLocked")) or guest_operations_used >= guest_limit
        mode = str(payload.get("mode") or "guest").strip().lower() or "guest"
        return cls(
            mode="guest" if mode != "auth" else "auth",
            guest_operations_used=guest_operations_used,
            guest_limit=guest_limit,
            guest_locked=guest_locked,
        )


class GuestUsageStore:
    def __init__(self, device_id: Optional[str] = None, default_limit: int = DEFAULT_GUEST_OPERATION_LIMIT):
        appdata_root = Path(os.environ.get("APPDATA") or _project_root())
        self.state_path = appdata_root / "NB PDF PLARTFORM" / "desktop_guest_usage.json"
        self.device_id = device_id or ""
        self.default_limit = default_limit

    def _default_state(self) -> DesktopGuestState:
        return DesktopGuestState(guest_limit=self.default_limit)

    def load(self) -> DesktopGuestState:
        if not self.state_path.is_file():
            return self._default_state()
        try:
            payload = json.loads(self.state_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                return self._default_state()
            saved_device_id = str(payload.get("deviceId") or "").strip()
            if self.device_id and saved_device_id and saved_device_id != self.device_id:
                return self._default_state()
            return DesktopGuestState.from_dict(payload.get("state"), default_limit=self.default_limit)
        except Exception:
            self.clear()
            return self._default_state()

    def save(self, state: DesktopGuestState) -> DesktopGuestState:
        state = DesktopGuestState.from_dict(state.to_dict(), default_limit=self.default_limit)
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "deviceId": self.device_id,
            "state": state.to_dict(),
        }
        self.state_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return state

    def clear(self) -> None:
        try:
            if self.state_path.is_file():
                self.state_path.unlink()
        except Exception:
            pass

    def record_operation(self) -> DesktopGuestState:
        state = self.load()
        if state.guest_locked or state.guest_operations_used >= state.guest_limit:
            state.guest_locked = True
            return self.save(state)
        state.guest_operations_used += 1
        state.guest_locked = state.guest_operations_used >= state.guest_limit
        return self.save(state)


class DesktopAuthClient:
    def __init__(self, api_base_url: str, device_id: str, timeout_seconds: float = 30.0):
        self.api_base_url = normalize_api_base_url(api_base_url).rstrip("/")
        self.device_id = device_id
        self.timeout_seconds = timeout_seconds

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[dict[str, Any]] = None,
        access_token: Optional[str] = None,
        forbidden_as_blocked: bool = False,
        *,
        login_attempt: bool = False,
        public_origin: bool = False,
    ) -> Any:
        base = self.api_base_url.rstrip("/")
        if public_origin and base.endswith("/api"):
            base = base[:-4]
        url = f"{base}{path if path.startswith('/') else '/' + path}"
        headers = {
            "Accept": "application/json",
            "X-NB-Client-Type": "desktop",
            "X-NB-Device-Id": self.device_id,
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        request_data = None
        if body is not None:
            request_data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(url, data=request_data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8", errors="replace")
                if not raw.strip():
                    return None
                return json.loads(raw)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(detail)
                message = payload.get("message") or detail
            except Exception:
                message = detail or str(error)
            if login_attempt:
                print(f"[desktop-auth] POST /auth/login -> HTTP {error.code}: {message}")
            if error.code == 401:
                if login_attempt:
                    raise DesktopAuthError(message or "Invalid email or password.") from error
                raise DesktopAuthExpiredError(message or "Oturum süresi doldu. Lütfen tekrar giriş yapın.") from error
            if error.code == 403 and forbidden_as_blocked:
                raise DesktopAccessBlockedError(message or "Bu cihaz için erişim engellendi.") from error
            raise DesktopAuthError(message) from error
        except urllib.error.URLError as error:
            raise DesktopNetworkError(_format_network_error(error)) from error
        except json.JSONDecodeError as error:
            raise DesktopAuthError(f"Geçersiz sunucu yanıtı: {error}") from error

    def login(self, email: str, password: str) -> dict[str, Any]:
        try:
            normalized_email = normalize_email_for_storage(email)
        except ValueError:
            normalized_email = email.strip().lower()
        response = self._request(
            "POST",
            AUTH_LOGIN,
            body={"email": normalized_email, "password": password},
            login_attempt=True,
        )
        if not isinstance(response, dict) or not response.get("accessToken"):
            raise DesktopAuthError("Oturum açma yanıtı beklenen formatta değil.")
        return response

    def check_license(self, access_token: str) -> dict[str, Any]:
        """GET /api/license/check — required desktop gate; device header enforced server-side."""
        response = self._request("GET", LICENSE_CHECK, access_token=access_token, forbidden_as_blocked=True)
        if not isinstance(response, dict):
            raise DesktopAuthError("Lisans doğrulama yanıtı beklenen formatta değil.")
        return response

    def validate_license(self, access_token: str) -> dict[str, Any]:
        """Alias for check_license (backward compatibility)."""
        return self.check_license(access_token)

    def subscription_status(self, access_token: str) -> dict[str, Any]:
        """Web ile aynı kaynak: sunucu tarihine göre plan ve kalan gün (GET /api/subscription/status)."""
        response = self._request("GET", SUBSCRIPTION_STATUS, access_token=access_token, forbidden_as_blocked=True)
        if not isinstance(response, dict):
            raise DesktopAuthError("Abonelik durumu yanıtı beklenen formatta değil.")
        return response

    def fetch_subscription_plans(self) -> list[dict[str, Any]]:
        """GET /api/subscription/plans — web ile aynı plan listesi (JWT gerekmez)."""
        response = self._request("GET", SUBSCRIPTION_PLANS, access_token=None, forbidden_as_blocked=False)
        if not isinstance(response, dict) or not isinstance(response.get("plans"), list):
            raise DesktopAuthError("Plan listesi beklenen formatta değil.")
        return response["plans"]

    def fetch_subscription_current(self, access_token: str) -> dict[str, Any]:
        """GET /api/subscription/current — web dashboard ile aynı özet (günlük kullanım dahil)."""
        response = self._request("GET", SUBSCRIPTION_CURRENT, access_token=access_token, forbidden_as_blocked=True)
        if not isinstance(response, dict):
            raise DesktopAuthError("Abonelik özeti beklenen formatta değil.")
        return response

    def update_profile(self, access_token: str, first_name: str, last_name: str) -> dict[str, Any]:
        response = self._request(
            "PATCH",
            AUTH_PROFILE,
            body={"firstName": first_name.strip(), "lastName": last_name.strip()},
            access_token=access_token,
        )
        if not isinstance(response, dict) or not isinstance(response.get("user"), dict):
            raise DesktopAuthError("Profil güncelleme yanıtı beklenen formatta değil.")
        return response["user"]

    def change_password(self, access_token: str, current_password: str, new_password: str) -> None:
        response = self._request(
            "POST",
            AUTH_CHANGE_PASSWORD,
            body={"current_password": current_password, "new_password": new_password},
            access_token=access_token,
        )
        if response is not None and not isinstance(response, dict):
            raise DesktopAuthError("Şifre değişikliği yanıtı beklenen formatta değil.")

    def fetch_profile(self, access_token: str) -> dict[str, Any]:
        response = self._request("GET", USER_PROFILE, access_token=access_token, forbidden_as_blocked=True)
        if not isinstance(response, dict) or not isinstance(response.get("user"), dict):
            raise DesktopAuthError("Profil yanıtı beklenen formatta değil.")
        return response["user"]

    def authorize_operation(self, access_token: str, feature_key: str, file_paths: list[str]) -> dict[str, Any]:
        total_size = 0
        for path in file_paths:
            try:
                if path and os.path.isfile(path):
                    total_size += os.path.getsize(path)
            except OSError:
                continue

        response = self._request(
            "POST",
            LICENSE_AUTHORIZE,
            body={
                "featureKey": feature_key,
                "fileCount": max(1, len(file_paths)),
                "totalSizeBytes": max(0, total_size),
            },
            access_token=access_token,
        )
        if not isinstance(response, dict):
            raise DesktopAuthError("Lisans yetkilendirme yanıtı beklenen formatta değil.")
        return response

    def create_payment_checkout(self, access_token: str, plan: str) -> dict[str, Any]:
        """iyzico ödeme oturumu (web ile aynı POST /api/payment/create)."""
        plan_key = plan.strip().upper()
        if plan_key not in ("PRO", "BUSINESS"):
            raise DesktopAuthError("Plan PRO veya BUSINESS olmalıdır.")
        response = self._request(
            "POST",
            PAYMENT_CREATE,
            body={"plan": plan_key},
            access_token=access_token,
        )
        if not isinstance(response, dict):
            raise DesktopAuthError("Ödeme oturumu yanıtı beklenen formatta değil.")
        return response

    def submit_contact(self, name: str, email: str, message: str) -> dict[str, Any]:
        response = self._request(
            "POST",
            CONTACT,
            body={
                "name": name.strip(),
                "email": email.strip().lower(),
                "message": message.strip(),
                "website": "",
            },
            public_origin=True,
        )
        if not isinstance(response, dict):
            raise DesktopAuthError("İletişim yanıtı beklenen formatta değil.")
        return response


def build_session_payload(access_token: str, user: dict[str, Any], license_info: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Persist only the access token and user profile snapshot on disk.

    License, plan, and usage are never stored for trust: after every launch the app must call
    GET /api/subscription/status and GET /api/license/check with the token. The ``license_info``
    argument is accepted for call-site compatibility but is not written to storage.
    """
    return {
        "accessToken": access_token,
        "user": user,
    }


def build_google_oauth_start_url(api_base_url: str, lang: str, desktop_port: int) -> str:
    """Tarayıcıda açılacak GET /api/auth/google?lang=&desktop_port= (callback 127.0.0.1:port/oauth?token=)."""
    base = normalize_api_base_url(api_base_url).rstrip("/")
    q = urllib.parse.urlencode({"lang": lang, "desktop_port": str(int(desktop_port))})
    return f"{base}/auth/google?{q}"


def capture_google_oauth_token(api_base_url: str, lang: str, timeout_seconds: float = 300.0) -> Optional[str]:
    """
    Yerel HTTP sunucusu açar, Google OAuth tamamlanınca sunucunun yönlendirdiği token'ı alır.
    Kullanıcı tarayıcıda Google ile giriş yapar; callback http://127.0.0.1:<port>/oauth?token=... adresine döner.
    """
    token_holder: dict[str, Optional[str]] = {"token": None}
    done = threading.Event()

    class _OAuthHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != "/oauth":
                self.send_error(404)
                return
            qs = urllib.parse.parse_qs(parsed.query)
            tok = (qs.get("token") or [None])[0]
            if tok:
                token_holder["token"] = tok
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            page = (
                "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>NB PDF PLARTFORM</title></head>"
                "<body style=\"font-family:system-ui,sans-serif;padding:2rem;text-align:center;background:#0f172a;color:#e2e8f0;\">"
                "<p>Giriş tamamlandı. Bu sekmeyi kapatabilirsiniz.</p>"
                "<p style=\"color:#94a3b8;font-size:14px;\">Sign-in complete. You may close this tab.</p>"
                "</body></html>"
            )
            self.wfile.write(page.encode("utf-8"))
            done.set()

        def log_message(self, _format: str, *_args: object) -> None:
            return

    server = HTTPServer(("127.0.0.1", 0), _OAuthHandler)
    port = int(server.server_address[1])
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        start_url = build_google_oauth_start_url(api_base_url, lang, port)
        webbrowser.open(start_url)
        if not done.wait(timeout=timeout_seconds):
            return None
        return token_holder["token"]
    finally:
        try:
            server.shutdown()
        except Exception:
            pass
        try:
            server.server_close()
        except Exception:
            pass


def open_register_page(register_url: str) -> None:
    if not register_url:
        raise DesktopAuthError("Kayıt sayfası adresi yapılandırılmamış.")
    webbrowser.open(register_url)


def open_upgrade_page(upgrade_url: str) -> None:
    if not upgrade_url:
        raise DesktopAuthError("Yukseltme sayfasi adresi yapılandırılmamış.")
    webbrowser.open(upgrade_url)


def open_payment_checkout_in_browser(checkout_result: dict[str, Any]) -> None:
    """iyzico dönüşü: doğrudan ödeme URL'si veya gömülü form HTML."""
    url = checkout_result.get("paymentPageUrl")
    if isinstance(url, str) and url.strip():
        webbrowser.open(url.strip())
        return
    html = checkout_result.get("checkoutFormContent")
    if isinstance(html, str) and html.strip():
        fd, path = tempfile.mkstemp(suffix=".html", prefix="nbpdf-iyzico-", text=False)
        try:
            os.write(fd, html.encode("utf-8"))
        finally:
            os.close(fd)
        webbrowser.open(Path(path).as_uri())
        return
    raise DesktopAuthError("Ödeme sayfası (URL veya form) sunucudan gelmedi. iyzico anahtarlarını kontrol edin.")
