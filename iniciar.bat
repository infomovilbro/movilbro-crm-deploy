@echo off
cd /d "%~dp0"
title CRM Movilbro - Servidor Local
echo ============================================
echo   CRM Movilbro - Inicio Rapido
echo ============================================
echo.
echo  Sitio:    http://localhost:3000
echo  Usuario:  admin
echo  Password: admin
echo.
echo  IMPORTANTE: No cierres esta ventana mientras uses el CRM
echo.
echo ============================================
echo Iniciando servidor...
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se encuentra Node.js.
    echo Instalalo desde https://nodejs.org
    pause
    exit /b 1
)

node server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: El servidor fallo al iniciar.
    echo Prueba ejecutar: npm install
    pause
    exit /b 1
)
REM Deploy trigger 2026-05-25 15:27:36
