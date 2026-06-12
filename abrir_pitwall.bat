@echo off
REM Abre o PitWall (interface React servida pelo FastAPI). Dois cliques neste arquivo.
cd /d "%~dp0"

REM Confere se o build do frontend existe (frontend\dist). Sem ele, so a API subiria.
if not exist "frontend\dist\index.html" (
    echo [PitWall] O build do frontend nao foi encontrado em frontend\dist.
    echo [PitWall] Peca ao Claude para rodar:  npm --prefix frontend run build
    pause
    exit /b 1
)

REM Fecha qualquer PitWall antigo ainda rodando na porta 8600 (evita instancias
REM "zumbis" empilhadas, que fazem o navegador abrir uma versao velha do app).
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8600 " ^| findstr LISTENING') do taskkill /F /PID %%P >nul 2>&1

REM Abre o navegador apos 2s (da tempo do servidor subir).
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8600"

".venv\Scripts\python.exe" -m uvicorn server:app --app-dir src --port 8600
pause
