@echo off
:: Cierra Edge si está abierto
taskkill /f /im msedge.exe >nul 2>&1
timeout /t 2 /nobreak >nul
:: Abre Edge con depuración remota
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --restore-last-session
