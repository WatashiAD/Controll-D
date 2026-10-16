# Controll-D Standalone Installer for Windows (PowerShell)
# Installs Controll-D and creates shortcuts in a single command.

$ErrorActionPreference = "Stop"

$InstallDir = "$env:LOCALAPPDATA\Controll-D"
$LegacyDir = "$env:LOCALAPPDATA\Cotrll-D"
$BinDir = "$env:LOCALAPPDATA\Microsoft\WindowsApps"
$RepoZip = "https://github.com/WatashiAD/Controll-D/archive/refs/heads/main.zip"

Write-Host "🎮 Installing Controll-D v1.0 for Windows..." -ForegroundColor Cyan

# 1. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "📦 Node.js not found. Installing via winget..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } else {
        Write-Error "Node.js 20+ is required. Please install Node.js from https://nodejs.org/ and re-run."
        exit 1
    }
}

# 2. Check ViGEmBus
$vigemInstalled = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*ViGEmBus*" }
if (-not $vigemInstalled) {
    Write-Host "⚙️  ViGEmBus driver is recommended for Windows virtual game controller support." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "📦 Installing ViGEmBus driver..." -ForegroundColor Yellow
        winget install Nefarius.ViGEmBus --silent --accept-source-agreements --accept-package-agreements
    } else {
        Write-Host "💡 Download ViGEmBus driver installer from: https://github.com/nefarius/ViGEmBus/releases" -ForegroundColor Gray
    }
}

# 3. Download Controll-D
Write-Host "📦 Downloading Controll-D to $InstallDir..." -ForegroundColor Cyan
if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$tempZip = "$env:TEMP\controll-d-main.zip"
$extractDir = "$env:TEMP\controll-d-extract"
if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }

Invoke-WebRequest -Uri $RepoZip -OutFile $tempZip
Expand-Archive -Path $tempZip -DestinationPath $extractDir -Force
$extractedFolder = Get-ChildItem -Directory $extractDir | Select-Object -First 1
Move-Item "$($extractedFolder.FullName)\*" -Destination $InstallDir -Force
Remove-Item -Recurse -Force $extractDir, $tempZip -ErrorAction SilentlyContinue

# Cleanup legacy install directory if present
if (Test-Path $LegacyDir) {
    Remove-Item -Recurse -Force $LegacyDir -ErrorAction SilentlyContinue
}

# 4. Install production dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
Push-Location $InstallDir
npm install --omit=dev --no-audit --no-fund --quiet
Pop-Location

# 5. Create launcher script controll-d.cmd in PATH
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
}
$Launcher = "$BinDir\controll-d.cmd"
"@echo off
node `"$InstallDir\server\main.mjs`" %*
" | Set-Content -Path $Launcher -Encoding ASCII

# Symlink / copy legacy cotrll-d command for backward compatibility
Copy-Item "$BinDir\controll-d.cmd" "$BinDir\cotrll-d.cmd" -Force

# 6. Start Menu Shortcut
$StartMenuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$StartMenuDir\Controll-D.lnk")
$Shortcut.TargetPath = "$BinDir\controll-d.cmd"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Description = "Controll-D Wireless Virtual Controller"
$Shortcut.Save()

if (Test-Path "$StartMenuDir\Cotrll-D.lnk") {
    Remove-Item -Force "$StartMenuDir\Cotrll-D.lnk" -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "✨ Controll-D installation complete!" -ForegroundColor Green
Write-Host "   Type 'controll-d' in PowerShell or Command Prompt to start." -ForegroundColor Cyan
Write-Host ""

$response = Read-Host "🚀 Start Controll-D now? (Y/n)"
if ($response -eq "" -or $response -match "^[Yy]") {
    & "$BinDir\controll-d.cmd"
}
