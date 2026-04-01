# Build NB_PDF_Tools.exe with PyInstaller (run from repository root).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "Installing build deps..." -ForegroundColor Cyan
python -m pip install -q -r requirements-build.txt

Write-Host "Generating .ico from PNG..." -ForegroundColor Cyan
python scripts/png_to_ico.py

Write-Host "Running PyInstaller..." -ForegroundColor Cyan
python -m PyInstaller --noconfirm packaging/nb_pdf_tools.spec

$exe = Join-Path $Root "dist\NB_PDF_Tools.exe"
if (Test-Path $exe) {
    Write-Host "OK: $exe" -ForegroundColor Green
} else {
    Write-Host "Expected EXE not found: $exe" -ForegroundColor Red
    exit 1
}

$iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
if (Test-Path $iscc) {
    Write-Host "Building Inno Setup installer..." -ForegroundColor Cyan
    & $iscc (Join-Path $Root "installer\NB_PDF_Tools.iss")
    Write-Host "Done." -ForegroundColor Green
} else {
    Write-Host "Inno Setup 6 not found; skip installer. Install from https://jrsoftware.org/isinfo.php" -ForegroundColor Yellow
}
