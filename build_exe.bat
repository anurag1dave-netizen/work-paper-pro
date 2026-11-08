@echo off
REM Builds a stand-alone WorkPaperPro.exe folder (dist\WorkPaperPro) that needs no Python on the target PC.
REM Run setup.bat first (it creates the "catalog" folder that is bundled here).
cd /d "%~dp0"
call .venv\Scripts\activate.bat
pip install pyinstaller
pyinstaller --noconfirm --onedir --windowed --name WorkPaperPro --add-data "ui;ui" --add-data "catalog;catalog" --add-data "doctemplates;doctemplates" --collect-submodules uvicorn --collect-submodules app launcher.py
echo.
echo Done: dist\WorkPaperPro\WorkPaperPro.exe
pause
