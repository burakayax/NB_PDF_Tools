from __future__ import annotations

import base64
import ctypes
from dataclasses import dataclass
import hashlib
import json
import os
import platform
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any, Optional
import winreg


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_uint), ("pbData", ctypes.POINTER(ctypes.c_char))]


class DesktopAuthError(Exception):
    pass


class DesktopNetworkError(DesktopAuthError):
    pass


class DesktopAuthExpiredError(DesktopAuthError):
    pass


class DesktopAccessBlockedError(DesktopAuthError):
    pass


DEFAULT_GUEST_OPERATION_LIMIT = 3


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

    api_base_url = (
        os.environ.get("NB_SAAS_API_BASE_URL")
        or file_data.get("api_base_url")
        or "http://localhost:4000/api"
    ).strip().rstrip("/")
    web_app_url = (
        os.environ.get("NB_WEB_APP_URL")
        or file_data.get("web_app_url")
        or "http://localhost:5173"
    ).strip().rstrip("/")
    register_url = (
        os.environ.get("NB_WEB_REGISTER_URL")
        or file_data.get("register_url")
        or f"{web_app_url}?view=register"
    ).strip()
    upgrade_url = (
        os.environ.get("NB_WEB_UPGRADE_URL")
        or file_data.get("upgrade_url")
        or f"{web_app_url}#pricing"
    ).strip()

    return {
        "api_base_url": api_base_url,
        "web_app_url": web_app_url,
        "register_url": register_url,
        "upgrade_url": upgrade_url,
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
        "NB PDF TOOLS desktop session",
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
        self.session_path = appdata_root / "NB PDF TOOLS" / "desktop_session.json"

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
        self.state_path = appdata_root / "NB PDF TOOLS" / "desktop_guest_usage.json"
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
        self.api_base_url = api_base_url.rstrip("/")
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
            raise DesktopNetworkError(f"Sunucuya bağlanılamadı: {error.reason}") from error
        except json.JSONDecodeError as error:
            raise DesktopAuthError(f"Geçersiz sunucu yanıtı: {error}") from error

    def login(self, email: str, password: str) -> dict[str, Any]:
        response = self._request(
            "POST",
            "/auth/login",
            body={"email": email.strip().lower(), "password": password},
            login_attempt=True,
        )
        if not isinstance(response, dict) or not response.get("accessToken"):
            raise DesktopAuthError("Oturum açma yanıtı beklenen formatta değil.")
        return response

    def validate_license(self, access_token: str) -> dict[str, Any]:
        response = self._request("GET", "/license/validate", access_token=access_token, forbidden_as_blocked=True)
        if not isinstance(response, dict):
            raise DesktopAuthError("Lisans doğrulama yanıtı beklenen formatta değil.")
        return response

    def subscription_status(self, access_token: str) -> dict[str, Any]:
        """Web ile aynı kaynak: sunucu tarihine göre plan ve kalan gün (GET /api/subscription/status)."""
        response = self._request("GET", "/subscription/status", access_token=access_token, forbidden_as_blocked=True)
        if not isinstance(response, dict):
            raise DesktopAuthError("Abonelik durumu yanıtı beklenen formatta değil.")
        return response

    def fetch_profile(self, access_token: str) -> dict[str, Any]:
        response = self._request("GET", "/user/profile", access_token=access_token, forbidden_as_blocked=True)
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
            "/license/authorize",
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

    def submit_contact(self, name: str, email: str, message: str) -> dict[str, Any]:
        response = self._request(
            "POST",
            "/contact",
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


def build_session_payload(access_token: str, user: dict[str, Any], license_info: dict[str, Any]) -> dict[str, Any]:
    return {
        "accessToken": access_token,
        "user": user,
        "license": license_info,
    }


def open_register_page(register_url: str) -> None:
    if not register_url:
        raise DesktopAuthError("Kayıt sayfası adresi yapılandırılmamış.")
    webbrowser.open(register_url)


def open_upgrade_page(upgrade_url: str) -> None:
    if not upgrade_url:
        raise DesktopAuthError("Yukseltme sayfasi adresi yapılandırılmamış.")
    webbrowser.open(upgrade_url)


def get_device_id() -> str:
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            machine_guid, _ = winreg.QueryValueEx(key, "MachineGuid")
    except OSError:
        machine_guid = platform.node() or "unknown-device"

    raw = f"NBPDFTOOLS::{machine_guid}::{platform.system()}::{platform.machine()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
