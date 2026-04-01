"""Tarayıcıdan gelen istekleri PDF motoruna bağlayan web API rotaları.

Plan ve kota doğrulaması Node SaaS API üzerinden yapılır; istemci yalnızca UI.
"""

from __future__ import annotations

from typing import Annotated

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.pdf_auth import extract_bearer_header_only, extract_pdf_access_token
from app.core.operations import (
    cleanup_and_raise,
    create_workdir,
    create_zip_archive,
    download_response,
    format_split_page_filename,
    format_split_single_filename,
    format_split_zip_filename,
    format_derived_filename,
    get_engine,
    operation_capabilities,
    parse_pages_text,
    save_upload,
)
from app.core.jobs import cleanup_job, create_merge_job, get_job_download, get_job_status
from app.core.saas_gate import saas_assert_feature, saas_record_usage, saas_session_ok
from app.limiter import limiter

router = APIRouter(prefix="/api", tags=["nb-pdf-tools"])
engine = get_engine()


@router.get("/health")
@limiter.exempt
def health():
    return {"status": "ok", "service": "nb-pdf-tools-web"}


@router.get("/capabilities")
def capabilities():
    return operation_capabilities()


@router.post("/merge")
async def merge_pdfs(
    token: Annotated[str, Depends(extract_pdf_access_token)],
    files: list[UploadFile] = File(...),
    passwords_json: str = Form(default="{}"),
):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Birleştirme için en az iki PDF seçin.")

    workdir = create_workdir()
    try:
        saved_paths: list[Path] = []
        for idx, upload in enumerate(files):
            orig_name = Path(upload.filename or "upload.pdf").name
            unique_name = f"{idx:04d}__{orig_name}"
            saved = await save_upload(upload, workdir, filename=unique_name)
            saved_paths.append(saved)

        total_bytes = sum(p.stat().st_size for p in saved_paths if p.is_file())
        await saas_assert_feature(token, "merge", total_size_bytes=total_bytes)

        passwords: dict[str, str] = {}
        if passwords_json.strip():
            import json

            resolved = json.loads(passwords_json)
            if isinstance(resolved, list):
                for i, saved in enumerate(saved_paths):
                    if i < len(resolved) and str(resolved[i] or "").strip():
                        passwords[str(saved)] = str(resolved[i]).strip()
            elif isinstance(resolved, dict):
                for saved in saved_paths:
                    name = saved.name
                    orig_suffix = name.split("__", 1)[-1] if "__" in name else name
                    password = str(resolved.get(name, "") or resolved.get(orig_suffix, "") or "").strip()
                    if not password:
                        for key, val in resolved.items():
                            key_name = Path(str(key)).name
                            if key_name == name or str(key) == name or key_name == orig_suffix or str(key) == orig_suffix:
                                password = str(val or "").strip()
                                break
                    if password:
                        passwords[str(saved)] = password

        output_name = "birleştirilmiş.pdf"
        job_id = create_merge_job(saved_paths, passwords, workdir, output_name, saas_token=token)
        return {"job_id": job_id}
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.get("/jobs/{job_id}")
def job_status(job_id: str, _token: Annotated[str, Depends(extract_bearer_header_only)]):
    return get_job_status(job_id)


@router.get("/jobs/{job_id}/download")
def download_job_output(
    job_id: str,
    background_tasks: BackgroundTasks,
    _token: Annotated[str, Depends(extract_bearer_header_only)],
):
    output_path, output_name, _workdir = get_job_download(job_id)
    background_tasks.add_task(cleanup_job, job_id)
    return FileResponse(
        path=str(output_path),
        filename=output_name,
        media_type="application/pdf",
    )


@router.post("/inspect-pdf")
async def inspect_pdf(
    token: Annotated[str, Depends(extract_pdf_access_token)],
    file: UploadFile = File(...),
    password: str = Form(default=""),
):
    await saas_session_ok(token)

    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        encrypted = engine.is_pdf_encrypted(str(saved_file))
        pwd = password.strip() or None
        page_count = None
        inspect_error = None
        if encrypted and not pwd:
            pass
        else:
            try:
                page_count = engine.get_num_pages(str(saved_file), password=pwd)
            except Exception as exc:
                page_count = None
                inspect_error = str(exc)
        return {
            "filename": file.filename,
            "encrypted": encrypted,
            "page_count": page_count,
            "inspect_error": inspect_error,
        }
    except Exception as error:
        cleanup_and_raise(workdir, error)
    finally:
        if workdir.exists():
            from app.core.operations import cleanup_path

            cleanup_path(workdir)


@router.post("/split")
async def split_pdf(
    background_tasks: BackgroundTasks,
    token: Annotated[str, Depends(extract_pdf_access_token)],
    file: UploadFile = File(...),
    pages_text: str = Form(...),
    mode: str = Form(default="single"),
    password: str = Form(default=""),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        await saas_assert_feature(token, "split", total_size_bytes=saved_file.stat().st_size)
        password = password.strip() or None
        if engine.is_pdf_encrypted(str(saved_file)) and not password:
            raise HTTPException(status_code=400, detail="Şifreli PDF için kaynak parolası gerekli.")
        max_pages = engine.get_num_pages(str(saved_file), password=password)
        pages = parse_pages_text(pages_text, max_page=max_pages)

        if mode == "single":
            output_name = format_split_single_filename(file.filename or saved_file.name, pages)
            output_path = workdir / output_name
            engine.extract_pages(str(saved_file), pages, str(output_path), password=password)
            await saas_record_usage(token, "split")
            return download_response(output_path, output_path.name, "application/pdf", background_tasks, workdir)

        output_folder = workdir / "separate-pages"
        output_folder.mkdir(parents=True, exist_ok=True)
        generated_paths = engine.extract_pages_separate(str(saved_file), pages, str(output_folder), password=password)
        renamed_paths = []
        for page_number, raw_path in zip(pages, generated_paths):
            current_path = Path(raw_path)
            renamed = current_path.with_name(format_split_page_filename(file.filename or saved_file.name, page_number))
            current_path.replace(renamed)
            renamed_paths.append(renamed)
        zip_name = format_split_zip_filename(file.filename or saved_file.name, pages)
        zip_path = create_zip_archive(workdir / zip_name, renamed_paths)
        await saas_record_usage(token, "split")
        return download_response(zip_path, zip_path.name, "application/zip", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/pdf-to-word")
async def pdf_to_word(
    background_tasks: BackgroundTasks,
    token: Annotated[str, Depends(extract_pdf_access_token)],
    file: UploadFile = File(...),
    password: str = Form(default=""),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        reduced_quality = await saas_assert_feature(
            token, "pdf-to-word", total_size_bytes=saved_file.stat().st_size
        )
        pwd = password.strip() or None
        if engine.is_pdf_encrypted(str(saved_file)) and not pwd:
            raise HTTPException(status_code=400, detail="Şifreli PDF için kaynak parolası gerekli.")

        output_name = format_derived_filename(file.filename or saved_file.name, "Word", "docx")
        output_path = workdir / output_name
        engine.pdf_to_word(str(saved_file), str(output_path), password=pwd, reduced_quality=reduced_quality)
        await saas_record_usage(token, "pdf-to-word")
        return download_response(
            output_path,
            output_path.name,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            background_tasks,
            workdir,
        )
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/word-to-pdf")
async def word_to_pdf(
    background_tasks: BackgroundTasks,
    token: Annotated[str, Depends(extract_pdf_access_token)],
    file: UploadFile = File(...),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        await saas_assert_feature(token, "word-to-pdf", total_size_bytes=saved_file.stat().st_size)
        output_name = format_derived_filename(file.filename or saved_file.name, "PDF", "pdf")
        output_path = workdir / output_name
        engine.word_to_pdf(str(saved_file), str(output_path))
        await saas_record_usage(token, "word-to-pdf")
        return download_response(output_path, output_path.name, "application/pdf", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/excel-to-pdf")
async def excel_to_pdf(
    background_tasks: BackgroundTasks,
    token: Annotated[str, Depends(extract_pdf_access_token)],
    file: UploadFile = File(...),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        await saas_assert_feature(token, "excel-to-pdf", total_size_bytes=saved_file.stat().st_size)
        output_name = format_derived_filename(file.filename or saved_file.name, "PDF", "pdf")
        output_path = workdir / output_name
        engine.excel_to_pdf(str(saved_file), str(output_path))
        await saas_record_usage(token, "excel-to-pdf")
        return download_response(output_path, output_path.name, "application/pdf", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/pdf-to-excel")
async def pdf_to_excel(
    background_tasks: BackgroundTasks,
    token: Annotated[str, Depends(extract_pdf_access_token)],
    file: UploadFile = File(...),
    password: str = Form(default=""),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        await saas_assert_feature(token, "pdf-to-excel", total_size_bytes=saved_file.stat().st_size)
        output_name = format_derived_filename(file.filename or saved_file.name, "Excel", "xlsx")
        output_path = workdir / output_name
        engine.pdf_text_to_excel(
            str(saved_file),
            str(output_path),
            preserve_tables=True,
            password=password.strip() or None,
        )
        await saas_record_usage(token, "pdf-to-excel")
        return download_response(
            output_path,
            output_path.name,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            background_tasks,
            workdir,
        )
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/compress")
async def compress_pdf(
    background_tasks: BackgroundTasks,
    token: Annotated[str, Depends(extract_pdf_access_token)],
    file: UploadFile = File(...),
    password: str = Form(default=""),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        await saas_assert_feature(token, "compress", total_size_bytes=saved_file.stat().st_size)
        output_name = format_derived_filename(file.filename or saved_file.name, "Sıkıştırılmış", "pdf")
        output_path = workdir / output_name
        engine.compress_pdf(str(saved_file), str(output_path), password=password.strip() or None)
        await saas_record_usage(token, "compress")
        return download_response(output_path, output_path.name, "application/pdf", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/encrypt")
async def encrypt_pdf(
    background_tasks: BackgroundTasks,
    token: Annotated[str, Depends(extract_pdf_access_token)],
    file: UploadFile = File(...),
    user_password: str = Form(...),
    input_password: str = Form(default=""),
):
    user_password = user_password.strip()
    if not user_password:
        raise HTTPException(status_code=400, detail="Cikti PDF icin parola girmek zorunludur.")

    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        await saas_assert_feature(token, "encrypt", total_size_bytes=saved_file.stat().st_size)
        output_name = format_derived_filename(file.filename or saved_file.name, "Şifreli", "pdf")
        output_path = workdir / output_name
        engine.encrypt_pdf(
            str(saved_file),
            str(output_path),
            user_password=user_password,
            input_password=input_password.strip() or None,
        )
        await saas_record_usage(token, "encrypt")
        return download_response(output_path, output_path.name, "application/pdf", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)
