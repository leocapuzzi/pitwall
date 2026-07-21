# PitWall 🏁

Debriefing de telemetria de sim-racing (iRacing), no estilo "engenheiro de pista":
lê os arquivos `.ibt` gravados pelo sim, analisa as voltas e mostra onde o tempo
está sendo ganho e perdido — por setor, por curva e por fase da curva (entrada,
ápice, saída) — numa interface web escura com mapa da pista em tela cheia e
painéis em "liquid glass" (marca LIGMA Racing, visual inspirado no GO Fast).

**Stack:** Python (FastAPI + pandas/numpy + pyirsdk) no backend ·
React + TypeScript + Vite no frontend · dados 100% locais (sem nuvem).

## Telas

- **Dashboard** — visão geral: última sessão, voltas limpas, atividade da semana.
- **Stint** — evolução do stint: KPIs (melhor/ótima/média), gráfico de tempos,
  tabela com setores e combustível, separação automática por paradas.
- **Telemetry** — mapa em tela cheia + canais (velocidade, freio, acelerador,
  marcha, volante…) com cursor sincronizado, zoom por trecho e replay do carro.
  Aba **Tyres**: dois carros (melhor vs média) sobre o blueprint do Porsche, com
  as temperaturas por banda de cada pneu (externa/meio/interna) e pressões ao
  vivo durante a volta.
- **Lap Analysis** — a volta colorida pelo delta no próprio mapa + perdas por
  curva com coaching real ("freie 8 m mais tarde na T3…").
- **Comparison** — por padrão melhor volta vs média (fantasma + gap em metros ao
  vivo), com **seleção livre de voltas**: qualquer volta contra qualquer volta,
  inclusive de sessões diferentes da mesma pista.
- **AI Engineer** — relatório do "engenheiro": plano de recuperação do delta,
  replay fantasma por curva, evidências por canal e chat de análise local.

## Como rodar

### No PC do dia a dia (Windows, com iRacing)

Dois cliques em **`abrir_pitwall.bat`** → abre `http://localhost:8600`.
O app lê os `.ibt` de `Documentos\iRacing\telemetry` automaticamente
(no iRacing, grave telemetria com `Alt+L`).

### Numa máquina nova (qualquer SO)

```bash
git clone https://github.com/leocapuzzi/pitwall.git
cd pitwall

# Backend (Python 3.10+)
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt        # Windows
# .venv/bin/pip install -r requirements.txt          # macOS/Linux

# Frontend (Node 20+)
npm --prefix frontend install
npm --prefix frontend run build

# Subir (serve API + interface na porta 8600)
.venv/Scripts/python -m uvicorn server:app --app-dir src --port 8600
```

Sem `.ibt` locais, e com um **token do Garage61** em `secrets.toml`, o app abre
suas voltas do Garage61 como sessões — dá para usar em uma máquina sem iRacing.
As amostras em `samples/` servem para inspecionar o formato do `.ibt` e **podem
não gerar uma sessão completa** (contêm poucas voltas válidas). Para apontar outra
pasta de `.ibt`: variável `PITWALL_TELEMETRY_DIR`.

Em desenvolvimento, o frontend também roda com hot-reload:
`npm --prefix frontend run dev` (porta 5173, proxia `/api` → 8600).

## Estrutura

```
src/        motor de análise (leitura .ibt, voltas, setores, curvas, coaching)
            + server.py (FastAPI: /api/* e o build do frontend)
frontend/   interface React+TS+Vite (build em frontend/dist)
tracks/     geometria fixa das pistas (OSM + contorno oficial do iRacing)
tools/      nova_pista.py (pipeline p/ adicionar circuito novo, incl. mapa oficial)
samples/    telemetria de exemplo (única que vai pro GitHub)
data/       histórico local (SQLite+Parquet) — gerado, não versionado
_arquivo-morto/  versões antigas (Streamlit etc.) — só consulta
```

## Documentação

- **`COMECE-AQUI.md`** — guia de orientação do projeto (mapa de pastas e docs,
  como rodar, regras).
- **`HANDOVER-SESSAO.md`** — estado vivo: o que está pronto e o que vem a seguir.
- **`PLANO.md`** — plano-mestre: visão, decisões de arquitetura e roadmap.
- **`ANALISES.md`** — catálogo dos canais de telemetria e análises possíveis.
- **`TRACK-MAPS.md`** — pipeline dos track maps oficiais do iRacing (fonte,
  georreferenciamento e integração no player/calendário).
- **`frontend/DESIGN-UI.md`** e **`frontend/LIQUID-GLASS.md`** — guias técnicos da UI.

## Estado (jul/2026)

- ✅ Análise completa com os **seus** dados: 6 telas prontas, tempos batendo com o
  oficial ao milésimo, pista real via OpenStreetMap, coaching por curva.
- ✅ Selector de sessão na barra de abas; comparação livre de voltas (inclusive
  entre sessões); telemetria de pneus por banda na aba Tyres.
- ✅ **Garage61 integrado**: compare com pilotos da equipe e abra suas voltas do
  Garage61 como sessões (pods A/B em todas as telas).
- ✅ **Coach de IA (Grok)** escreve o debrief no chat do AI Engineer, com voz
  offline do engenheiro (KittenTTS).
- ⏸️ Resultados/iRating (API `/data` do iRacing) aguardam liberação (OAuth2 pausado).

> Os `.ibt` são o acervo-fonte: nunca são apagados nem versionados (são pesados);
> só `samples/` vai pro repositório.
