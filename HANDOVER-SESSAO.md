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
- **6ª rodada — FULLMAP/liquid glass (2026-06-11, validação na Lap):** o usuário quer o layout
  EXATO do GO Fast: mapa = FUNDO DA TELA INTEIRA (atravessa atrás da nav), UI flutuando em vidro.
  Implementado como modo `fullmap`: LapAnalysis renderiza o mapa num **PORTAL no `<body>`**
  (`.pw-maplayer` fixed inset-0; evita containing-blocks de transform/filter dos ancestrais).
  `.app.fullmap` transparente, `.scr-head` some, topnav/tabstrip/statusbar em **vidro** (rgba .55
  + blur 18). Painéis (toggle, detalhe, minimapa, scrubber `.pw-scrubfloat`) com `.pw-glass`
  (blur 20), posicionados p/ viewport. App.tsx: `fullmap = view==='lap'` + classe no `<body>`.
  **Abre com a câmera no carro: `initialZoom={7}`** (prop nova; o follow centra sozinho).
  **3 PEGADINHAS RESOLVIDAS (não repetir):**
  1. `.app` precisa de `background:transparent` (deixei var(--bg) e o app OPACO cobria o mapa —
     o usuário viu tela vazia).
  2. **Hit-test**: `pointer-events:none` no `.app` NÃO basta — o clique cai no ancestral `#root`
     e depois no `body` (com z-index:-1 o body "rouba" o hit dos filhos negativos). Solução:
     `.pw-maplayer{z-index:0}` + `body.fullmap #root{position:relative; z-index:1;
     pointer-events:none}` + chrome re-habilitado com `pointer-events:auto`.
  3. O efeito de `focusCorner` resetava a câmera no MOUNT (focusCorner=null) e matava o
     initialZoom → agora só reseta quando o foco É DESFEITO (ref `hadFocus`).
  **LIÇÃO DE VERIFICAÇÃO (headless, janela oculta):** posições/`el.click()` programático NÃO
  detectam oclusão nem hit-test — SEMPRE validar com `getComputedStyle().backgroundColor` da
  cadeia de ancestrais (opacidade) e `document.elementFromPoint()` nas coords reais dos botões.
  **PRÓXIMO: estender o fullmap às outras telas** (Telemetry = mapa fundo + canais flutuando à
  direita como o GO Fast; Stint/Comparison/Dashboard idem) após o OK visual do usuário na Lap.
- **7ª rodada — RÉPLICA 1:1 do GO Fast na Lap (usuário pediu "EXATAMENTE igual"):** Lap v3 =
  espelho da referência com dados reais: info do carro topo-esq (sem card), mini-ranking (2
  melhores voltas), rail vertical de ações (largada/abrir-trecho/combustível), card **Sector
  Comparison** (melhor verde × média roxa), **2 pods ao vivo** topo-dir (thr/brk barras + km/h +
  marcha + RPM, imperativos a 10 Hz), minimapa com rodapé "Segmento Tn ±s", **slider de zoom**
  central (log até 24x, prop `zoomSlider`), scrubber com progresso fino no topo + **"Delta: ±s ↔
  ±m"** central + **switch do fantasma** + Time/Distance (Time default). Linha virou **GRADIENTE
  contínuo** vermelho→branco→verde (`deltaGradientSegments` em track.ts, ~167 segmentos),
  **bordas quadriculadas** físicas (dash 2.6 un) e **bandeirinhas de freada** reais (prop
  `markers`; onsets do canal brake da melhor volta — 6 em Winton). Card de coach REMOVIDO da Lap
  (coaching abre via minimapa→Telemetry). Verificado: presença, hit-test real em 8 controles,
  ghost toggle, slider 7→24, delta central "+0.032 ↔ +1 m".
- **10ª rodada — fullmap em TODAS as telas de mapa + fixes (aprovado o vidro c/ scale 38/blur 9):**
  (a) **carro maior**: CAR_M 5→7.5 (proporção da ref GO Fast a 50% de zoom), piso 11px, **Z_MAX
  24→48**. (b) **Lap**: coluna direita `.pw-rightcol` = minimapa (`.pw-inflow`, em fluxo) +
  **card de Insight** da curva ativa (coach + vmin/entrada/saída + abrir trecho). (c)
  **TELEMETRY reescrita fullmap** (réplica da ref): leftcol (carinfo + Segments/Sectors + rail +
  **navegador de segmentos** ‹All/Tn/Sn› que recorta os gráficos + tempos A/B), pods, minimapa
  `.pw-mm-tel` + slider em left:21% (classe `pw-tel` no maplayer), **painel direito**
  `.pw-telpanel` com 7 canais `.pw-ch` (label-chip, EIXOS à direita, **bolhas de valor no
  cursor** main+ghost `.pw-bub`, ghost pontilhado `.pw-ghostline`) e **player embutido**
  (`.pw-telscrub` + `.pw-telctrl` c/ Delta↔m, switch fantasma, Time/Distance). **FIX
  serrilhado/distorção: paths RE-AMOSTRADOS por janela de zoom** (memo `charts` — viewBox SEMPRE
  "0 0 600 100"; nunca esticar viewBox; verificado: path muda no zoom). (d) **COMPARISON
  fullmap**: leftcol (carinfo + resumo A/Δ/B + setores clicáveis→foco no mapa), pods, painel
  (delta acumulado + 3 canais c/ vals A/B + player), gradiente na linha
  (`deltaGradientSegments`). (e) `DriverPod.tsx` compartilhado (volante+anel via [data-f]).
  App: fullmap = lap|telemetry|comparison. Stint/Dashboard/AI sem mapa → fora do fullmap (passe
  de estilo próprio futuro). Verificado: hits nas 3 telas, bolhas 13, path re-amostrado, zero
  overlap rightcol×pods, carro 34px @z5.
- **11ª rodada (commit 7b339a8):** câmera com âncora deslocável — `followX` no InteractiveTrack
  (Telemetry/Comparison usam 0.22: carro centra na ÁREA VISÍVEL do mapa, nunca sob o painel;
  verificado px-exato) + **dock** minimapa/slider: coluna única alinhada ancorada à borda do
  painel (`right:calc(min(58%,830px)+46px)`, largura 180, bottom 152/98) — fim das posições
  soltas por % de tela.
- **12ª rodada (fechamento):** fix da âncora no ZOOM OUT MÁXIMO — o recentro do follow era
  condicionado a `z>1.02` e em z=1 soltava a âncora (mapa voltava pro centro da tela) → agora
  recentra em QUALQUER zoom (verificado: carro em x=352/352 em z=1, z=5 e z≈6.9).
  **📘 DOCUMENTAÇÃO DE MANUTENÇÃO criada em `frontend/DESIGN-UI.md`** — arquitetura fullmap,
  knobs do liquid glass (scale/blur), câmera/followX/CAR_M, regra de ouro dos gráficos (nunca
  esticar viewBox), contrato [data-f] dos pods, posições do dock, checklist de verificação
  (oclusão + hit-test) e pegadinhas. LER ANTES de mexer na UI das telas de mapa.
- **8ª rodada (polimento pós-feedback "grosseiro"):** (a) pods compactos 418×75 e com o **VOLANTE
  GIRANDO** pelo canal de direção real (span `data-f="wheel"`, rotate por frame; iRacing + =
  esquerda ⇒ rotate(−steer)). PEGADINHA: a classe `bars` colidiu com o `.bars` do gráfico semanal
  do design system (height fixa esticava o pod p/ 177px) → renomeada `pw-bars`. (b) o tracejado
  da referência NÃO é borda da pista — é a LINHA DA VOLTA DE COMPARAÇÃO: bordas quadriculadas
  REMOVIDAS; fantasma agora é tracejado branco 2.6px "5 6" non-scaling sobre o asfalto. (c)
  **liquid glass real**: rgba(13,16,20,.38) + blur(28) saturate(1.5) brightness(1.12) + sheen
  (gradiente branco no topo) + inset highlight + sombra funda — em painéis E chrome (.42/blur 26).
  Verificado: pod 75px, zero sobreposições, volante −13°→+5° entre pontos da volta, hits ok.
- **9ª rodada (lado a lado com a referência):** (a) **LIQUID GLASS COM DISTORÇÃO**: filtro SVG
  `#pw-glass` no index.html (feTurbulence→feDisplacementMap scale 24→blur 13→saturate 1.45→
  brightness) aplicado via `backdrop-filter:url(#pw-glass)` nos painéis (fallback blur/saturate
  na linha anterior; Chromium ACEITOU — computed mostra url). O que passa por baixo ENTORTA.
  (b) **pod anatomia exata**: ícone vira coluna esquerda (38px, atravessa as 2 linhas) com
  VOLANTE DE CORRIDA novo (aro + 3 raios + MARCADOR central = ângulo legível) + **ANEL externo**
  (circle pathLength=100) que cresce ∝ |steer| e ESPELHA p/ o lado da curva (transform scale(-1)
  qdo steer>0/esquerda) — tudo imperativo por frame. Pod 430×63. (c) **coluna esquerda =
  .pw-leftcol flex** (top:118/bottom:132): carinfo→leader→rail(margin:auto)→seccmp; overlap
  impossível; @media max-height 780/640 esconde leader/rail (prioridade GO Fast). (d)
  **bandeirinhas em ESPAÇO DE TELA** (14px fixos em qualquer zoom; overlay posicionado no
  renderAll como os balões). Verificado em 1366×700 e 1600×900: zero overlaps, hits ok,
  anel 3.5→7.4 entre pontos, url(#pw-glass) ativo.
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
