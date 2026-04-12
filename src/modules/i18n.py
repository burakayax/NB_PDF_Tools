from __future__ import annotations

import json
import locale
import os
from pathlib import Path

SUPPORTED_LANGUAGES = frozenset({"tr", "en"})
_LOCALES_DIR = Path(__file__).resolve().parent.parent / "locales"
_TRANSLATIONS_CACHE: dict[str, dict] = {}


def _load_locale(lang: str) -> dict:
    if lang not in SUPPORTED_LANGUAGES:
        lang = "en"
    if lang not in _TRANSLATIONS_CACHE:
        path = _LOCALES_DIR / f"{lang}.json"
        if path.is_file():
            raw = json.loads(path.read_text(encoding="utf-8"))
            _TRANSLATIONS_CACHE[lang] = raw if isinstance(raw, dict) else {}
        else:
            _TRANSLATIONS_CACHE[lang] = {}
    return _TRANSLATIONS_CACHE[lang]


def reload_translation_files() -> None:
    """Bellekteki çeviri önbelleğini temizler; diskteki JSON düzenlendikten sonra yeniden yüklemek içindir.
    Aksi halde eski metinler uygulama yeniden başlatılana kadar görünür kalır.
    Çağrı unutulursa dil dosyası değişiklikleri canlı yansımaz."""
    _TRANSLATIONS_CACHE.clear()


def detect_system_language() -> str:
    lang = ""
    try:
        lang = (locale.getdefaultlocale()[0] or "").lower()
    except Exception:
        lang = ""
    return "tr" if lang.startswith("tr") else "en"


def _preferences_path() -> Path:
    appdata_root = Path(os.environ.get("APPDATA") or Path.cwd())
    return appdata_root / "NB PDF PLARTFORM" / "desktop_preferences.json"


class LanguageManager:
    def __init__(self) -> None:
        self._language = self._load_initial()

    def _load_initial(self) -> str:
        path = _preferences_path()
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                language = str(data.get("language") or "").strip().lower()
                if language in SUPPORTED_LANGUAGES:
                    return language
            except Exception:
                pass
        return detect_system_language()

    def get(self) -> str:
        return self._language

    def set(self, language: str) -> None:
        if language not in SUPPORTED_LANGUAGES:
            language = "en"
        self._language = language
        path = _preferences_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"language": self._language}, ensure_ascii=False, indent=2), encoding="utf-8")


_manager = LanguageManager()


def get_language() -> str:
    return _manager.get()


def set_language(language: str) -> None:
    _manager.set(language)


def t(key: str, **kwargs) -> str:
    """
    Noktalı çeviri anahtarını (ör. main.login_title) etkin dil için çözümler.
    Eksik anahtarda İngilizceye, o da yoksa ham anahtar metnine düşer.
    Anahtar sözleşmesi bozulursa arayüzde ham anahtarlar görünebilir.
    """
    parts = key.split(".")

    def lookup(lang_code: str):
        tree = _load_locale(lang_code)
        value: object = tree
        for part in parts:
            if not isinstance(value, dict):
                return None
            value = value.get(part)
        return value

    lang = get_language()
    value = lookup(lang) or lookup("en") or key
    if isinstance(value, str) and kwargs:
        try:
            return value.format(**kwargs)
        except (KeyError, ValueError):
            return value
    return str(value)
