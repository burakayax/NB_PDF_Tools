"""Tarayıcıdan gelen istekleri PDF motoruna bağlayan web API rotaları.

Bu dosyada her endpoint belirli bir araç modülünü temsil eder.
İleride yeni bir web aracı eklemek istersen genelde yeni rota burada açılır.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

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

router = APIRouter(prefix="/api", tags=["nb-pdf-tools"])
engine = get_engine()


@router.get("/health")
def health():
    return {"status": "ok", "service": "nb-pdf-tools-web"}


@router.get("/capabilities")
def capabilities():
    return operation_capabilities()


@router.post("/merge")
async def merge_pdfs(
    files: list[UploadFile] = File(...),
    passwords_json: str = Form(default="{}"),
):
    # Birleştirme uzun sürebildiği için işi arka plana bırakıp job_id döndürüyoruz.
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Birleştirme için en az iki PDF seçin.")

    workdir = create_workdir()
    try:
        saved_paths = []
        passwords = {}
        for upload in files:
            saved = await save_upload(upload, workdir)
            saved_paths.append(saved)
        if passwords_json.strip():
            import json

            resolved = json.loads(passwords_json)
            if isinstance(resolved, dict):
                for saved in saved_paths:
                    password = str(resolved.get(saved.name, "") or "").strip()
                    if password:
                        passwords[str(saved)] = password

        output_name = "birleştirilmiş.pdf"
        job_id = create_merge_job(saved_paths, passwords, workdir, output_name)
        return {"job_id": job_id}
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.get("/jobs/{job_id}")
def job_status(job_id: str):
    return get_job_status(job_id)


@router.get("/jobs/{job_id}/download")
def download_job_output(job_id: str, background_tasks: BackgroundTasks):
    output_path, output_name, workdir = get_job_download(job_id)
    background_tasks.add_task(cleanup_job, job_id)
    return download_response(output_path, output_name, "application/pdf", background_tasks, workdir)


@router.post("/inspect-pdf")
async def inspect_pdf(file: UploadFile = File(...)):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        encrypted = engine.is_pdf_encrypted(str(saved_file))
        page_count = None
        if not encrypted:
            page_count = engine.get_num_pages(str(saved_file))
        return {
            "filename": file.filename,
            "encrypted": encrypted,
            "page_count": page_count,
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
    file: UploadFile = File(...),
    pages_text: str = Form(...),
    mode: str = Form(default="single"),
    password: str = Form(default=""),
):
    # Sayfa ayırma akışı tek PDF veya ayrı dosyalar şeklinde iki moda ayrılır.
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        pages = parse_pages_text(pages_text)
        password = password.strip() or None

        if mode == "single":
            output_name = format_split_single_filename(file.filename or saved_file.name, pages)
            output_path = workdir / output_name
            engine.extract_pages(str(saved_file), pages, str(output_path), password=password)
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
        return download_response(zip_path, zip_path.name, "application/zip", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/pdf-to-word")
async def pdf_to_word(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    password: str = Form(default=""),
):
    # Web tarafında yalnızca düzenlenebilir içerik hedeflenir.
    # Taranmış / görsel tabanlı PDF'ler için kullanıcıya net hata veriyoruz.
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        # Web sürümünde fotoğraf gibi görünen Word çıktılar yerine yalnızca düzenlenebilir içerik hedeflenir.
        reader = engine._open_pdf_reader(str(saved_file), password=password.strip() or None, context="PDF -> Word")
        text_chars = 0
        for page in reader.pages[:5]:
            try:
                text_chars += len((page.extract_text() or "").strip())
            except Exception:
                pass
        if text_chars < 20:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Bu PDF taranmış veya görsel tabanlı görünüyor. Web sürümü yalnızca düzenlenebilir Word çıktısı üretir; "
                    "görsel sayfaları fotoğraf olarak aktaran bir çıktı hazırlamaz."
                ),
            )

        output_name = format_derived_filename(file.filename or saved_file.name, "Word", "docx")
        output_path = workdir / output_name
        engine.pdf_to_word(str(saved_file), str(output_path), password=password.strip() or None)
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
    file: UploadFile = File(...),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        output_name = format_derived_filename(file.filename or saved_file.name, "PDF", "pdf")
        output_path = workdir / output_name
        engine.word_to_pdf(str(saved_file), str(output_path))
        return download_response(output_path, output_path.name, "application/pdf", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/excel-to-pdf")
async def excel_to_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        output_name = format_derived_filename(file.filename or saved_file.name, "PDF", "pdf")
        output_path = workdir / output_name
        engine.excel_to_pdf(str(saved_file), str(output_path))
        return download_response(output_path, output_path.name, "application/pdf", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/pdf-to-excel")
async def pdf_to_excel(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    password: str = Form(default=""),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        output_name = format_derived_filename(file.filename or saved_file.name, "Excel", "xlsx")
        output_path = workdir / output_name
        engine.pdf_text_to_excel(
            str(saved_file),
            str(output_path),
            preserve_tables=True,
            password=password.strip() or None,
        )
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
    file: UploadFile = File(...),
    password: str = Form(default=""),
):
    workdir = create_workdir()
    try:
        saved_file = await save_upload(file, workdir)
        output_name = format_derived_filename(file.filename or saved_file.name, "Sıkıştırılmış", "pdf")
        output_path = workdir / output_name
        engine.compress_pdf(str(saved_file), str(output_path), password=password.strip() or None)
        return download_response(output_path, output_path.name, "application/pdf", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)


@router.post("/encrypt")
async def encrypt_pdf(
    background_tasks: BackgroundTasks,
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
        output_name = format_derived_filename(file.filename or saved_file.name, "Şifreli", "pdf")
        output_path = workdir / output_name
        engine.encrypt_pdf(
            str(saved_file),
            str(output_path),
            user_password=user_password,
            input_password=input_password.strip() or None,
        )
        return download_response(output_path, output_path.name, "application/pdf", background_tasks, workdir)
    except Exception as error:
        cleanup_and_raise(workdir, error)
