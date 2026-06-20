@REM deploy.bat - Un solo comando para pushear desde local
@REM Uso: deploy.bat (o doble click)
@echo off
cd /d "%~dp0"
git add -A
git commit -m "auto deploy %date% %time%"
git push --force
echo.
echo ✅ Codigo en GitHub. En Replit Shell escribe: bash deploy.sh
pause