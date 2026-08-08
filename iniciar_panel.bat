@echo off
title Stellantis Admin Panel Launcher
echo ===================================================
echo Iniciando Panel de Administracion Stellantis...
echo ===================================================

cd admin_panel

:: Check if node_modules directory exists
if not exist node_modules (
    echo Instalando dependencias de Node.js (esto puede tardar unos segundos)...
    call npm install
)

:: Start the server in the background and open the browser
echo Iniciando el servidor local...
start "" http://localhost:3000
call npm start

pause
