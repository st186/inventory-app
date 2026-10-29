# Sets up the Bunny Momos camera watcher on a new PC (the store PC, a mini PC or a laptop).
# Double-click "Install Bunny cameras.bat" next to this file. It:
#   1. asks for the Tapo camera account and each camera's IP address (if not filled in already),
#   2. checks Python is there (installs it with winget if not) and installs OpenCV,
#   3. puts the program in C:\BunnyCamera and the settings in %LOCALAPPDATA%\BunnyCamera,
#   4. makes it start with Windows, starts it, and shows whether each camera answered.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$program = 'C:\BunnyCamera'
$data = Join-Path $env:LOCALAPPDATA 'BunnyCamera'

function Say($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

try {
  Say 'Camera details'
  $ini = Join-Path $here 'camera_watch.ini'
  if (-not (Test-Path $ini)) { throw 'camera_watch.ini is missing next to this file.' }
  $text = Get-Content $ini -Raw
  if ($text -match 'USERNAME:PASSWORD') {
    Write-Host 'The camera account is the one made in the Tapo app: Camera > Settings > Advanced Settings > Camera Account.'
    $user = Read-Host 'Camera account name'
    $secure = Read-Host 'Camera account password' -AsSecureString
    $pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    # Characters that would break the camera link are written the way links need them.
    $userEnc = [Uri]::EscapeDataString($user)
    $passEnc = [Uri]::EscapeDataString($pass)
    $text = $text -replace 'USERNAME:PASSWORD', "${userEnc}:${passEnc}"
  }
  # One IP address per camera section, asked with the camera's name.
  $lines = $text -split "`r?`n"
  $name = ''
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\[camera') { $name = $lines[$i] }
    if ($lines[$i] -match '^;\s*(.+)$' -and $name) { $label = $Matches[1] }
    if ($lines[$i] -match '^still_url = .*CAMERA-IP') {
      $ip = Read-Host "IP address of '$label' (Tapo app > that camera > Settings > Device Info)"
      $ip = $ip.Trim()
      $lines[$i] = $lines[$i] -replace 'CAMERA-IP', $ip
      if ($lines[$i + 1] -match '^watch_url') { $lines[$i + 1] = $lines[$i + 1] -replace 'CAMERA-IP', $ip }
    }
  }
  $text = $lines -join "`r`n"

  Say 'Checking the cameras answer on this network'
  foreach ($m in [regex]::Matches($text, '@([0-9.]+):554/stream1')) {
    $ip = $m.Groups[1].Value
    $ok = (Test-NetConnection -ComputerName $ip -Port 554 -WarningAction SilentlyContinue).TcpTestSucceeded
    Write-Host ("  {0}: {1}" -f $ip, $(if ($ok) { 'answers' } else { 'NOT reachable - same Wi-Fi? On some routers the PC must be on the 2.4 GHz band or a cable' }))
  }

  Say 'Checking Python'
  $py = Get-Command python -ErrorAction SilentlyContinue
  if (-not $py -or (& python --version 2>&1) -notmatch 'Python 3') {
    Write-Host 'Python not found - installing it (needs internet, a few minutes)...'
    winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  }
  python --version

  Say 'Installing OpenCV (the picture library)'
  python -m pip install --upgrade --quiet opencv-python numpy

  Say 'Copying the program and settings'
  New-Item -ItemType Directory -Force $program, $data | Out-Null
  Copy-Item (Join-Path $here 'camera_watch.py'), (Join-Path $here 'faces.py') $program -Force
  Set-Content -Path (Join-Path $data 'camera_watch.ini') -Value $text -Encoding utf8
  if (Test-Path (Join-Path $here 'models')) { Copy-Item (Join-Path $here 'models') $data -Recurse -Force }

  Say 'Starting with Windows'
  $startup = [Environment]::GetFolderPath('Startup')
  $bat = Join-Path $startup 'Bunny camera watcher.bat'
  "@echo off`r`nstart `"`" pythonw `"$program\camera_watch.py`"`r`n" | Set-Content -Path $bat -Encoding ascii
  Get-CimInstance Win32_Process -Filter "Name like 'python%'" | Where-Object { $_.CommandLine -like '*camera_watch*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Process -FilePath $bat -WindowStyle Hidden
  Write-Host 'Started. Waiting 30 seconds for the first messages...'
  Start-Sleep -Seconds 30

  Say 'Latest lines of the log'
  $log = Join-Path $data 'camera_watch.log'
  if (Test-Path $log) { Get-Content $log -Tail 10 } else { Write-Host 'No log yet.' }
  Write-Host "`nDone. Keep this PC on day and night. Log: $log" -ForegroundColor Green
} catch {
  Write-Host "`nStopped: $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host 'Press Enter to close'
