$ErrorActionPreference = "Stop"

$Port = if ($env:CAREER_SEEK_PORT) { $env:CAREER_SEEK_PORT } else { "3000" }
$Url = "http://localhost:$Port"

Write-Host "[Career Seek] Preparing Career Seek..."
$Python = Get-Command python3 -ErrorAction SilentlyContinue
if (-not $Python) {
  $Python = Get-Command python -ErrorAction SilentlyContinue
}
if (-not $Python) {
  Write-Host "[Career Seek] Compatible Python was not found. Bootstrap will download a portable Python 3.12 runtime for python-jobspy."
} else {
  & $Python.Source -c "import sys; raise SystemExit(0 if (3, 9) <= sys.version_info < (3, 13) else 1)"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[Career Seek] Found Python, but python-jobspy currently needs Python 3.9-3.12. Bootstrap will download a portable Python 3.12 runtime instead."
  }
}
Write-Host "[Career Seek] Optional OCR helpers: install Poppler for Windows and Tesseract OCR, then add both bin folders to PATH."

Write-Host "[Career Seek] Running native no-Docker bootstrap..."
npm run bootstrap -- @args

Write-Host "[Career Seek] Launching Career Seek at $Url..."
npm run launch -- @args
