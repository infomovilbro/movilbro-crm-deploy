@echo off
cd /d "%~dp0"
title CRM Movilbro - Inicio Rapido
echo ============================================
echo   CRM Movilbro - Abrir en navegador
echo ============================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se encuentra Node.js
    echo Descargalo de: https://nodejs.org
    pause
    exit /b 1
)

echo Iniciando servidor...
echo.

start "" http://localhost:3000

node server.js

echo.
echo El servidor se detuvo.
pause
