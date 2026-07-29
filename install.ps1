[CmdletBinding()]
param(
  [string]$InstallDirectory = (Join-Path $HOME 'FurbyOpen')
)

$ErrorActionPreference = 'Stop'
$RepositoryUrl = 'https://github.com/bcain2121/furby-open.git'
$InstallVersion = 'v0.2.0-alpha.1'

function Write-Step([string]$Message) {
  Write-Host "`n== $Message ==" -ForegroundColor Cyan
}

function Confirm-Step([string]$Message) {
  $answer = Read-Host "$Message [Y/n]"
  return [string]::IsNullOrWhiteSpace($answer) -or $answer -match '^(?i:y|yes)$'
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Find-Command([string]$Name) {
  return Get-Command $Name -ErrorAction SilentlyContinue
}

function Install-WingetPackage([string]$Id) {
  if (-not (Find-Command 'winget.exe')) {
    throw "Windows Package Manager (winget) is unavailable. Install App Installer from the Microsoft Store, then run this installer again."
  }
  & winget.exe install --exact --id $Id --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget could not install $Id (exit $LASTEXITCODE)." }
  Refresh-Path
}

function Test-NodeVersion {
  if (-not (Find-Command 'node.exe')) { return $false }
  & node.exe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=19)?0:1)"
  return $LASTEXITCODE -eq 0
}

function Resolve-Checkout {
  $scriptRoot = Split-Path -Parent $PSCommandPath
  $localPackage = Join-Path $scriptRoot 'package.json'
  if ((Test-Path $localPackage) -and ((Get-Content $localPackage -Raw) -match '"name"\s*:\s*"furby-open"')) {
    return $scriptRoot
  }

  if ((Test-Path $InstallDirectory) -and -not (Test-Path (Join-Path $InstallDirectory '.git'))) {
    throw "$InstallDirectory already exists and is not a Furby Open Git checkout. Choose another -InstallDirectory."
  }
  if (-not (Test-Path (Join-Path $InstallDirectory '.git'))) {
    Write-Step "Downloading Furby Open $InstallVersion"
    & git.exe clone --branch $InstallVersion --depth 1 $RepositoryUrl $InstallDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Git could not download Furby Open.' }
  } else {
    $existingOrigin = (& git.exe -C $InstallDirectory remote get-url origin 2>$null)
    if ($existingOrigin -notin @($RepositoryUrl, $RepositoryUrl.Substring(0, $RepositoryUrl.Length - 4))) {
      throw "$InstallDirectory is a different Git repository. Choose another -InstallDirectory."
    }
    $existingPackage = Join-Path $InstallDirectory 'package.json'
    if (-not (Test-Path $existingPackage) -or (Get-Content $existingPackage -Raw) -notmatch '"name"\s*:\s*"furby-open"') {
      throw "$InstallDirectory does not contain a valid Furby Open checkout."
    }
    $sourceChanges = (& git.exe -C $InstallDirectory status --porcelain --untracked-files=normal)
    if ($sourceChanges) { throw "$InstallDirectory has source changes. Preserve them and use the documented updater instead of reinstalling." }
    & git.exe -C $InstallDirectory fetch --tags origin
    if ($LASTEXITCODE -ne 0) { throw 'Could not fetch Furby Open release tags.' }
    $currentCommit = (& git.exe -C $InstallDirectory rev-parse HEAD)
    $releaseCommit = (& git.exe -C $InstallDirectory rev-parse "${InstallVersion}^{commit}")
    if ($currentCommit -ne $releaseCommit) {
      throw "$InstallDirectory is a different Furby Open version. Use its safe update script so private data is backed up."
    }
    Write-Host "Resuming the existing $InstallVersion checkout at $InstallDirectory."
  }
  return $InstallDirectory
}

try {
  Write-Host ''
  Write-Host '========================================' -ForegroundColor Cyan
  Write-Host '       Furby Open installer' -ForegroundColor Cyan
  Write-Host '========================================' -ForegroundColor Cyan
  Write-Host 'Credentials stay on this computer. The installer pauses for every private login.'

  if (-not (Find-Command 'git.exe')) {
    Write-Step 'Git is required'
    if (-not (Confirm-Step 'Install Git for Windows with winget?')) { throw 'Git is required.' }
    Install-WingetPackage 'Git.Git'
  }
  if (-not (Find-Command 'git.exe')) {
    $gitPath = 'C:\Program Files\Git\cmd'
    if (Test-Path (Join-Path $gitPath 'git.exe')) { $env:Path = "$gitPath;$env:Path" }
  }
  if (-not (Find-Command 'git.exe')) { throw 'Git was installed but is not visible yet. Restart this installer.' }

  if (-not (Test-NodeVersion)) {
    Write-Step 'Node.js 22.19 or newer is required'
    if (-not (Confirm-Step 'Install the official Node.js 22 package with winget?')) { throw 'Node.js is required.' }
    Install-WingetPackage 'OpenJS.NodeJS.22'
  }
  if (-not (Test-NodeVersion)) {
    $nodePath = 'C:\Program Files\nodejs'
    if (Test-Path (Join-Path $nodePath 'node.exe')) { $env:Path = "$nodePath;$env:Path" }
  }
  if (-not (Test-NodeVersion)) { throw 'Node.js was installed but is not visible yet. Restart this installer.' }
  Write-Host "PASS Node.js $(& node.exe --version)"

  $checkout = Resolve-Checkout
  Set-Location $checkout

  if (-not (Find-Command 'ffmpeg.exe')) {
    Write-Host 'ffmpeg is optional and enables Telegram voice/media conversion.'
    if (Confirm-Step 'Try to install ffmpeg with winget?') {
      try { Install-WingetPackage 'Gyan.FFmpeg' } catch { Write-Warning $_.Exception.Message }
    }
  }
  if (-not (Find-Command 'pdftotext.exe')) {
    Write-Warning 'Poppler pdftotext was not found. PDF extraction will remain disabled; text chat still works.'
  }

  New-Item -ItemType Directory -Force -Path '.data', 'logs', 'furby-open-workspace' | Out-Null
  if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }

  Write-Step 'Installing locked JavaScript dependencies'
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed.' }
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'The TypeScript validation failed.' }

  Write-Host "`nPASS Furby Open files are installed at $checkout" -ForegroundColor Green
  & npm.cmd run setup
  if ($LASTEXITCODE -ne 0) { throw 'Guided setup stopped before completion. You can rerun npm run setup.' }
}
catch {
  Write-Host "`nINSTALLER STOPPED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Nothing already saved was deleted. Fix the issue and run this installer again.'
  exit 1
}
