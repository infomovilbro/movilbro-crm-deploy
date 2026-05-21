$logFile = "$env:TEMP\tunnel2.log"
$proc = Start-Process -FilePath "C:\Users\xtptx\cloudflared.exe" -ArgumentList "tunnel --url http://127.0.0.1:3000" -NoNewWindow -RedirectStandardOutput $logFile -PassThru
Start-Sleep 8
Write-Host "=== Tunnel Status ==="
Get-Process -Id $proc.Id -ErrorAction SilentlyContinue | Select-Object Id, ProcessName
Write-Host "=== Tunnel Log ==="
Get-Content $logFile -Tail 10
