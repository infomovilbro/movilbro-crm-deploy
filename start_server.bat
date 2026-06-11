@echo off
set PORT=3005
set NODE_ENV=development
REM Estas claves se cargan desde las variables de entorno en Render
REM Para desarrollo local, configúralas en tu sistema o usa el archivo .env
REM set OPENCODE_API_KEY=<tu-api-key>
REM set ASSEMBLYAI_API_KEY=<tu-api-key>
REM set OPENROUTER_API_KEY=<tu-api-key>
echo.
echo CRM Local arrancando en http://localhost:3005
echo.
node server.js
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
