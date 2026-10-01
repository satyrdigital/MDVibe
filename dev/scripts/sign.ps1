# Code-signing hook called by the Tauri bundler for every binary it produces
# (MDVibe.exe, the uninstaller and the installer) — see bundle.windows.signCommand.
#
# Without a certificate configured this is a no-op, so local and CI builds work
# unsigned. To sign, provide (as CI secrets / environment variables, never in git):
#   SIGN_CERT_PFX_BASE64  base64 of a code-signing .pfx
#   SIGN_CERT_PASSWORD    its password
# Optional: SIGN_TIMESTAMP_URL (default http://timestamp.digicert.com)
param([Parameter(Mandatory = $true)][string]$File)

$ErrorActionPreference = 'Stop'
if (-not $env:SIGN_CERT_PFX_BASE64) {
  Write-Host "sign: no certificate configured, leaving unsigned: $File"
  exit 0
}

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw 'signtool.exe not found (install the Windows SDK)' }

$pfx = Join-Path ([IO.Path]::GetTempPath()) ("mdvibe-sign-" + [Guid]::NewGuid() + '.pfx')
try {
  [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:SIGN_CERT_PFX_BASE64))
  $ts = if ($env:SIGN_TIMESTAMP_URL) { $env:SIGN_TIMESTAMP_URL } else { 'http://timestamp.digicert.com' }
  & $signtool.FullName sign /f $pfx /p $env:SIGN_CERT_PASSWORD /fd SHA256 /tr $ts /td SHA256 $File
  if ($LASTEXITCODE -ne 0) { throw "signtool failed for $File" }
} finally {
  Remove-Item $pfx -ErrorAction SilentlyContinue
}
