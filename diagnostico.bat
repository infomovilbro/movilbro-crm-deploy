@echo off
cd /d "%~dp0"
title CRM Movilbro - Diagnostico
echo ============================================
echo   CRM Movilbro - Diagnostico
echo ============================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js no encontrado
    echo Descargalo de: https://nodejs.org
    pause
    exit /b 1
) else (
    echo [OK] Node.js encontrado
    node --version
)

echo.
if exist "movilbro.db" (
    echo [OK] Base de datos encontrada
) else (
    echo [AVISO] Base de datos no existe - se creara al iniciar
)

echo.
echo [INFO] Verificando usuarios en la base de datos...
node -e "const bcrypt = require('bcryptjs'); const db = require('./database'); db.initDatabase(); const users = db.db.prepare('SELECT username, rol FROM users').all(); users.forEach(u => { console.log('  - ' + u.username + ' (' + u.rol + ')'); }); const admin = db.db.prepare('SELECT * FROM users WHERE username = ?').get('admin'); if (admin) { console.log(''); console.log('[OK] Usuario admin existe y funciona'); } else { console.log('[ERROR] Usuario admin NO existe'); }"

echo.
echo ============================================
echo   INICIANDO SERVIDOR...
echo   http://localhost:3000
echo   Usuario: admin
echo   Password: admin
echo ============================================
echo.

node server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] El servidor fallo al iniciar
    pause
    exit /b 1
)
