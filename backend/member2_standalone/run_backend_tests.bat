@echo off
setlocal
cd /d "%~dp0"
echo Running TRUEPRINT backend smoke tests...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0trueprint_member2_smoke_test.ps1"
echo.
pause
