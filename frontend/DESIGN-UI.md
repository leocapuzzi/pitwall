# PitWall — Guia do design FULLMAP / liquid glass (GO Fast)

> Referência de manutenção da UI: telas de mapa (**Lap Analysis, Telemetry,
> Comparison**) nos §§1–8 e telas de cards (**Stint, Dashboard, AI Engineer**) no §11.
> Onde mexer, quais são os "botões de calibração" e as pegadinhas que já nos
> morderam. Norte visual: GO Fast (prints em `Design Reference/`).

## 1. Arquitetura do FULLMAP

O mapa é o **fundo da tela inteira**; a UI flutua por cima em vidro.

- A tela renderiza o mapa num **portal no `<body>`**: `createPortal(<div className="pw-maplayer">…)`.
  Portal evita os *containing blocks* de `transform/filter/animation` dos ancestrais.
- Camadas: `.pw-maplayer{z-index:0}` e `body.fullmap #root{position:relative; z-index:1; pointer-events:none}`.
  **Nunca usar `z-index:-1`** (o `body` "rouba" o hit-test dos filhos negativos).
- `App.tsx`: `fullmap = view === 'lap' | 'telemetry' | 'comparison'` → classe no `.app` E no `<body>`.
- `.app.fullmap` é 100% transparente (visual e mouse); só topnav/tabstrip/statusbar reabilitam
  `pointer-events:auto`. Cliques "atravessam" o shell até o mapa/painéis.
- Telas sem mapa (Stint/Dashboard/AI) ficam fora do fullmap.

## 2. Liquid glass (FÍSICO — artigo kube.io/blog/liquid-glass-css-svg)

> 📘 Referência completa (física, cadeia do filtro, parâmetros, reuso em outro
> projeto, verificação): **`frontend/LIQUID-GLASS.md`**.

- O efeito é gerado por **`src/lib/liquidGlass.ts`**: UM filtro SVG **por painel**
  (`backdrop-filter:url(#pw-lg-N)` inline), reconstruído quando o painel muda de tamanho.
  O motor observa o DOM (MutationObserver) pelos seletores `.pw-glass2`, `.pw-glass`,
  `.pw-maplayer .pw-minimap/.pw-lapdetail`, `.pw-scrubfloat .tp-scrub` — basta usar a
  classe que o vidro "pega" sozinho. Só Chromium; o CSS mantém o fallback blur/saturate.
- **Física** (não é mais ruído/turbulence): perfil squircle no bezel da borda →
  Lei de Snell (n=1.5) → displacement map por canvas (R=X, G=Y, 128=neutro, deslocando
  p/ DENTRO = lente convexa). Encadeado: refração → blur progressivo na borda (máscara
  ramp) → saturate/brightness → **especular** (rim light que herda a cor do fundo
  desfocado super-saturado, screen-blend; contra-luz a 45%).
- **Calibração AGORA É DO USUÁRIO**: menu Settings (engrenagem do TopNav →
  `components/SettingsMenu.tsx`) com os sliders do artigo (specular opacity/saturation,
  refraction, blur, progressive blur, glass bg opacity) + física (bezel, espessura,
  índice, ângulo da luz, saturação). Persistem em `localStorage('pw_glass_v1')`;
  defaults em `GLASS_DEFAULTS` (liquidGlass.ts). Opacidade do tinte = var `--pw-glassbg`
  (consumida no background das classes de vidro em components.css).
- Sliders "principais" mudam só ATRIBUTOS do filtro (tempo real, barato); os de física
  reconstroem os canvases (debounce 250ms). Resize de painel → rebuild (120ms).
- O vidro só "aparece" quando algo passa por baixo (pista/linhas). Painel parado sobre
  fundo vazio fica escuro mesmo — é esperado.
- ⚠️ **PERFORMANCE: o filtro físico só escala em telas com POUCOS painéis.** Cada
  `backdrop-filter:url(#...)` é recomposto por frame quando há animação na tela; com muitos
  painéis (a AI tinha 7) + animações contínuas, o FPS da tela inteira cai. Telas de layout
  denso usam **vidro LEVE**: marque o wrapper com **`.pw-liteglass`** → o motor pula o filtro
  SVG (`eligible()` via `closest`) e o CSS aplica `blur(16px)` (regra `.pw-liteglass .pw-glass2`).
  Hoje só a **AI Engineer** é lite. NUNCA diagnostique esse custo zerando os sliders do meno
  Settings — o filtro continua aplicado no pipeline; o teste real é lite vs físico.
- ⚠️ Pegadinha: elemento de vidro que nasce SEM layout fica registrado como unidade
  nula até o ResizeObserver vê-lo com tamanho — guards `if (!u)` no applyLiveParams/
  scheduleRebuildAll são necessários.

## 3. Câmera e carro (`InteractiveTrack.tsx`)

- **Viewport imperativo**: o `<g>` do SVG NÃO é controlado pelo React; `vpr` (ref) é a fonte
  da verdade e `writeVp()` escreve o atributo. Estado `vpUi` só espelha p/ UI discreta.
- **`follow`**: câmera presa no carro. **`followX`** = âncora horizontal (fração do palco):
  `0.5` na Lap, `0.22` em Telemetry/Comparison (centro da área visível à esquerda do painel).
  ⚠️ O recentro vale em **QUALQUER zoom** (sem condição de z mínimo) — o tracking no carro
  é SEMPRE mantido, inclusive no zoom out máximo (z=1). CONFIRMADO pelo usuário
  (2026-06-12): um "fade" da âncora perto de z=1 foi testado e REJEITADO (o mapa deslizava
  de um jeito estranho no zoom out) — não recriar.
- **Default das telas: `initialZoom={16}`** (decisão do usuário 2026-06-12: abrir já
  PRÓXIMO do carro, como o GO Fast — slider a ~72%). `Z_MAX = 48`. Slider em escala log.
- **Players começam em `t=0` (largada) no load** — `tRef = useRef(0)` em TODAS as telas.
  O carro/cursor só pula p/ um trecho por CLIQUE do usuário (curva/setor/replay/deep-link
  `pendingFocus`). Na Lap, a pior curva continua ATIVA por padrão (card de insight), mas
  sem mover o player.
- **Carro**: sprites `<img>` de SVG (re-rasterizados pelo navegador no tamanho de LAYOUT —
  anti-serrilhado); por frame só `translate3d+rotate` (textura 1:1; **nunca** `scale()` na
  transform). `CAR_M = 7.5` (≈1.7× o físico — proporção da referência), piso `CAR_MIN_PX = 11`.
  Freada = troca de opacity entre 2 sprites. Fantasma = 3º sprite cinza (`setT2`).
- Pan manual desabilitado com `follow` (zoom só), como o GO Fast.

## 4. Camadas do mapa

- **Pista**: polígono do asfalto real (`track_edges` do payload; geometria OSM gerada por
  `tools/build_track_from_osm.py` — ver HANDOVER §3). **Sem bordas**.
- **Linha da volta**: na Lap/Comparison é GRADIENTE contínuo vermelho→branco→verde
  (`deltaGradientSegments` em `lib/track.ts`; sensibilidade = `1.6*sd`); na Telemetry é a
  linha accent. Espessura constante em px (`vector-effect: non-scaling-stroke`).
- **Fantasma (média)**: tracejado branco 2.6px `"5 6"` — é a LINHA DE COMPARAÇÃO da
  referência (não confundir com borda de pista).
- **Bandeirinhas de freada**: polygons vermelhos nos onsets reais do canal brake
  (`markers` prop; calculados na tela). Balões de curva: divs HTML reposicionadas POR FRAME
  (acompanham a câmera) — só com `hideCorners` desligado.

## 5. Painel de canais (Telemetry)

- **REGRA DE OURO: nunca esticar o viewBox para dar zoom.** Os paths são RE-AMOSTRADOS
  por janela (`charts` memo: viewBox SEMPRE `0 0 600 100`). Esticar deformava traços e
  dasharrays (o "serrilhado" reclamado).
- Bolhas de valor no cursor (`.pw-bub` main+ghost): transform por frame, texto a 10 Hz.
  Eixos à direita (`def.axis`), label-chip no canto, ghost pontilhado `.pw-ghostline`.
- Navegador de segmentos ‹All/Tn/Sn› recorta `zoom {lo,hi}` — mesma janela usada pelo
  clique no minimapa da Lap (`lib/bus.ts` → `takePendingFocus`).
- **Aba Tyres** (mesmo painel): DOIS carros (Melhor vs Média) usando o BLUEPRINT do mapa
  (`window.PORSCHE_MARK`, viewBox 600×600, wireframe via `dangerouslySetInnerHTML` num `<g>`).
  Bandas térmicas = `<rect>`s DENTRO do svg sobre as rodas do desenho (overlay HTML
  desalinha — §11); temp DENTRO da banda (`paint-order:stroke` p/ ler sobre a cor); fora,
  só a pressão. Atualização imperativa a 10 Hz via `[data-ty]`/`[data-tyb]`/`[data-typ]`
  prefixados `ref-`/`media-`. Posição das rodas vem de `lib/tyreLayout.ts` — chip
  "Ajustar posição" abre 6 sliders ao vivo (localStorage `pw_tyres_v1`);
  **`TYRE_DEFAULTS` foi CALIBRADO pelo usuário (2026-06-12) — não "corrigir" sem pedido.**
  O mapeamento O/M/I por LADO da roda é do backend (`webdata._tyres`); carro sem canais
  de pneu → `tyres: null` → aba desabilitada.

## 6. Pods (`DriverPod.tsx`)

- Markup com contrato **`[data-f]`**: `thr/thrbar/brk/brkbar/spd/gear/rpm/wheel/steerarc`.
  A tela cacheia os elementos (1×/render) e atualiza imperativamente: barras/volante por
  frame, textos a 10 Hz.
- Volante: `rotate(−steer)` (iRacing: positivo = esquerda). Anel externo: arco ∝ |steer|
  (`pathLength=100`, dasharray), espelhado p/ o lado da curva via `scale(-1 1)`.

## 7. Posições dos painéis (components.css)

- Painel direito: `.pw-telpanel{right:22px; width:min(58%, 830px)}`.
- **Dock minimapa+slider é ANCORADO à borda do painel**:
  `right: calc(min(58%, 830px) + 46px)`, largura 180, bottoms 152/98.
  ⚠️ Se mudar a largura do painel, atualizar TRÊS lugares: `.pw-telpanel`,
  `.pw-minimap.pw-mm-tel` e `.pw-maplayer.pw-tel .pw-zoompill` — e reavaliar `followX`.
- Offsets verticais padrão: conteúdo começa em `top:118–122` (limpa nav+abas) e termina
  em `bottom:56` (statusbar 42px + margem).

## 8. Time/Distance e gap em metros

- Payload: `ref_time[]` (tempo da melhor até cada ponto) e `delta[]` ⇒ `tMed = ref_time+delta`.
- **Distance**: fantasma no MESMO ponto da pista (compara linhas). **Time**: inversão
  binária de `tMed` no instante τ ⇒ posição real da média (gap na pista).
  `gapM = (tA − tB) × comprimento` (`eixoDist` final).

## 9. Checklist de verificação (preview headless)

A janela do preview fica `document.hidden` (sem screenshot/rAF; timers ≥1s). Posições e
`el.click()` **não bastam** — duas falhas reais passaram por eles:
1. **Oclusão**: `getComputedStyle(...).backgroundColor/backgroundImage` de TODOS os
   ancestrais/camadas acima do alvo — nada opaco no caminho.
2. **Hit-test**: `document.elementFromPoint(cx, cy)` nas coordenadas REAIS de cada controle —
   o retorno deve ser o alvo (ou descendente). `elementsFromPoint` mostra a pilha.
3. Âncora da câmera: centro do carro ≈ `followX × innerWidth` (±2px) em z=1, no z
   inicial (16) e num z médio — o tracking vale em QUALQUER zoom.
4. **CSS animations ficam PAUSADAS na janela oculta**: a animação de entrada do `.screen`
   congela um `transform` no meio (vira containing block p/ `fixed` e desloca tudo ~6px).
   Rodar `document.getAnimations().forEach(a => a.finish())` ANTES de medir layout/fixed.

## 10. Pegadinhas conhecidas

- Classes novas → prefixo **`pw-`**. A classe `bars` colidiu com o `.bars` do design system
  (gráfico semanal, height fixa) e esticou os pods p/ 177px.
- `focusCorner` null no MOUNT não pode resetar a câmera (mataria o `initialZoom`) — só
  reseta quando o foco É DESFEITO (ref `hadFocus`).
- Erros `[vite] Failed to reload …` no console do preview costumam ser estados
  intermediários de HMR entre duas edições — confirmar com reload + `tsc` verde.
- uvicorn (8600) roda SEM `--reload`: reiniciar o processo após mudar `src/*.py`.
- `track.json`/`webdata` são lidos por request — mudança na pista NÃO exige restart.

## 11. Telas de cards (Stint / Dashboard / AI Engineer)

Sem mapa de fundo (como no GO Fast), mas com o MESMO vidro. Padrões e pegadinhas:

- **Fundo p/ o vidro**: `.pw-pagebg` com gradientes radiais suaves, `position:fixed;
  z-index:-1` DENTRO do stacking context da tela (`.pw-stint/.pw-dash/.pw-ai` têm
  `position:relative; z-index:0`). Nunca `absolute` com inset negativo (vaza no
  scrollHeight da stage) e nunca portal no body (o bg do `.app` é opaco e cobriria).
- **Viewport lock**: `.screen.on:has(> .pw-x){height:100%}` trava a tela; o que rola é
  interno (tabela do Stint). Padding `10px 22px` alinha carinfo/pods nas MESMAS coords
  do fullmap (`top:118 / right:22`) — trocar de aba não "pula" nada.
- **Cabeçalho próprio**: as 3 telas estão em `SELF_HEADED` no `App.tsx` (sem scr-head).
- **Chrome em vidro é GLOBAL** (nav/abas/status) — regra única em components.css.
- **Pods no Stint**: mesmos `[data-f]` das telas de mapa, rodando a volta de ref em loop;
  `onOpen` no DriverPod abre o popup "Comparison" (a seta `.pw-podexp` tem 19px para NÃO
  crescer a linha — altura do pod deve bater com o fullmap, 63px).
- **AI · replay da curva**: zoom/pan com **viewBox IMPERATIVO** (`writeVb()`); o React
  NÃO controla o atributo — senão qualquer re-render (chat!) reseta o enquadramento.
  Dots/estrada em unidades do mapa (escalam com zoom); traçados `non-scaling-stroke`.
- **⚠️ `insights[].apex_pct` vem em PORCENTAGEM (0–100)**; `corners[].apex_pct` em
  fração (0–1). Normalizar (`v > 1.5 ? v/100 : v`) antes de posicionar/zoomar.
- **Pins sobre SVG `meet`**: nunca posicionar overlay HTML por `%` (letterbox desalinha);
  desenhar os pins DENTRO do svg (círculos em coordenadas da pista) — ver inset do AI.
- **Evidência por curva (gauges do AI)**: definições fiéis ao `signatures.py` (freada =
  pico de desaceleração; trail = % do turn-in com freio; grip = vmin; rotação = volante
  médio, menor é melhor), calculadas client-side dos canais ref/media por janela
  `apex ± 0.045`.
