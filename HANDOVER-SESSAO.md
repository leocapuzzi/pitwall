# HANDOVER — PitWall (rebuild da UI em React) · atualizado 2026-06-11

> Ponte para a próxima sessão do Claude. **Leia ANTES o `COMECE-AQUI.md`** (guia único de
> orientação: mapa de pastas/documentos, como rodar, regras). **Leia também:** as memórias do
> projeto (índice em `MEMORY.md` — em especial `pitwall-frontend-react.md`, `pitwall-projeto.md`,
> `iracing-data-api-bloqueada.md`, `pitwall-coach-ia-decisao.md`,
> `preview-verificacao-oclusao-hittest.md`) e o **guia de manutenção da UI em
> `frontend/DESIGN-UI.md`** (arquitetura fullmap/liquid glass, knobs, regras e pegadinhas —
> LER ANTES de mexer nas telas de mapa).

## 0. Onde estamos / como rodar
- **Caminho do projeto:** `C:\Users\leoca\Documents\Claude\PitWall` (a sessão pode abrir com cwd
  no path VELHO do iCloud, vazio — trabalhar SEMPRE no path novo, absoluto).
  GitHub: `github.com/leocapuzzi/pitwall` (main).
- **Stack:** backend Python/FastAPI (motor de análise intacto) + frontend React+TS+Vite em `frontend/`.
- **Usuário abre o app por `abrir_pitwall.bat`** → mata zumbis da 8600 e sobe uvicorn servindo
  `frontend/dist` (o `src/server.py` agora serve o BUILD do React; o `web/` vanilla foi arquivado).
- **Rodar (dev):**
  - Backend: `.venv/Scripts/python.exe -m uvicorn server:app --app-dir src --port 8600`
    (⚠️ SEM --reload — reiniciar o processo após mudar `src/*.py`; ele costuma estar morto no
    início da sessão: checar `Get-NetTCPConnection -LocalPort 8600`).
  - Frontend: `npm --prefix frontend run dev` (Vite 5173, proxia `/api`→8600). Preview: configs
    "backend" e "frontend" no `.claude/launch.json` (no do iCloud, caminhos absolutos).
  - Build/typecheck: `npm --prefix frontend run build` (usar após CADA mudança — também atualiza
    o `frontend/dist` que o `.bat` do usuário serve).
- `.ibt` reais em `~/Documents/iRacing/telemetry`; fallback `samples/`. Node v22, venv ok.
- ⚠️ Preview headless: janela fica `document.hidden` (sem rAF/screenshot; timers ≥1s). Verificar
  por DOM com o checklist do DESIGN-UI.md §9 (oclusão + `elementFromPoint`).
- **Organização (2026-06-11):** versão Streamlit (`app.py`/`telemetry_view.py`), `web/` vanilla,
  docs de fases antigas e a pasta `DESIGN REFERENCES/` foram movidos p/ `_arquivo-morto/`
  (ver `LEIA-ME.md` lá); `PLANO 2.md` voltou a chamar `PLANO.md`; `abrir_pitwall_web.bat`
  removido (virou o `abrir_pitwall.bat`); `streamlit`/`plotly` saíram do requirements.txt;
  README do GitHub reescrito. `Design Reference/` (prints GO Fast) e `design_handoff_pitwall/`
  seguem na raiz (referências vivas).

## 1. ✅ CONCLUÍDO (e APROVADO pelo usuário)
**Sessão 2026-06-11 — passe GO Fast nas 3 telas de cards (todas aprovadas):**
- ✅ **Stint**: header de sessão + 2 pods ao vivo (volta de ref em loop; CLIQUE no pod abre o
  popup "Comparison" com a tabela do stint, réplica do print GO Fast), card principal em vidro
  com KPIs (Fastest/Optimal/Average/Fuel gradiente), gráfico Average Laptime (inválida em
  vermelho, melhor em roxo) e tabela com setores (melhor verde, best-sectors roxos, ⓘ com
  tooltip real); **stints REAIS** (separados pelas voltas de pit) com selector à direita; pods
  ancorados nas MESMAS coords do fullmap (top 118/right 22, altura 63).
- ✅ **Dashboard**: saudação + pills de vidro (voltas/sessões 30d), card honesto do iRating
  (API bloqueada), hero "Performance Tools" com o Porsche #64, última sessão com contorno
  BRANCO da pista, donut % limpas, atividade semanal em slots; sem tabstrip (= GO Fast).
- ✅ **AI Engineer (coração do app)**: strip do engenheiro (anel-scanner + typewriter + pills),
  "Plano de recuperação" (count-up do delta + barra empilhada decompondo a perda nas top-3),
  **REPLAY fantasma da curva fixada** (melhor vs média por inversão de tempo, gap em metros ao
  vivo, zoom roda/pan/reset com viewBox IMPERATIVO, inset-minimapa com pins SVG clicáveis),
  **gauges com EVIDÊNCIA por curva** (pares de barras melhor vs média dos canais reais; pior
  curva pulsa; curvas com insight linkam ao replay; definições fiéis ao signatures.py), chat
  com **ANÁLISE LOCAL rotulada** (responde perdas/setores/consistência/potencial/combustível
  do relatório real) + fallback honesto; deep-link real p/ Telemetry (pendingFocus + zoom).
- ✅ Compartilhado: chrome (nav/abas/status) em vidro em TODAS as telas; fundo `.pw-pagebg`
  (gradientes fixed z:-1) p/ o vidro distorcer; telas travadas no viewport
  (`.screen:has(...)`); `SELF_HEADED` (sem scr-head genérico); DESIGN-UI.md ganhou o §11
  (padrões + pegadinhas novas: apex_pct 0–100 vs 0–1; CSS animations pausadas na janela
  oculta; pins dentro do SVG).

**Sessões anteriores — produto no padrão GO Fast nas 3 telas de mapa, com dados 100% reais:**
- ✅ **6 telas construídas** com dados reais do payload (Telemetry, Lap, Stint, Comparison,
  Dashboard, AI Engineer) — as 3 primeiras no padrão FULLMAP; as outras 3 no layout de cards.
- ✅ **Framerate do carro** (bug original da sessão 1): causa raiz era posição por ÍNDICE
  (~11 px-moves/s) → interpolação + sprites GPU. Aprovado.
- ✅ **Pista REAL via OpenStreetMap** (`tools/build_track_from_osm.py` + `tracks/*.track.json` v2;
  iRacing↔OSM casa sem correção). Carro em proporção da referência (CAR_M 7.5), zoom até 48×.
- ✅ **Tempos exatos**: `analysis.py` corrigido (setores fechavam 1 índice curto + extrapolação
  das pontas) — soma dos setores = `LapLastLapTime` oficial ao milésimo.
- ✅ **FULLMAP + LIQUID GLASS com distorção real** (filtro SVG `#pw-glass`, scale 38/blur 9 —
  calibração aprovada) em **Lap Analysis, Telemetry e Comparison**: mapa = fundo da tela,
  painéis em vidro, câmera fixa no carro com âncora deslocável (`followX`; 0.22 nas telas com
  painel; recentra em QUALQUER zoom — fix do zoom-out máx), dock minimapa+slider ancorado ao
  painel, pods ao vivo com **volante girando + anel de esterçamento**, fantasma da média com
  **Time/Distance funcional + gap em metros**, bandeirinhas de freada reais, linha em gradiente
  contínuo pelo delta, navegador de segmentos, minimapa-sonar (Lap) que abre o trecho na
  Telemetry, card de Insight (coach real) sob o minimapa da Lap.
- ✅ **Fix serrilhado/distorção dos gráficos**: paths RE-AMOSTRADOS por janela de zoom
  (viewBox fixo — regra de ouro no DESIGN-UI.md).
- ✅ **Payload estendido** (backend): `laps[]` por volta, `fuelFim`, `ref_time[]`,
  `racing_line_b`, `track_edges`, `track_width_m`.
- ✅ **Documentação**: `frontend/DESIGN-UI.md` (guia de manutenção completo da UI).
- Commits da época: `1b84515` → `1a9a593` → `7b339a8` → `994804c` (todos pushados).

## 2. ❌ NÃO CONCLUÍDO (pendências, em ordem de valor)
1. **Comparison: seleção LIVRE de voltas** (volta N vs M, inclusive de outra sessão) — pede
   endpoint por volta no backend (canais de UMA volta arbitrária) + UI de seleção (fluxo B do
   design handoff). Maior valor de produto.
2. **Selector de SESSÃO na SessionStrip** (hoje fixa na 1ª com ≥2 voltas limpas;
   `useSession.load()` já existe — falta a UI). A aba também poderia mostrar carro|pista
   reais em vez de "Sessão".
3. **Telemetry**: aba "Tyres" é stub; canal hide/reorder não implementado; o toggle
   Segments/Sectors hoje só alterna o navegador de segmentos (não muda os gráficos).
4. **Dashboard**: donut "uso por carro" entre sessões (pede endpoint leve de sumários — ler só o
   header YAML de cada .ibt, sem análise completa).
5. **AI Engineer**: ligar o chat no coach com IA quando o pool do MAX abrir (~15/06; design
   pronto — ver memória `pitwall-coach-ia-decisao`). A ANÁLISE LOCAL (templates rotulados sobre
   o relatório) já cobre perdas/setores/consistência/potencial/combustível; o fallback segue
   honesto ("IA em breve").
6. **Novas pistas**: por circuito novo, rodar o pipeline OSM (Overpass POST com User-Agent +
   `tools/build_track_from_osm.py <slug> <width_m>`; precisa de um `.track.json` v1 com uma
   volta de referência — processo no DESIGN-UI.md/HANDOVER antigo no git).
7. Detalhes GO Fast não replicados (menores): tooltip "BRAKING" ao passar pela zona de freada,
   ícones à direita da tabstrip, conteúdo do painel Tyres.

## 3. Contrato de dados ATUAL (payload de `/api/session`)
```
{ contexto{carro, pista, suaMelhor, referencia, deltaTotal, voltasGravadas/Validas/Limpas,
           cornersSrc, fuelFim},
  eixoDist[], delta[], ref{throttle,brake,speed,rpm,gear,steer}, media{...},
  track{x,y}(centerline FIXA), racing_line{x,y}(melhor), racing_line_b{x,y}(média),
  track_edges{left{x,y}, right{x,y}}, track_width_m, track_fixed,
  ref_time[](tempo da melhor até cada ponto, p/ modo Time/gap),
  corners[{n,name,apex_pct}], setores[], sectorTimes{labels,ref,media,genericos},
  scorecard{brake_aggression,trail_overlap,circle_use,rotation_eff,coasting_total_s},
  insights[{corner,phase,cost_s,...,what,why,fix,validate}],
  laps[{n,t,valid,pit,clean,best,s[],fuel}],
  analise_curvas[{name,dt,dt_entry,dt_exit,v_min,flags,coach}] }
```
- Canais normalizados 0..1 no front (`build()` das telas). `t` = fração de DISTÂNCIA → posição
  INTERPOLADA entre pontos (nunca `getPointAtLength`; nunca índice puro).
- x/y do payload em METROS → `projectTrackPair` devolve `unitPerM` (escala física).

## 4. Lições-chave (resumo; detalhe no DESIGN-UI.md §10 e nas memórias)
- Animar = imperativo via refs + transform; textos a 10 Hz; nada de setState por frame.
- Gráficos com zoom: re-amostrar a janela; NUNCA esticar viewBox.
- Fullmap: portal no body; `z-index:0` + `#root z:1 pointer-events:none` (nunca z negativo).
- Verificação headless: oclusão (backgrounds dos ancestrais) + hit-test (`elementFromPoint`)
  nas coords reais — posições e `el.click()` mentem.
- Classes novas SEMPRE com prefixo `pw-` (a classe `bars` já colidiu com o design system).
- Erros `[vite] Failed to reload` no console = geralmente HMR de estados intermediários;
  confirmar com reload + build verde antes de caçar fantasma.

## 5. Primeiro passo sugerido na próxima sessão
1. **Seleção livre de voltas na Comparison** (pendência nº1 — maior valor de produto):
   backend ganha endpoint por volta (canais de UMA volta arbitrária) e a UI o fluxo B do
   design handoff (escolher volta N vs M, inclusive entre sessões).
2. Alternativa rápida: **selector de sessão na SessionStrip** (UI sobre `useSession.load()`).
3. Validar no preview com o checklist do DESIGN-UI.md §9 (incl. item 4: finish() nas CSS
   animations antes de medir) e commitar no fluxo `git add -A; git commit; git push`
   (identidade local já configurada; gh CLI NÃO instalado).
