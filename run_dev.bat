@echo off
REM Developer mode: server only, open http://127.0.0.1:8765 in any browser (use with a Lovable/Vite dev server on :5173 or :8080)
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
