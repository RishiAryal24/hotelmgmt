@echo off
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-local-db.ps1"
if errorlevel 1 exit /b %errorlevel%
start "PyLoom Backend" cmd /k ".\scripts\start-local-backend.cmd"
start "PyLoom Frontend" cmd /k ".\scripts\start-local-frontend.cmd"
echo Started local backend and frontend windows.
echo Postgres: 127.0.0.1:5432
echo Redis:    127.0.0.1:6379
echo Backend:  http://127.0.0.1:8000/healthz/
echo Frontend: http://127.0.0.1:5173/
