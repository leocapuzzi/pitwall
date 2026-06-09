@echo off
REM Abre o dashboard PitWall. Dois cliques neste arquivo.
cd /d "%~dp0"

REM Fecha qualquer PitWall antigo ainda rodando na porta 8501 (evita instancias
REM "zumbis" empilhadas, que fazem o navegador abrir uma versao velha do app).
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8501 " ^| findstr LISTENING') do taskkill /F /PID %%P >nul 2>&1

".venv\Scripts\streamlit.exe" run "src\app.py"
pause
