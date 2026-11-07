@echo off
setlocal
cd /d "%~dp0"
set DEMO_MODE=true
set DEMO_REQUIRE_ROLE_CODES=false
set CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

echo Starting TRUEPRINT local backend...
echo Keep this window open while testing.
echo API docs: http://127.0.0.1:8000/docs
python -m uvicorn app.main:app --reload
pause
