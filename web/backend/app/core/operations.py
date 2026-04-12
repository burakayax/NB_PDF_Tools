"""Web katmanının dosya yükleme, geçici dosya ve çıktı adlandırma işlerini yönetir.

Bu dosya arayüz ile PDF motoru arasındaki düşük seviyeli yardımcıları toplar.
İndirme adı, geçici klasör veya ortak hata biçimi değişecekse ilk bakılacak yer burasıdır.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Iterable

from fastapi import BackgroundTasks, HTTPException, UploadFile
from fastapi.responses import FileResponse

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from src import pdf_engine  # noqa: E402


def get_engine():
    """UI'den bağımsız PDF motorunu tek noktadan döndürür."""
    return pdf_engine


def create_workdir(prefix: str = "nbpdf-web-") -> Path:
    """Her istek için ayrı bir geçici çalışma klasörü açar."""
    return Path(tempfile.mkdtemp(prefix=prefix))


async def save_upload(upload: UploadFile, workdir: Path, filename: str | None = None) -> Path:
    """Tarayıcıdan gelen dosyayı diske yazar ve işlem motoruna uygun hale getirir."""
    target_name = filename or upload.filename or "upload.bin"
    target_path = workdir / Path(target_name).name
    with target_path.open("wb") as output:
        shutil.copyfileobj(upload.file, output)
    await upload.close()
    return target_path


def cleanup_path(path: str | Path) -> None:
    """İndirme bittikten sonra geçici dosya veya klasörü siler."""
    target = Path(path)
    if not target.exists():
        return
    if target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
    else:
        try:
            target.unlink()
        except FileNotFoundError:
            pass


def cleanup_and_raise(workdir: Path, error: Exception) -> None:
    """Endpoint hata aldığında geçici klasörü de temizleyip okunur hata döndürür."""
    cleanup_path(workdir)
    if isinstance(error, HTTPException):
        raise error
    detail = str(error)
    if "girilen şifre hatalı:" in detail:
        prefix, filename = detail.rsplit(":", 1)
        detail = f"{prefix}: Dosya adı: {filename.strip()}"
    elif "şifre gerekli:" in detail:
        prefix, filename = detail.rsplit(":", 1)
        detail = f"{prefix}: Dosya adı: {filename.strip()}"
    raise HTTPException(status_code=400, detail=detail) from error


def saas_friction_http_headers(friction: dict[str, Any] | None) -> dict[str, str] | None:
    """Node assert-feature gecikme yanıtı: istemci base64 JSON ile CTA + mesaj alır."""
    if not friction:
        return None
    raw = json.dumps(friction, ensure_ascii=False).encode("utf-8")
    payload = base64.b64encode(raw).decode("ascii")
    return {"X-NB-SaaS-Friction": payload}


def build_pdf_download_headers(
    friction: dict[str, Any] | None,
    *,
    processing_tier: str | None = None,
) -> dict[str, str] | None:
    """İndirme yanıtı: dönüşüm (FREE) + öncelik hattı (premium | standard)."""
    headers: dict[str, str] = {}
    fr = saas_friction_http_headers(friction)
    if fr:
        headers.update(fr)
    if processing_tier:
        headers["X-NB-Processing-Tier"] = processing_tier
    return headers if headers else None


def download_response(
    path: Path,
    filename: str,
    media_type: str,
    background_tasks: BackgroundTasks,
    cleanup_target: Path,
    *,
    saas_friction: dict[str, Any] | None = None,
    processing_tier: str | None = None,
):
    """Tek çıktı dosyasını stream ederken iş bitince geçici klasörü temizler."""
    background_tasks.add_task(cleanup_path, cleanup_target)
    hdrs = build_pdf_download_headers(saas_friction, processing_tier=processing_tier)
    return FileResponse(path=path, filename=filename, media_type=media_type, headers=hdrs)


def parse_pages_text(pages_text: str, max_page: int | None = None) -> list[int]:
    """Masaüstü uygulamadaki mantığı biraz geliştirip aralıkları da destekler."""
    raw = (pages_text or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Lütfen sayfa numarası girin.")

    pages: set[int] = set()
    for chunk in raw.split(","):
        token = chunk.strip()
        if not token:
            continue
        if "-" in token:
            start_raw, end_raw = token.split("-", 1)
            if not start_raw.strip().isdigit() or not end_raw.strip().isdigit():
                raise HTTPException(status_code=400, detail=f"Geçersiz sayfa aralığı: {token}")
            start = int(start_raw)
            end = int(end_raw)
            if start > end:
                raise HTTPException(status_code=400, detail=f"Başlangıç bitişten büyük olamaz: {token}")
            pages.update(range(start, end + 1))
        else:
            if not token.isdigit():
                raise HTTPException(status_code=400, detail=f"Geçersiz sayfa numarası: {token}")
            pages.add(int(token))

    if not pages:
        raise HTTPException(status_code=400, detail="İşlenecek geçerli sayfa bulunamadı.")
    ordered = sorted(pages)
    if max_page is not None and max_page > 0:
        too_high = [p for p in ordered if p > max_page]
        if too_high:
            raise HTTPException(
                status_code=400,
                detail=f"PDF yalnızca {max_page} sayfa içeriyor; geçersiz: {', '.join(str(p) for p in too_high[:5])}"
                + (" …" if len(too_high) > 5 else ""),
            )
    return ordered


def parse_merge_passwords(raw_text: str, uploaded_files: Iterable[UploadFile]) -> dict[str, str]:
    """Birleştirme ekranindaki satir bazli parola metnini dosya adina gore cozer."""
    password_map: dict[str, str] = {}
    raw_text = (raw_text or "").strip()
    if raw_text:
        for line in raw_text.splitlines():
            line = line.strip()
            if not line:
                continue
            if "=" not in line:
                raise HTTPException(
                    status_code=400,
                    detail="Birleştirme parola listesinde her satir 'dosya_adi=parola' biciminde olmali.",
                )
            key, value = line.split("=", 1)
            password_map[key.strip()] = value.strip()

    resolved: dict[str, str] = {}
    for upload in uploaded_files:
        password = password_map.get(upload.filename or "", "").strip()
        if password:
            resolved[upload.filename or ""] = password
    return resolved


def create_zip_archive(output_zip: Path, files: list[Path]) -> Path:
    """Ayri kaydet modunda uretilen dosyalari tek indirme icin zip'e toplar."""
    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in files:
            archive.write(file_path, arcname=file_path.name)
    return output_zip


def get_safe_stem(filename: str) -> str:
    """Kullanici dosya adini indirilebilir cikti adlarinda kullanmak icin sadeleştirir."""
    stem = Path(filename or "dosya").stem.strip() or "dosya"
    invalid = '<>:"/\\|?*'
    return "".join("_" if ch in invalid else ch for ch in stem).strip()


def format_split_single_filename(source_name: str, pages: list[int]) -> str:
    """Tek PDF cikti adini secilen sayfalari acikca gosterecek sekilde uretir."""
    stem = get_safe_stem(source_name)
    page_label = "-".join(str(page) for page in pages)
    label_word = "Sayfa" if len(pages) == 1 else "Sayfalar"
    return f"{stem}({page_label}. {label_word}).pdf"


def format_split_page_filename(source_name: str, page_number: int) -> str:
    """Ayrı kaydet modundaki her tekil sayfa icin ad uretir."""
    stem = get_safe_stem(source_name)
    return f"{stem}({page_number}. Sayfa).pdf"


def format_split_zip_filename(source_name: str, pages: list[int]) -> str:
    """Ayrı sayfalar zip dosyası için seçilen sayfaları da içeren ad üretir."""
    stem = get_safe_stem(source_name)
    page_label = "-".join(str(page) for page in pages)
    label_word = "Sayfa" if len(pages) == 1 else "Sayfalar"
    return f"{stem}({page_label}. {label_word}).zip"


def format_derived_filename(source_name: str, suffix: str, extension: str) -> str:
    """Kaynak dosya adına göre okunur bir çıktı adı üretir."""
    stem = get_safe_stem(source_name)
    return f"{stem}({suffix}).{extension.lstrip('.')}"


def operation_capabilities() -> dict:
    """Web arayuzunun hangi islemleri nasil gosterecegini belirler."""
    return {
        "brand": "NB PDF TOOLS",
        "supports": {
            "merge": True,
            "split": True,
            "pdf_to_word": True,
            "word_to_pdf": True,
            "excel_to_pdf": True,
            "pdf_to_excel": True,
            "compress": True,
            "encrypt": True,
        },
        "notes": [
            "Word -> PDF ve Excel -> PDF en iyi sonucu Windows ve Office kurulu ortamlarda verir.",
            "PDF -> Word web sürümünde yalnızca düzenlenebilir dönüşüm kullanılır; görsele çeviren yedek akış yoktur.",
            "Büyük dosyalarda işlem süresi masaüstü sürüme göre daha uzun olabilir.",
        ],
        "environment": {
            "platform": sys.platform,
            "tesseract_cmd": getattr(pdf_engine.pytesseract.pytesseract, "tesseract_cmd", ""),
            "poppler_path": str(getattr(pdf_engine, "poppler_bin_path", "")),
        },
    }


def parse_json_text(raw_text: str | None) -> dict:
    """Form-data icindeki JSON alanlarini guvenli sekilde cozer."""
    if not raw_text:
        return {}
    try:
        value = json.loads(raw_text)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Gecersiz JSON verisi: {exc}") from exc
    raise HTTPException(status_code=400, detail="JSON alani nesne biciminde olmali.")
