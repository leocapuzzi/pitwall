# Arquivo morto do PitWall

Tudo aqui **saiu de uso** — guardado só para consulta. Nada nesta pasta roda nem é
importado pelo app atual. Arquivado em **2026-06-11**, na organização geral do projeto.

| Item | O que era | Substituído por |
|---|---|---|
| `streamlit/app.py` | O dashboard da Fase 1 (Streamlit, porta 8501) | Interface React em `frontend/` + FastAPI (`src/server.py`, porta 8600) |
| `streamlit/telemetry_view.py` | Visualizador HTML+Plotly embutido no Streamlit (mapa + gráficos sincronizados) | Telas React (`frontend/src/screens/`) |
| `web-vanilla/index.html` | Primeiro frontend web ("Cenário B", HTML/JS puro servido pelo FastAPI) | Build do React em `frontend/dist` |
| `docs-antigos/COMECE-AQUI-fase1.md` | Ponte Mac→PC para iniciar a Fase 1 (era o `COMECE-AQUI.md` da raiz) | Novo `COMECE-AQUI.md` (guia único de orientação) |
| `docs-antigos/COMECE-FASE-2.md` | Ponte para iniciar a Fase 2 (APIs) | `HANDOVER-SESSAO.md` (estado vivo) + `PLANO.md` |
| `docs-antigos/HANDOVER-DESIGN-A-componente-streamlit.md` | Brief para o mockup A (UI como componente Streamlit) | Etapa cumprida — handoff entregue em `design_handoff_pitwall/` e UI reconstruída em React |
| `docs-antigos/HANDOVER-DESIGN-B-livre.md` | Brief para o mockup B (design livre) | Idem |
| `design-mockups/` | Era a pasta `DESIGN REFERENCES/` da raiz: mockups/HTML da fase de design + prompt usado | `Design Reference/` (prints GO Fast, north star atual) e `design_handoff_pitwall/` |

Também removidos na mesma organização (sem cópia aqui; estão no histórico do git):

- `abrir_pitwall_web.bat` — virou o `abrir_pitwall.bat` atual (o app web É o app agora).
- `landing.html` — experimento de landing page (raiz), removido.
- `streamlit` e `plotly` saíram do `requirements.txt` (só o app antigo usava).
- A pasta `.streamlit/` da raiz não era do app antigo: continha o **cofre de
  credenciais** (`secrets.toml`), que foi movido para a raiz do projeto
  (`secrets.toml`, fora do git) — `src/config.py` lê de lá.

> Para recuperar qualquer coisa: o histórico completo está no git
> (`git log --follow -- <arquivo>`).
