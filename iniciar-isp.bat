@echo off
cd /d "%~dp0"
title CRM Movilbro - ISP (Puerto 3005)
set PORT=3005
set NODE_ENV=development
echo ============================================
echo  CRM Movilbro - Modulo ISP
echo  Puerto: %PORT%
echo  URL:    http://localhost:%PORT%/isp/dashboard
echo ============================================
echo.
echo  Usuario: infomovilbro
echo  Clave:   movilbro2026
echo.
echo  Para seed data: node seed-demo.js
echo  Para borrar demo: di #borrardemo en OpenCode
echo.
node server.js
pause
