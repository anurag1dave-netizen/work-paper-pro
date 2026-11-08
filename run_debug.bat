@echo off
REM Same as run.bat but keeps a console window open so any error is visible.
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (echo Run setup.bat first. & pause & exit /b 1)
.venv\Scripts\python.exe launcher.py
echo.
echo (exit code %ERRORLEVEL%)  Log file: %LOCALAPPDATA%\WorkPaperPro\launcher.log
pause
