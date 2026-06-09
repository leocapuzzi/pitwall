@echo off
REM Abre o PitWall WEB (Cenario B): API FastAPI + frontend, num processo so.
cd /d "%~dp0"
REM Fecha instancia antiga na porta 8600 (evita zumbis).
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8600 " ^| findstr LISTENING') do taskkill /F /PID %%P >/dev/null 2>&1
REM Abre o navegador apos 2s (da tempo do servidor subir).
start "" cmd /c "timeout /t 2 /nobreak >/dev/null & start http://localhost:8600"
".venv\Scripts\python.exe" -m uvicorn server:app --app-dir src --port 8600
pause
