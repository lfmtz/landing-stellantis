@echo off
title Servidor Administrativo Stellantis
echo ====================================================
echo   INICIANDO SERVIDOR ADMINISTRATIVO STELLANTIS
echo ====================================================
echo.

echo [1/3] Verificando que el puerto 3000 este libre...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo       Liberando puerto ocupado previo con PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "%~dp0admin_panel"

echo [2/3] Abriendo el panel en tu navegador...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

echo [3/3] Servidor listo en http://localhost:3000
echo.
echo ====================================================
echo   PANEL ACTIVO. Para cerrarlo, cierra esta ventana.
echo ====================================================
echo.
node server.js
pause
