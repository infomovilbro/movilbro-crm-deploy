param([int]$Port = 3001)

$ErrorActionPreference = "Continue"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$logFile = Join-Path $scriptPath "server-production.log"
$healthUrl = "http://localhost:$Port/health"

$env:NODE_ENV = "production"
$env:PORT = $Port

$host.UI.RawUI.WindowTitle = "CRM Production Server (port $Port)"

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$timestamp $Message" | Out-File -FilePath $logFile -Encoding utf8 -Append
  Write-Host "$timestamp $Message"
}

Write-Log "=== CRM Production Server ==="
Write-Log "NODE_ENV=production, PORT=$Port"

while ($true) {
  Write-Log "Starting node server.js..."
  $process = Start-Process -FilePath "node.exe" -ArgumentList "server.js" -PassThru -NoNewWindow
  Write-Log "Server PID: $($process.Id)"
  Start-Sleep -Seconds 4

  while (-not $process.HasExited) {
    Start-Sleep -Seconds 30
    try {
      $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
      Write-Log "Health: OK (HTTP $($response.StatusCode))"
    } catch {
      Write-Log "Health: FAILED - $($_.Exception.Message)"
    }
  }

  Write-Log "Process exited (code $($process.ExitCode)). Restarting in 3s..."
  Start-Sleep -Seconds 3
}
