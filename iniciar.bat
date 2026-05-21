@echo off
cd /d "%~dp0"
echo Iniciando CRM Movilbro...
echo Abre http://localhost:3000 en tu navegador
echo Usuario: admin - Password: admin123
echo.
node server.js
pause