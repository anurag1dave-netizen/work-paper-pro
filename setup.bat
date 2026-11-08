@echo off
cd /d "%~dp0"
where py >nul 2>nul || (echo Python 3.10 or newer is required - install it from python.org and tick "Add python.exe to PATH". & pause & exit /b 1)
py -3 -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

REM --- build the 78 working-paper templates from the ICAI publication (takes ~15 seconds) ---
set "SRC="
if exist "%~dp0ICAI-Audit-Working-Paper-Templates.docx" set "SRC=%~dp0ICAI-Audit-Working-Paper-Templates.docx"
if not defined SRC set /p SRC=Drag the ICAI "Audit Working Paper Templates" .docx file here and press Enter: 
set SRC=%SRC:"=%
python tools\build_catalog.py "%SRC%" catalog
if errorlevel 1 (echo Catalog build failed. & pause & exit /b 1)

echo.
echo Setup complete. Double-click run.bat to start Work Paper Pro.
pause
