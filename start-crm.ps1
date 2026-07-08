$env:AI_CLOUD_ENABLED="true"
$env:AI_LOCAL_ENABLED="false"
$env:DEEPSEEK_API_KEY="sk-28f4f9f16d0840d78b806791efcc24fd"
$env:NODE_ENV="production"
$env:ALLOWED_ORIGINS="http://localhost:3000"

$crmDir = "C:\Users\IVAN\Desktop\prueba2servidor\prueba2\movilbro-crm"
Start-Process -FilePath "node" -WorkingDirectory $crmDir -ArgumentList "server.js" -NoNewWindow -RedirectStandardOutput "$env:TEMP\crm2.log" -RedirectStandardError "$env:TEMP\crm2.err"
Start-Sleep 4
Write-Host "=== CRM Log ==="
Get-Content "$env:TEMP\crm2.log" -Tail 3
Write-Host "=== CRM Process ==="
Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id
