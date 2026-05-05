# Career Seek — user data reset (Windows)
# Deletes all personal data so the platform starts fresh for a new user.
# Does NOT remove the app code, binaries, or Python runtime.
$ErrorActionPreference = "Stop"

$DataDir = if ($env:JOBHUNT_DATA_DIR) { $env:JOBHUNT_DATA_DIR } else { Join-Path $HOME ".jobhunt-india" }

function Write-Info($Message)  { Write-Host "[Career Seek] $Message" -ForegroundColor Cyan }
function Write-Warn($Message)  { Write-Host "[Career Seek] $Message" -ForegroundColor Yellow }
function Write-Ok($Message)    { Write-Host "[Career Seek] $Message" -ForegroundColor Green }

Write-Host ""
Write-Warn "This will PERMANENTLY delete all Career Seek user data:"
Write-Host ""
Write-Host "  * Resume uploads and generated documents"
Write-Host "  * All scan results and saved jobs"
Write-Host "  * AI Coach conversation history"
Write-Host "  * Application tracker entries"
Write-Host "  * Settings and any API keys stored in the app"
Write-Host "  * Meilisearch search index"
Write-Host ""
Write-Host "  Directory: $DataDir"
Write-Host ""
Write-Info "The app code, binaries, and Python runtime are NOT affected."
Write-Info "Run .\setup.ps1 after this to start fresh."
Write-Host ""

if ($args -contains "--yes") {
  $Confirm = "reset"
} else {
  $Confirm = Read-Host "Type 'reset' to confirm (anything else cancels)"
}

if ($Confirm -ne "reset") {
  Write-Host "[Career Seek] Reset cancelled."
  exit 0
}

Write-Host ""
Write-Info "Clearing user data in $DataDir ..."

$MeiliData = Join-Path $PSScriptRoot "binaries\meilisearch\data"

if (Test-Path $DataDir) {
  Remove-Item -Recurse -Force $DataDir
  Write-Ok "User data cleared."
} else {
  Write-Info "Data directory not found — nothing to remove."
}

if (Test-Path $MeiliData) {
  Remove-Item -Recurse -Force $MeiliData
  Write-Ok "Meilisearch index cleared."
}

Write-Host ""
Write-Ok "Reset complete. Career Seek is ready for a new user."
Write-Info "Start the app with:  .\setup.ps1"
