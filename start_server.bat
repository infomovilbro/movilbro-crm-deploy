@echo off
cd /d "C:\Users\IVAN\Desktop\prueba2servidor\prueba2\movilbro-crm"
title CRM Movilbro - Servidor Local
set PORT=3000
set NODE_ENV=development
set SESSION_SECRET=test123

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js no encontrado. Instalalo desde https://nodejs.org
    pause
    exit /b 1
)

echo Iniciando CRM Movilbro en http://localhost:%PORT%
echo.
node server.js
if %ERRORLEVEL% NEQ 0 (
    echo ERROR al iniciar servidor
    pause
    exit /b 1
)
