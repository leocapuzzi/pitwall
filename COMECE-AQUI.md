# COMECE AQUI — Guia de orientação do PitWall

> **Este é o único documento de orientação do projeto.** Ele diz o que é o PitWall,
> como rodar, o que tem em cada pasta e **qual documento serve para quê**.
> Numa sessão nova do Claude: leia este arquivo e depois o `HANDOVER-SESSAO.md`
> (estado da última sessão + pendências). Atualizado em **2026-06-11**.

---

## 1. O que é

**PitWall** é o app de debriefing de telemetria do iRacing do Leo: lê os arquivos
`.ibt` gravados pelo sim, analisa as voltas (deltas, setores, curvas, coaching) e
mostra tudo numa interface web estilo "engenheiro de pista" (marca LIGMA Racing,
visual GO Fast com liquid glass).

- **Usuário não programa** → o Claude constrói e guia passo a passo, em português.
- **Stack atual:** backend **Python/FastAPI** (`src/`) + frontend **React+TS+Vite**
  (`frontend/`). *(A primeira versão era Streamlit; foi arquivada — ver `_arquivo-morto/`.)*

## 2. Como abrir o app (usuário)

Dois cliques em **`abrir_pitwall.bat`** → abre `http://localhost:8600` no navegador.
O `.bat` já mata instâncias velhas ("zumbis") da porta 8600 e serve o build do React.

## 3. Como rodar em desenvolvimento (Claude)

- **Caminho do projeto: `C:\Users\leoca\Documents\Claude\PitWall`** ⚠️ A sessão pode
  abrir com cwd no caminho VELHO do iCloud (`iCloudDrive\Claude\PItWall`, hoje só uma
  casca com `.claude/`) — trabalhar SEMPRE no caminho novo, com paths absolutos.
  (O projeto saiu do iCloud porque o driver `cldflt.sys` causava telas azuis.)
- **Backend:** `.venv\Scripts\python.exe -m uvicorn server:app --app-dir src --port 8600`
  (sem `--reload`; reiniciar o processo após mudar `src\*.py`).
- **Frontend (dev):** `npm --prefix frontend run dev` → Vite na porta 5173, proxia
  `/api` → 8600. No preview do Claude há as configs `backend` e `frontend` no
  `.claude/launch.json`.
- **Build/typecheck (obrigatório após cada mudança no frontend):**
  `npm --prefix frontend run build` — além de checar tipos, atualiza o
  `frontend/dist` que o `.bat` serve.
- **Telemetria:** `.ibt` reais em `C:\Users\leoca\Documents\iRacing\telemetry`;
  sem eles, cai no fallback `samples/` (2 voltas de MX-5 em Winton).
  Override: variável de ambiente `PITWALL_TELEMETRY_DIR`.
- **GitHub:** repo privado `github.com/leocapuzzi/pitwall` (branch `main`).
  Fluxo: `git add -A; git commit -m "..."; git push` (gh CLI NÃO instalado).

## 4. Mapa de pastas

| Pasta | O que é |
|---|---|
| `src/` | Motor de análise + API: `ibt_reader` (lê .ibt), `analysis` (voltas/deltas/setores), `corners`/`signatures`/`coaching` (análise por curva e insights), `lapdata`/`store` (volta canônica + histórico SQLite/Parquet em `data/`), `webdata` (monta o payload JSON), `server` (FastAPI, porta 8600), `config`/`calibration`/`track_model`, testes `test_*.py`, `inspect_ibt.py` (utilitário p/ listar canais de um .ibt) |
| `frontend/` | Interface React+TS+Vite — 6 telas (Dashboard, Stint, Telemetry, Lap, Comparison, AI Engineer). Docs próprios: `DESIGN-UI.md` e `LIQUID-GLASS.md` |
| `tracks/` | Geometria fixa das pistas (`*.track.json`, gerados do OpenStreetMap) |
| `tools/` | `build_track_from_osm.py` — pipeline p/ gerar a pista de um circuito novo |
| `samples/` | 2 `.ibt` pequenos de exemplo (vão pro GitHub; fallback sem telemetria real) |
| `data/` | Histórico local gerado pelo app (SQLite+Parquet) — NÃO versionado |
| `Design Reference/` | Prints do app **GO Fast** = north star visual do produto |
| `design_handoff_pitwall/` | Handoff de design (React/JSX+CSS das 6 telas) que guiou o rebuild — ainda é referência p/ pendências (ex.: fluxo B da Comparison) |
| `_arquivo-morto/` | Tudo que saiu de uso (Streamlit, web vanilla, docs antigos) — ver o `LEIA-ME.md` de lá |
| `.venv/` | Ambiente Python (não versionado) |

Na raiz há também o **`secrets.toml`** (cofre de credenciais p/ as APIs da Fase 2,
lido por `src/config.py`) — **fora do git**; nunca commitar nem imprimir.

## 5. Mapa de documentos (quem faz o quê)

| Documento | Papel |
|---|---|
| `README.md` | Vitrine do GitHub: o que é o projeto, como instalar/rodar em qualquer máquina |
| `COMECE-AQUI.md` | **Este guia** — orientação geral única do projeto |
| `HANDOVER-SESSAO.md` | **Documento vivo**: estado da última sessão, o que foi feito/aprovado, pendências em ordem de valor, contrato do payload. Atualizar ao fim de cada sessão de trabalho |
| `PLANO.md` | Plano-mestre original: visão, decisões de arquitetura, regras travadas (§12), roadmap por fases. Histórico de decisões — consultar antes de contrariar algo já decidido |
| `ANALISES.md` | Catálogo dos 278 canais de telemetria e das análises possíveis ❄️ |
| `pitwall_setup.md` | Conhecimento de referência: setup de carro ❄️ |
| `pitwall_pilotagem.md` | Conhecimento de referência: técnica de pilotagem ❄️ |
| `frontend/DESIGN-UI.md` | Guia de manutenção da UI (fullmap, câmera, liquid glass, pegadinhas, checklist de verificação) — **LER antes de mexer nas telas** |
| `frontend/LIQUID-GLASS.md` | Física e implementação do vidro líquido (filtro SVG por painel) |
| `_arquivo-morto/LEIA-ME.md` | O que foi arquivado, quando e por quê |

❄️ = arquivos de conhecimento estáveis: **não editar** sem pedido explícito do Leo.

## 6. Regras de ouro (decididas; não mudar sem conversa)

1. **Nunca apagar os `.ibt`** — é o acervo-fonte, irrecuperável.
2. Alinhar voltas por `LapDistPct`; comparar só **mesmo carro + mesma pista**.
3. Cores: você/BEST = **vermelho**, referência/média = **azul** (no design GO Fast,
   roxo p/ best-sectors conforme as telas).
4. Não voltar a sincronizar código/dados por nuvem "sob demanda" (iCloud causou BSOD).
5. Matar processos zumbis antes de subir servidor (8600) — o `.bat` já faz isso.
6. APIs externas: iRacing `/data` está **bloqueada** (OAuth2 pausado p/ novos clients);
   Garage61 exige aprovação + opt-in. Detalhes nas memórias do Claude.

## 7. Estado e pendências

O estado por sessão (o que está pronto e aprovado, e a fila de pendências em ordem
de valor) vive no **`HANDOVER-SESSAO.md`** — sempre lá, sempre atualizado.
