# HANDOVER — PitWall (rebuild da UI em React) · atualizado 2026-06-10 (2ª sessão)

> Ponte para uma sessão nova do Claude continuar o trabalho. **Leia também as memórias**
> do projeto (índice em `MEMORY.md` do diretório de memória) — em especial
> `pitwall-frontend-react.md`, `pitwall-projeto.md`, `pitwall-canais-telemetria.md`,
> `iracing-data-api-bloqueada.md`, `pitwall-coach-ia-decisao.md`.

## 0. Onde estamos / como rodar
- **Caminho do projeto:** `C:\Users\leoca\Documents\Claude\PitWall` (mudou do iCloud p/ Documents;
  a sessão do Claude pode abrir com cwd no path VELHO do iCloud, agora vazio — **trabalhar no path novo**, sempre absoluto). GitHub: `github.com/leocapuzzi/pitwall`.
- **Stack:** backend Python (FastAPI) reusando todo o motor de análise; frontend **React+TS+Vite** em `frontend/`.
- **Rodar (dev):**
  - Backend: `cd <projeto> && .venv/Scripts/python.exe -m uvicorn server:app --app-dir src --port 8600`
  - Frontend: `npm --prefix frontend run dev` (Vite na **5173**, proxia `/api`→8600). Preview tem config **"frontend"** no `.claude/launch.json` (do path velho do iCloud, com caminhos ABSOLUTOS).
  - Produção (futuro): `npm --prefix frontend run build` → `frontend/dist` servido pelo FastAPI.
- Node v22, git, venv ok. `.ibt` reais em `~/Documents/iRacing/telemetry`; fallback `samples/`.

## 1. O que está PRONTO
- **Backend (intacto, reutilizado):** `src/webdata.py` (`build_session_payload`, `list_sessions`) transforma `.ibt` em JSON real (canais, delta, curvas do modelo, scorecard, insights, **pista fixa + linha da sessão**, sector times). `src/server.py` (FastAPI): `/api/sessions`, `/api/session?path=`, e serve estáticos. Todo o motor (`ibt_reader/analysis/signatures/calibration/corners/coaching/track_model`) inalterado.
- **Frontend React (fundação):** `frontend/src/` — `styles/` (design system portado `pitwall.css`+`components.css`), `components/Chrome.tsx` (TopNav/SessionStrip/StatusBar) + `Icon.tsx`, `App.tsx` (roteamento 6 telas via estado `view`+localStorage), `lib/api.ts` (client+tipos), `lib/useSession.ts` (carrega payload, cache de módulo, default=1ª sessão com ≥2 voltas limpas), `lib/track.ts` (`projectTrackPair`). `public/assets/` + `public/porsche-mark.js`.
- **Tela TELEMETRY** (`src/screens/Telemetry.tsx` + `components/InteractiveTrack.tsx`): **dados reais**, 7 canais (Delta/Speed/Throttle/Brake/RPM/Gear/Steering) com cursor/dot/ghost(média)+área, mapa com carro, pods ao vivo, scrubber, **play em tempo real**, **zoom+seleção-de-área** (arrasta recorta / roda zoom / clique posiciona / reset), **linhas de setor**, **pista fixa (faixa) + linha da sessão (verde)**. Build verde.
- **TODAS as 6 telas construídas com dados reais (2ª sessão de 2026-06-10), build verde + verificadas no preview:**
  - **LAP ANALYSIS** (`LapAnalysis.tsx`): mapa com a linha COLORIDA pelo delta local (`deltaSegments` em `lib/track.ts` — vermelho perde/verde ganha/neutro), barras "tempo por curva" (clique → **foco/zoom na curva** no mapa, prop `focusCorner` do InteractiveTrack) e visão por SETOR (toggle Segments/Sectors), card de detalhe com o **coach real** da curva (dt/entrada/saída/vmin/flags), chips "Replay da curva" e "Ver na Telemetry" (evento `pw:go` no App). Topo mostra `referencia · vs melhor · Δtotal` (NÃO somar sectorTimes p/ exibir "tempo da média" — diverge ~0.4s do oficial; ver chip de tarefa criado).
  - **STINT** (`Stint.tsx`): payload ganhou **`laps[]`** (backend `webdata.py`: n/t/valid/pit/clean/best/setores por volta/fuel por volta + `contexto.fuelFim`). KPIs (melhor/ótima/média σ/consistência), **gráfico de evolução interativo** (hover/clique ↔ lista), lista de voltas, banda de setores da volta selecionada, chip de combustível real (L/volta + voltas restantes).
  - **COMPARISON** (`Comparison.tsx`): A=média vs B=sua melhor (par do payload). Mapa grande com linha por delta + **callout real** (pior setor + pior curva) + inset (maior ganho/menor perda), gráfico de delta acumulado com cursor, **setores clicáveis → foco no mapa da pior curva do setor**, overlay de 3 canais A vs B (imperativo), scrubber. Seleção LIVRE de voltas (volta N vs M) fica para quando houver endpoint por volta.
  - **DASHBOARD** (`Dashboard.tsx`): hero (assets LIGMA), stats locais da sessão, mini-mapa, donut limpas/válidas/descartadas, **atividade da semana real** (mtimes dos .ibt). Licenças/iRating/leaderboard = stub explícito (API iRacing bloqueada).
  - **AI ENGINEER** (`AIEngineer.tsx`): relatório 100% REAL — resumo (delta/pior setor), skills do `scorecard` (brake_aggression/trail_overlap/circle_use/rotation_eff 0..1 → /100 + nota), top-3 oportunidades dos `insights` (clique fixa o insight com porquê/corrigir/validar). **Chat = resposta honesta "em breve"** (coach ON HOLD até o pool do Max); quando ligar, trocar o `send()`.
- Compartilhados novos: `lib/fmt.ts` (parseLap/fmtClock), `components/SlideSeg.tsx`, `lib/track.ts#deltaSegments`, InteractiveTrack com props `racingSegments`/`focusCorner`/`children` (overlays) e **carro como camada HTML** (ver §2).

## 2. ✅ RESOLVIDO (2026-06-10, aguarda confirmação visual do usuário): framerate do carro
**CAUSA RAIZ (não era só repaint):** o carro andava **por índice arredondado** — `pts[round(t*(N-1))]`
com N≈1000 e volta de ~90s ⇒ o índice só muda **~11×/s**. O carro se movia a ~11 fps por
construção, por mais rápido que o navegador renderizasse. Por isso as 2 tentativas anteriores
(imperativo, tirar drop-shadow) não mudaram nada.

**Correções aplicadas (as 3 frentes):**
1. **Interpolação** entre pontos vizinhos (`i=floor(f)`, lerp por `f-i`) p/ posição E ângulo —
   mantém a semântica de DISTÂNCIA do grid (não é o `getPointAtLength`, que deslizava).
   Verificado: 25/25 posições distintas com passo uniforme (antes: saltos a cada ~5 frames).
2. **Carro fora do SVG** → camada HTML (`div` com o Porsche em mini-SVG próprio) movida só com
   `transform: translate3d+rotate+scale` (composta na GPU; o SVG pesado — faixa 44px + linha com
   glow — fica estático, zero repaint por frame). Posição px calculada do viewBox (meet centrado
   + pan/zoom do `<g>`), tamanho do palco CACHEADO via ResizeObserver (zero getBoundingClientRect
   por frame). Reposiciona em mudança de vp (useLayoutEffect) — carro acompanha zoom/pan/resize
   (verificado: 0.1–1px da linha em todos os cenários; escala 0.6375→0.8925 com zoom 1.4×).
3. **Cursores/dots/knob/fill/barras dos pods via transform** (translate3d/scaleX; antes era
   left/top/width em % = layout por frame). Elementos cacheados 1×/render (zero querySelector
   por frame). **Textos** (valores, clock, pods) atualizam a ~10 Hz no play (texto muda layout;
   força update imediato em interações). CSS: `.tp-knob` perdeu `transition:transform` e o hover
   por scale (conflitavam com a animação) → hover virou anel de box-shadow.

**Se o usuário AINDA achar choppy:** medir com DevTools→Performance no PC dele (a janela do
preview headless fica `document.hidden` ⇒ rAF suspenso, não dá pra medir FPS de relógio de fora);
suspeitos seguintes seriam vsync/monitor ou GPU drivers — o pipeline de render está limpo.

## 3. ✅ PISTA REAL com bordas (OSM) — resolvido 2026-06-10 (3ª rodada)
O usuário apontou (certo): com a "pista" sendo uma volta congelada engordada (stroke 44px), o
carro parecia SEMPRE no meio da pista. Solução implementada:
- **Geometria real do circuito vinda do OpenStreetMap** (ways `highway=raceway` via Overpass;
  ODbL). O Lat/Lon do iRacing é geolocalizado no mundo real → casa com o OSM SEM correção
  (offset médio medido: +0.15 m!).
- **`tools/build_track_from_osm.py`**: usa a volta de referência congelada p/ SELECIONAR e
  ORDENAR os pontos do asfalto (escolhe sozinho a variante certa do circuito; centerline sai
  ordenada no sentido da volta ⇒ `apex_pct` continua valendo), suaviza, re-amostra 1000 pts,
  gera bordas por normais (±width/2; Winton: 11 m default) e VALIDA (imprime offset lateral da
  volta vs centerline + % dentro das bordas). Winton National: 95.7% dentro, resto = zebra.
- **`tracks/winton_national.track.json` v2**: + `center/left/right/width_m` (mantém `lat/lon` =
  volta de referência p/ fallback/ordenação). Raw do Overpass em `tracks/_osm_winton_raw.json`.
- **webdata**: `track` = CENTERLINE; novo `track_edges` {left,right} + `track_width_m`, tudo no
  mesmo referencial da linha da sessão.
- **Frontend**: `projectTrackPair(track, racing, edges?)` projeta bordas e monta `edges.roadD`
  (polígono do asfalto); `InteractiveTrack` desenha polígono + bordas (fallback: faixa antiga);
  Dashboard minimap idem. **VALIDADO**: posição lateral da linha vai de 0.03 a 0.97 da largura
  (σ 0.24) — a linha encosta nos ápices e abre nas saídas, como deve.
- **Novas pistas**: rodar o Overpass (POST com User-Agent; ver query no histórico) + o script
  `tools/build_track_from_osm.py <slug> <width_m>` com um `.track.json` v1 (volta de referência).
- **Ajustes pós-feedback (4ª rodada):** (a) curva fantasma antes da T1 corrigida — o match agora
  prefere a way MAIS LONGA sozinha (cobria 100%); fragmentos paralelos (ligação/pit sem nome)
  causavam pulos na borda. (b) **PROPORÇÕES reais**: `projectTrackPair` expõe `unitPerM`; carro =
  sprite de **5 m físicos** (piso de 9px na visão geral; escala EXATA com zoom — validado: carro/
  pista = 0.457 vs 0.455 teórico), linha do traçado **1.8px constante** (non-scaling-stroke;
  segmentos delta 2px), balões de curva em **espaço de TELA** (svg overlay, raio fixo ~8.5px,
  clique mantido), **teto de zoom 24×** (close-ups tipo GO Fast; foco-na-curva usa z=8).
- **5ª rodada (feedback c/ prints GO Fast) — InteractiveTrack v3 + Lap full-map:**
  - **Sem bordas**: asfalto = só o polígono (fill .075), como o GO Fast.
  - **CARRO-FANTASMA da média** (sprite cinza, linha pontilhada `racing_line_b` do backend) +
    **Time/Distance FUNCIONAL** (Telemetry e Comparison): *Distance* alinha os 2 carros no mesmo
    ponto da pista (compara linhas); *Time* põe o fantasma onde a média estava NO MESMO INSTANTE
    (`ref_time` novo no payload; inversão binária da curva de tempo da média) + **gap em metros**
    no readout (`↔ +25 m`; validado: 0.735s ≈ 25 m a ~120 km/h).
  - **CÂMERA FIXA NO CARRO** (`follow`): viewport agora é IMPERATIVO (`<g>` via ref; vpr =
    fonte da verdade; React só espelha p/ UI) — com zoom >1 a câmera segue o carro por frame
    (sem setState), **pan manual desabilitado** (só zoom in/out, como o GO Fast); balões de
    curva viraram divs HTML reposicionadas por frame (acompanham a câmera).
  - **LAP ANALYSIS v2 = MAPA EM TELA CHEIA**: toggle+resumo flutuantes (topo-esq), **card de
    detalhe flutuante** (baixo-esq) com navegação ‹ › entre curvas/setores + coach + chips, e
    **MINIMAPA** (`components/MiniTrackMap.tsx`, topo-dir) com balões por curva, **SONAR**
    (pulso vermelho nas top-3 perdas >0.05s), hover = "T1 · perda +0.31s", **clique = abre o
    trecho na Telemetry** (`lib/bus.ts` setPendingFocus → pw:go → Telemetry aplica zoom
    [apex±0.05] + cursor no ápice; verificado). Ponto do carro no minimapa atualiza por frame.

## 4. ✅ Telas TODAS construídas (ver §1) — próximos refinamentos
Feito na 3ª rodada (feedback do usuário):
- ✅ **Serrilhado do carro**: o marcador virou 2 sprites `<img>` SVG (branco/freando, troca por
  opacity); o box é redimensionado em zoom/resize (re-rasteriza o vetor com AA no tamanho certo)
  e a transform por frame é translate+rotate SEM scale (textura 1:1 — era o scale na textura
  rasterizada que serrilhava). Aguarda confirmação visual.
- ✅ **Pista real com bordas** (§3).
- ✅ **Discrepância tempo oficial × integrado RESOLVIDA** em `analysis.py`: (a) `sector_times`/
  `segment_deltas` fechavam o setor 1 índice ANTES da fronteira → 1 passo de grade (~0.09s)
  sumia POR SETOR (4 setores ≈ 0.37s); agora fecham no início do próximo (telescopa exato).
  (b) `time_to_distance` extrapola as pontas (1º/último sample raramente caem na linha) e zera
  o relógio NA LINHA. Validação: soma dos setores = `ttd[-1]` = `LapLastLapTime` oficial ao
  milésimo (92.365). Efeito visível: "volta ótima" subiu ~0.4s (1:31.683→1:32.080 — antes era
  otimista por construção).

Pendências conhecidas (em ordem de valor):
- **Confirmação visual do usuário**: carro (nitidez+fluidez), pista com bordas, telas novas.
- **Comparison: seleção livre de voltas** (volta N vs M, outra sessão) → precisa de endpoint por volta no backend (canais de UMA volta arbitrária) + UI de seleção (fluxo B do design).
- **Telemetry**: canal hide/reorder (ficou fora da v1); aba Tyres é stub.
- **Dashboard**: donut "uso por carro" entre sessões pediria endpoint leve de sumários (ler só o header YAML de cada .ibt).
- **AI Engineer**: ligar o chat no coach quando o pool do MAX abrir (design do coach pronto — ver memória `pitwall-coach-ia-decisao`).
- Selector de SESSÃO na SessionStrip (hoje fixa na 1ª com ≥2 limpas; `useSession.load()` já existe).

## 5. Contrato de dados (payload de `/api/session`)
`{ contexto{carro,pista,suaMelhor,referencia,deltaTotal,voltasGravadas/Validas/Limpas,cornersSrc}, eixoDist[], delta[], ref{throttle,brake,speed,rpm,gear,steer}, media{...}, track{x,y}(fixa), racing_line{x,y}(sessão), track_fixed, corners[{n,apex_pct}], setores[], sectorTimes{labels,ref,media,genericos}, scorecard{...}, insights[{corner,phase,cost_s,straight_m,flags,what,why,fix,validate}], analise_curvas[] }`.
Canais normalizados 0..1 no front (ver `build()` em Telemetry.tsx). `t` = fração de DISTÂNCIA (LapDistPct) → **carro por ÍNDICE** `pts[round(t*(N-1))]`, nunca `getPointAtLength` (arco≠distância).

## 6. Primeiro passo sugerido na nova sessão
1. **Validar com o usuário**: fluidez do carro (fix do §2) e o visual/UX das 5 telas novas — anotar ajustes.
2. Se aprovado: commit + push (`git add -A; git commit; git push` — fluxo do projeto).
3. Depois: pendências do §4 (seleção livre de voltas na Comparison é a de maior valor).
Nota op.: o uvicorn da 8600 NÃO tem --reload — reiniciar o processo após mudar `src/*.py`. O payload de `laps[]`/`fuelFim` exige esse restart.
