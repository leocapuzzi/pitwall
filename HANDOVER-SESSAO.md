# HANDOVER — PitWall (rebuild da UI em React) · atualizado 2026-06-11

> Ponte para a próxima sessão do Claude. **Leia também:** as memórias do projeto (índice em
> `MEMORY.md` — em especial `pitwall-frontend-react.md`, `pitwall-projeto.md`,
> `iracing-data-api-bloqueada.md`, `pitwall-coach-ia-decisao.md`,
> `preview-verificacao-oclusao-hittest.md`) e o **guia de manutenção da UI em
> `frontend/DESIGN-UI.md`** (arquitetura fullmap/liquid glass, knobs, regras e pegadinhas —
> LER ANTES de mexer nas telas de mapa).

## 0. Onde estamos / como rodar
- **Caminho do projeto:** `C:\Users\leoca\Documents\Claude\PitWall` (a sessão pode abrir com cwd
  no path VELHO do iCloud, vazio — trabalhar SEMPRE no path novo, absoluto).
  GitHub: `github.com/leocapuzzi/pitwall` (main; tudo pushado até `994804c`).
- **Stack:** backend Python/FastAPI (motor de análise intacto) + frontend React+TS+Vite em `frontend/`.
- **Rodar (dev):**
  - Backend: `.venv/Scripts/python.exe -m uvicorn server:app --app-dir src --port 8600`
    (⚠️ SEM --reload — reiniciar o processo após mudar `src/*.py`; ele costuma estar morto no
    início da sessão: checar `Get-NetTCPConnection -LocalPort 8600`).
  - Frontend: `npm --prefix frontend run dev` (Vite 5173, proxia `/api`→8600). Preview: config
    "frontend" no `.claude/launch.json` (caminhos absolutos).
  - Build/typecheck: `npm --prefix frontend run build` (usar após CADA mudança).
- `.ibt` reais em `~/Documents/iRacing/telemetry`; fallback `samples/`. Node v22, venv ok.
- ⚠️ Preview headless: janela fica `document.hidden` (sem rAF/screenshot; timers ≥1s). Verificar
  por DOM com o checklist do DESIGN-UI.md §9 (oclusão + `elementFromPoint`).

## 1. ✅ CONCLUÍDO (e APROVADO pelo usuário)
**Produto no padrão GO Fast nas 3 telas de mapa, com dados 100% reais:**
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
1. **Stint, Dashboard e AI Engineer ainda no layout ANTIGO de cards** — não têm mapa (no GO Fast
   também não), então ficaram fora do fullmap. O usuário pediu "todas as melhorias nas demais
   páginas": falta um **passe de estilo próprio** nelas (cards em vidro/`.pw-glass2`, tipografia
   e espaçamentos coerentes com as telas novas). Discutido e adiado — é o próximo natural.
2. **Comparison: seleção LIVRE de voltas** (volta N vs M, inclusive de outra sessão) — pede
   endpoint por volta no backend (canais de UMA volta arbitrária) + UI de seleção (fluxo B do
   design handoff). Maior valor de produto.
3. **Selector de SESSÃO na SessionStrip** (hoje fixa na 1ª com ≥2 voltas limpas;
   `useSession.load()` já existe — falta a UI).
4. **Telemetry**: aba "Tyres" é stub; canal hide/reorder não implementado; o toggle
   Segments/Sectors hoje só alterna o navegador de segmentos (não muda os gráficos).
5. **Dashboard**: donut "uso por carro" entre sessões (pede endpoint leve de sumários — ler só o
   header YAML de cada .ibt, sem análise completa).
6. **AI Engineer**: chat liga no coach quando o pool do MAX abrir (~15/06; design pronto — ver
   memória `pitwall-coach-ia-decisao`). Hoje responde honestamente "em breve".
7. **Novas pistas**: por circuito novo, rodar o pipeline OSM (Overpass POST com User-Agent +
   `tools/build_track_from_osm.py <slug> <width_m>`; precisa de um `.track.json` v1 com uma
   volta de referência — processo no DESIGN-UI.md/HANDOVER antigo no git).
8. Detalhes GO Fast não replicados (menores): tooltip "BRAKING" ao passar pela zona de freada,
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
1. **Passe de estilo glass em Stint/Dashboard/AI** (pendência nº1 — fecha a consistência visual
   do app inteiro). Reusar `.pw-glass2`/tokens; sem mapa de fundo, manter o bg atual.
2. Ou, se o usuário preferir valor de produto: **seleção livre de voltas na Comparison**
   (backend: endpoint por volta; UI: fluxo B do design handoff).
3. Validar no preview com o checklist do DESIGN-UI.md §9 e commitar no fluxo
   `git add -A; git commit; git push` (identidade local já configurada; gh CLI NÃO instalado).
