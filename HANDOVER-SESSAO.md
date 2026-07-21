# HANDOVER — PitWall (rebuild da UI em React) · atualizado 2026-07-20

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
**Sessão 2026-07-21 — BLOCO 2 do CODEX REVIEW "Confiança do motor":**
Continuação do plano (ver `CODEX REVIEW/` + parte 7 abaixo). Implementado e verificado
(backend por smoke test/API; frontend por build + DOM, sem erros de console):
- ✅ **A2 — validade de volta considera FORA-DE-PISTA.** `analysis.py`: `LapInfo` ganhou
  **`off_track`** (fração de amostras com `PlayerTrackSurface < 0.5` — 0=OffTrack/-1=NotInWorld —
  acima de `_OFF_TRACK_FRAC=0.5%`; canal ausente, ex.: CSV do G61, não marca). **`best_lap`**
  (referência) e **`clean_laps`** (média) agora PREFEREM voltas sem excursão, com **fallback**
  para as válidas se TODAS tiveram excursão (não zera a média). `webdata`: linha do stint ganhou
  **`off`**; `Stint.tsx`: tooltip "off-track (not used as reference/average)" + ícone âmbar na volta.
  Efeito: uma volta com saída/corte não vira mais a referência. Verificado nos samples (off_track
  computa sem crash). ⚠️ efeito pleno só aparece com sessão LOCAL de voltas válidas (a máquina de
  teste só tem G61 virtual + samples inválidos).
- ✅ **A3 — comparação só na MESMA pista.** `webdata.build_compare_payload`: resolve o trackId de
  cada lado (local via `ibt_reader.session_summary`; G61 via `session_summary_for_lap`) e **rejeita**
  pista/layout diferente com mensagem clara ("Pick laps from the same circuit — A is at … and B is
  at …"). **Carro DIFERENTE segue permitido** (feature dos pods). Se um lado não resolve o trackId,
  não bloqueia. Verificado no `/api/compare`: Rudskogen×Winton → 400; Rudskogen×Rudskogen → OK.
  O erro sobe pro picker sem derrubar a tela (o `setCompare` do useSession já trata).
- ✅ **B4 — dado velho não vence mais.** `useSession.ts`: contador de geração **`gen`** — cada
  `boot`/`loadSession`/`setCompare`/`resetCompare` pega `++gen` e só comita `set(payload)` se ainda
  for a geração mais recente (troca rápida de sessão/comparação não deixa a resposta antiga sobrescrever
  a nova). Verificado: boot OK, sem erros.
- 🔜 Falta do plano: **Bloco 3** (rede de segurança leve) — smoke test do sample, lint substantivo,
  guard loopback + limites de arquivo/chat, `.bat` PID-aware, comprimir assets. E o passe de strings
  PT sobrando na AI Engineer ("Tempo morto", "Raio-X das perdas", "s / volta").

**Sessão 2026-07-20 (parte 7) — CODEX REVIEW triado + BLOCO 1 "Honestidade" implantado:**
Um review externo (pasta `CODEX REVIEW/` na raiz — 01-FULL-AUDIT / 02-VALIDATION-EVIDENCE /
03-PRIORITIZED-ROADMAP, read-only) foi verificado ponto a ponto contra o código atual. Plano
apresentado ao Leo separando ACATAR / ACATAR-ENXUTO / NÃO-ACATAR (filtro: bugs de confiança do
dia a dia SIM; blindagem "de empresa" — CI/tipagem total/pyproject/a11y total/portabilidade —
enxugar/adiar, é ferramenta pessoal local). Leo aprovou começar pelo **Bloco 1**. Implementado e
validado no app real (8600, build novo; verificação por DOM — janela oculta não tira screenshot):
- ✅ **A1 — estados honestos da sessão VIRTUAL do Garage61 (A=B / 1 volta).** Backend
  (`webdata._assemble_payload`) passou a marcar no `contexto`: **`fonte`** ("garage61"|"local"),
  **`hasStint`** (bool) e **`abEqual`** (A e B são a MESMA volta — `sig_fast is sig_slow` OU delta≈0).
  `Dashboard.tsx`: "on disk" só conta locais (**"2 on disk · 8 via Garage61"**, era "10 no disco");
  pill de voltas e donut viram "Single Garage61 lap" p/ sessão virtual. `AIEngineer.tsx`: com
  `abEqual` esconde o texto "analisei suas 0 voltas", o Recovery plan, o Raio-X e as NOTAS
  (scorecard) — troca por avisos "pick a lap in pod B"; `Avg Δ/lap = —`; `buildFacts` manda
  `comparison_available:false`. Comparação real (`abEqual:false`, testado no /api/compare, Δ −2.65s)
  restaura a tela normal (branch original intocado).
- ✅ **A4 — "Waiting for session" preso.** `App.tsx` calcula status real → `StatusBar text=` (rodapé
  "Ready · pista · carro") e `SessionStrip status=` (aba "Session ready"); `Chrome.tsx` usa o prop.
- ✅ **A5 — deps faltando** no `requirements.txt`: **`requests`** e **`PyYAML`** (eram importados e
  não declarados — `git clone` limpo quebrava). `pyarrow` fica p/ quando o histórico (store.py) ligar.
- ✅ **B6 — Garage61 não some mais calado.** `server.py` `/api/sessions`: `except:pass` → loga +
  `garage61.note_error()`; novo **`GET /api/g61/status`** `{available,error}`; `garage61.py` ganhou
  `last_error/note_error/clear_error`; `SessionMenu.tsx` mostra banner "Garage61 unavailable" no erro
  (oculto quando saudável — testado). `api.ts`: `getG61Status()`/`G61Status`.
- ✅ **B1 — README/empty-state honestos.** README não promete mais que `samples/` gera sessão (eles
  FALHAM — "sem voltas válidas") e atualiza o "Estado" (Garage61+Grok integrados, iRacing ainda
  bloqueada). Vazio no boot (`useSession`) e no `SessionMenu` orientam (Alt+L / token do G61).
- ⚠️ Sobraram strings PT na AI Engineer NÃO tocadas (fora do Bloco 1): "Tempo morto", "Raio-X das
  perdas", "s / volta". Limpar num passe rápido depois.
- 🔜 Blocos seguintes do plano (aprovados no conceito, ainda NÃO feitos): **Bloco 2** confiança do
  motor — A2 validade real de volta (usar `PlayerTrackSurface`/`IsOnTrack`, JÁ gravados, p/ fora-de-
  pista/incidente não virar referência; `analysis.py:87` hoje só checa completa+pit+tempo>0), A3
  forçar mesma pista+carro na comparação no backend (regra travada do PLANO §12, hoje `server.py`
  aceita qualquer par), B4 guard de dado velho ao trocar sessão (useSession sem AbortController/geração);
  **Bloco 3** smoke test do sample + lint substantivo + guard loopback/limites + bat/assets.

**Sessão 2026-07-20 — TRACK MAPS OFICIAIS implantados no Windows (doc: `TRACK-MAPS.md`):**
- A pesquisa foi feita numa sessão paralela no Mac (2026-07-11), mas NADA tinha chegado aos
  arquivos do projeto — só a pasta de cópias `_novos-track-maps/`. Nesta sessão tudo foi
  implantado e re-validado no Windows:
- ✅ Novos nos destinos: `TRACK-MAPS.md` (raiz), `tools/gerar_indice_trackmaps.py`,
  `tools/casar_svg_oficial.py`, `tracks/iracing_track_maps_index.json` (424/424 configs,
  13/13 da temporada). Vendor clonado (esparso) em `..\racing-track-maps-vector\`.
- ✅ Modificações re-aplicadas: `src/webdata.py` (payload prefere anéis `official` como
  `track_edges`), `tools/nova_pista.py` (etapa v3 chama o fit automaticamente),
  `tools/gerar_calendario.py` (`thumb_oficial()`, prioridade real → oficial → OSM →
  placeholder), `requirements.txt` (+svgpathtools, instalado no venv).
- ✅ Fit de Winton re-rodado no Windows: média 1,09 m · p95 1,93 m · 100% da volta no anel
  (idêntico ao Mac). Calendário re-gerado: ZERO placeholders (Oran Park via silhueta do "8").
  15 thumbs conferidos visualmente; `/api/calendar` validado servindo `oficial_*`.
- ✅ **Asfalto oficial VALIDADO no player real** (mesmo sem `.ibt` na máquina): como o
  acesso à telemetria do Garage61 FOI LIBERADO (voltas vêm com `canViewTelemetry=true`),
  uma volta real de Winton foi puxada e servida como sessão sintética por um servidor de
  validação fora do produto (monkeypatch do ibt_reader; script no scratchpad da sessão
  2026-07-20). Todas as telas abriram: Telemetry fullmap com o asfalto oficial + traçado
  dentro da faixa + replay, Lap Analysis com numeração de curvas, Stint, e o Dashboard
  com o SeasonStrip mostrando os thumbs oficiais nos cards. Front intacto (zero mudança).
- 💡 Ideia derivada (decisão do Leo pendente): "abrir volta do Garage61 como sessão" no
  próprio app (hoje o G61 só entra como referência na Comparison, ancorado numa sessão
  local). A validação provou que o pipeline inteiro funciona com uma volta G61.

**Sessão 2026-07-20 (parte 2) — PODS A/B GLOBAIS (comparação livre em TODAS as telas):**
Decisão do Leo: clicar no pod "Sua melhor" (A) abre MINHAS voltas (sessões locais da
mesma pista+carro OU minhas voltas do Garage61); clicar no pod "Média" (B) abre minha
média (se houver limpas) OU uma volta do Garage61 (equipe). A troca re-analisa TUDO.
- ✅ Backend: `webdata._assemble_payload()` extraído (payload a partir de 2 conjuntos de
  sinais); `build_compare_payload(path, a, b)` com descritores
  `{"type":"local","path","lap"}` / `{"type":"g61","lapId"}` / `{"type":"media"}`;
  endpoint `GET /api/compare?path&a&b` (JSON url-encoded). `garage61.lap_signals()`
  (extraído do lap_payload) + `list_my_laps()` + endpoint `/api/g61/mylaps`.
- ⚠️ PEGADINHA G61: o filtro de voltas próprias é o LITERAL `drivers=me` — passar o
  próprio id/slug devolve VAZIO (testado). E sem filtro `drivers`, /laps devolve pilotos
  PÚBLICOS do mundo todo (não só a equipe), melhor por piloto com `group=driver`.
- ✅ Front: `PodPicker.tsx` (novo, reusa classes do picker da Comparison); useSession
  ganhou `compare/setCompare/resetCompare/applyPodPick` (payload inteiro trocado via
  /api/compare; `load()` reseta p/ padrão); pods clicáveis em Telemetry + Lap Analysis
  (`ctx.refName/refSub/compSub` novos no contexto); DriverPod ganhou `openTitle`.
- ✅ Validado no app real (server sintético 8601): você (V1 local) vs Jussi (G61) na
  Telemetry (delta +0.56, fantasma no mapa, canais tracejados) e você (G61 1:31.727) vs
  Jussi (G61) na Lap Analysis (setores + insight de curva reais). Pneus/fuel nulos p/
  fonte G61 (CSV tem só 18 canais — sem pneu/combustível; painel Tyres avisa).
- NOTA semântica: o coaching (insights) descreve o lado B em relação ao A (herdado do
  par melhor/média). Com B mais rápido, os insights apontam onde B perde para A; o
  delta/setores continuam legíveis nos dois sentidos. Se o Leo quiser "coaching sobre
  MIM contra o mais rápido", inverter a direção é refino futuro.
- Front continua SEM mudança nas telas Stint/Comparison/AI (consomem o payload trocado;
  Stint segue ancorada na sessão local — tabela de voltas não muda com o compare).

**Sessão 2026-07-20 (parte 3) — SESSÕES VIRTUAIS do Garage61 (app abre SEM .ibt):**
Motivação: o Leo abriu o `abrir_pitwall.bat` e viu "Sessão sem voltas válidas" (máquina
sem telemetria; samples quebrados). Agora as MINHAS voltas do G61 viram sessões:
- ✅ `garage61.list_my_sessions()`: pistas recentes de `/me/statistics` → melhor volta
  minha por pista+carro (com telemetria) → entradas `{file: "pista|carro|tempo",
  path: "g61:<lapId>"}` somadas ao `/api/sessions` (cache 120 s). No Leo: 8 sessões
  virtuais (Winton FF1600 1:27.795, Rudskogen, VIR, Lédenon, Oulton FF1600 e Porsche
  992, Navarra BMW M2, Interlagos W13).
- ✅ `webdata.build_g61_session_payload()` (via `/api/session?path=g61:<id>`): A = a
  volta, B = a mesma volta ("Comparar com…" no pod B convida a escolher); resumo via
  `garage61.session_summary_for_lap()` (mapeia track/car g61 → IDs iRacing pelo
  platform_id reverso) → pista fixa/mapa oficial/curvas ancoram (Winton: 439, official
  1600 pts, 12 curvas). `_assemble_payload` tolera df/sessao None (sem stint/fuel/
  setores oficiais — `sector_times` cai em terços). `build_compare_payload` aceita base
  `g61:` e descritor local com path `g61:`.
- ✅ Front: SessionMenu mostra "pista / Garage61 · carro · tempo"; `applyPodPick` com
  padrões da sessão virtual (a própria volta nos 2 lados); PodPicker esconde média/
  sessões locais quando a base é virtual. Validado no app real (8600): boot caiu numa
  sessão virtual sozinho (Rudskogen), pods "Leonardo Capuzzi (G61)" + "Comparar com…".
- Limitações da sessão virtual: sem pneus/combustível/stint/média (CSV de 18 canais,
  1 volta), setores genéricos em terços. `/api/laps` não aceita path g61: (picker
  local da Comparison não lista voltas da sessão virtual — usar os pods).
- 🐛 CORRIGIDO ("fica em Carregando sessão…"): o boot varria TODAS as sessões atrás de
  ≥2 voltas limpas — como sessão G61 nunca tem limpas, baixava as 8 voltas inteiras
  (~40 s) antes de abrir. Agora a varredura de limpas é SÓ nas locais (com reuso do
  payload no fallback) e as virtuais entram como último fallback (para na 1ª que abre).
  Backend: `_lap_meta`/`lap_signals` cacheados (o boot pedia a mesma volta 2-3×) e
  `list_my_sessions` paralelizado (ThreadPoolExecutor). Boot frio: ~40 s → ~5 s.

**Sessão 2026-07-20 (parte 6) — VOZ do engenheiro (KittenTTS) + APP TODO EM INGLÊS:**
Pedido do Leo: usar o KittenTTS como voz do engenheiro. Como é só inglês, o app inteiro
passou para inglês (UI + textos do motor + coach).
- ✅ **Voz (offline):** `src/tts.py` (KittenTTS nano ONNX, ~25 MB, CPU; voz `expr-voice-2-m`,
  trocável em secrets.toml `tts_voice`). PEGADINHA no Windows: além de `EspeakWrapper.set_library`,
  é OBRIGATÓRIO setar `ESPEAK_DATA_PATH`/`PHONEMIZER_ESPEAK_LIBRARY` do espeakng_loader —
  sem o data path o espeak-ng ABORTA o processo (matava o uvicorn). Endpoints
  `GET /api/tts/status` e `POST /api/tts {text}` → WAV 24 kHz. Carrega 1× (~2 s), ~0,6-1,5 s/frase.
- ✅ **Chat com voz:** AIEngineer fala cada resposta do coach (auto-speak com toggle
  "Voice on/off" + botão de alto-falante por bolha; para o áudio anterior ao tocar outro).
  Validado no app: coach respondeu em inglês e o /api/tts devolveu audio/wav em 613 ms.
  (Autoplay do 1º áudio pode exigir 1 clique — política do browser; o botão resolve.)
- ✅ **Tradução EN completa** (6 subagentes p/ as telas + edições diretas): todas as 6 telas,
  componentes (SessionMenu/SettingsMenu/PodPicker/Chrome/DriverPod), libs (api/useSession),
  e o BACKEND que gera texto: `webdata` (labels refName/referencia/compSub, erros),
  `signatures._coach` + `_FLAG_TXT`, `coaching._RX` + insight what/phase (agora 'entry'/'exit'),
  `garage61` (erros), `coach.py` persona (+ regra de texto puro). Corner name default
  virou **"T{n}"** (era "Curva {n}") em track_model + corners. Requirements: +kittentts,
  soundfile, espeakng-loader. Deps já instaladas no venv.
- ⚠️ corners.py tem `_coach`/`corner_table` LEGADOS em PT — NÃO chegam à UI (o vivo é
  signatures.py); deixados como estão. Comentários de código seguem em PT (intencional).
- Pendente/refino: título do app e textos de marca; revisar frases longas do coach no ar
  com dados reais (a sessão de teste era virtual G61 = delta zero).

**Sessão 2026-07-20 (parte 4) — 7 PISTAS CRIADAS a partir do Garage61 + carro no picker:**
- 🐛 Os mapas das sessões virtuais degradavam ("traçado = linha do carro, escala errada")
  porque só Winton tinha geometria criada. Causa raiz resolvida: **`tools/nova_pista_g61.py`
  (novo)** — cria a pista usando a MINHA melhor volta do G61 como referência congelada
  (mesmo pipeline v1→v2 OSM→v3 oficial do nova_pista.py; reusa detectar_curvas dele).
- ✅ Criadas: rudskogen (11 curvas; entrou no manifesto, F1600 w3), interlagos_gp (10),
  ledenon (12), vir_north (13), oulton_international (9), oulton_fosters (8),
  navarra_speed (12). Fits do mapa oficial: Oulton ×2, VIR e Fosters = 100% da volta no
  anel; Lédenon 92%; Interlagos 88% (volta de W13 usa MUITO kerb); **Navarra 75% → bloco
  `official` REMOVIDO** (ficou só OSM; refazer fit com .ibt local: casar_svg_oficial).
  Calendário re-gerado: 7 thumbs promovidos a centerline real.
- ✅ Seletor de CARRO nos pickers dos pods (pedido do Leo): `garage61.list_track_cars`
  (+`/api/g61/cars?trackId&mine`) → <select> no PodPicker (A: meus carros com contagem;
  B: carros da atividade recente da pista + o carro da sessão sempre injetado na lista).
  Trocar o carro refaz a lista de voltas. Permite comparar até carros DIFERENTES.
- 🐛 Pegadinha Windows corrigida nos dois nova_pista*: `subprocess.run(text=True)` decodifica
  em cp1252 e explode com acentos do output → `encoding="utf-8", errors="replace"`.
- Quando vier um .ibt local dessas pistas, rodar `nova_pista.py <pista> --force` promove
  a referência p/ a volta local (e refaz OSM+oficial).

**Sessão 2026-07-20 (parte 5) — COACH DE IA LIGADO (Grok/xAI) no chat do AI Engineer:**
Mudança de rumo da Fase 3: o Leo trouxe uma chave da API do xAI (o plano MAX/Agent SDK
morreu). Design original mantido: IA = só a VOZ; o motor determinístico mede tudo.
- ✅ `secrets.toml`: `grok_api_key` (preenchida pelo Leo) + `grok_model` opcional
  (padrão `grok-4.20-0309-non-reasoning` — rápido p/ chat; lineup em /v1/models).
- ✅ `src/coach.py` (novo): persona engenheiro de pista + regras (só números do JSON,
  máx 2-3 pontos, 2-6 frases, TEXTO PURO sem markdown) → POST api.x.ai/v1/chat/completions.
- ✅ `server.py`: `GET /api/chat/status` e `POST /api/chat {facts, messages}` (histórico
  limitado a 12 msgs, 4k chars cada).
- ✅ `AIEngineer.tsx`: `buildFacts(payload)` monta os fatos DO QUE ESTÁ NA TELA (contexto
  A/B, scorecard com nota de escala 0..1, setores, análise por curva, insights, voltas)
  — funciona com compare dos pods e sessão virtual do G61; `send()` roteia p/ o Grok
  com fallback na análise local (templates) em erro/sem chave; chip "Grok" + "coach de
  IA online" quando disponível.
- ✅ Validado ponta a ponta NO APP (sessão Rudskogen): pergunta real → plano citando
  coasting 4,5 s/volta, trail 0.233 e curvas C1-C10 do modelo. Resposta em texto puro.
- Refinos futuros: streaming (SSE), `pitwall_pilotagem.md` como base RAG no system
  prompt, e o debrief automático ao abrir a sessão (o design da Fase 3 previa).
- `_novos-track-maps/` pode ser apagada quando o Leo quiser (tudo implantado; é só cópia).

**Sessão 2026-06-12 (parte 4) — FLUIDEZ (tudo aprovado: "agora ficou top"):**
- ✅ **Pods** (Telemetry/Lap/Comparison): barras throttle/brake saíram do bloco de texto
  10 Hz → atualizam TODO frame com interpolação (transform); textos a ~15 Hz.
- ✅ **Física REAL do play**: o player avançava fração de DISTÂNCIA linear no tempo (carro
  na velocidade MÉDIA — acelerado nas curvas, lento nas retas; usuário notou na T7). Agora
  avança TEMPO real e converte p/ distância (`sampleAt(ref_time)+dt → invTime`); clock = tempo
  real na posição. Telemetry/Lap/Comparison (lado B) + pods do Stint.
- ✅ **AI Engineer travada — CAUSA RAIZ = vidro físico** (commit b5ca315). Antes tentei (e
  NÃO bastou): reservar altura do typewriter, cursores por transform, ping finito, dots do
  replay em camada HTML, glow dos gauges sem drop-shadow, barra por scaleX. O que resolveu:
  **modo "lite glass"** — `.pw-liteglass` (wrapper da AI) faz o motor PULAR o filtro SVG
  físico dos 7 painéis → fallback `blur(16px)`. ⚠️ LIÇÃO: liquid glass físico só escala em
  telas com POUCOS painéis (mapas); layout denso (AI) = vidro leve. Zerar os sliders do vidro
  NÃO testa isso (o filtro continua no pipeline).
- Commits: ced0dbc → 0eabe99 → f39fd1e → b5ca315 (todos pushados).

**Sessão 2026-06-12 (parte 3) — SEASON STRIP no Dashboard (calendário da temporada):**
- ✅ **`components/SeasonStrip.tsx` (novo)**: faixa full-width entre o topo e o corpo do
  Dashboard com o calendário 2026 S3 por série — tabs em vidro **MX-5 Cup / F1600 Rookie**
  (persistem em `localStorage pw_cal_serie`), 12 cards com o **traçado real de cada circuito**,
  countdown ao vivo p/ a próxima corrida (componente isolado, re-render 1 Hz só nele),
  card da próxima corrida com glow accent, semanas passadas esmaecidas c/ bandeira,
  badge ✓ cyan = pista criada no PitWall, **timeline com 12 ticks clicáveis + marcador
  "você está aqui"** (progresso por data real), trilho com scroll-snap + setas + wheel
  vertical→horizontal (listener manual passive:false), clique no card abre **modal de
  detalhe em vidro** (thumb grande, corrida 1x, semana, clima, largada, cadência, licença,
  status PitWall). Skeleton enquanto carrega; erro no fetch não quebra o Dashboard (some).
- ✅ **Dados**: `tracks/calendario_2026s3.json` gerado por **`tools/gerar_calendario.py`**
  (semanas transcritas do PDF oficial `2026s3.pdf` págs 65/132; thumbs por pista = melhor
  geometria disponível: centerline real da config se a pista foi criada → senão silhueta
  OSM do **componente conexo principal** do circuito → senão null/placeholder).
  **RE-RODAR o script após criar pistas novas** promove os thumbs ao traçado real.
  Oran Park (F1600 S12) não existe mais no OSM (demolida 2010) → placeholder
  "traçado no seu 1º stint". OSM de **Rudskogen** baixado; IDs novos: Rudskogen=451,
  Oran Park GP=202. Endpoint **`/api/calendar`** no server.py (cache por mtime).
- ✅ Horários exibidos como no PDF (o schedule não declara fuso — sem conversão).
  Datas date-only parseadas como LOCAL (`dt()` no SeasonStrip — UTC voltava 1 dia no BR).
- ✅ Verificado no preview por DOM (checklist §9): hit-test/oclusão ok nas tabs/cards/setas/
  ticks, modal abre/fecha (X e backdrop), troca de série ok, console limpo, 1366×768 sem
  estouro (media query compacta `max-height:820px`). Build verde. ⚠️ preview_screenshot
  não funciona na janela oculta (timeout) — validação visual final é do Leo no app.

**Sessão 2026-06-12 (parte 2) — pistas da temporada 2026 S3 (Global MX-5 Cup) preparadas:**
- ✅ **Calendário cadastrado** em `tracks/temporada_2026s3.json` (manifesto: 12 semanas + Interlagos;
  track_id de cada config vindo de catálogo público e validado — Winton=439 bateu com o .ibt;
  datas das corridas; width_m inicial por pista).
- ✅ **OSM baixado e validado p/ TODOS os circuitos novos** (11× `tracks/_osm_<circuito>_raw.json`,
  via `tools/baixar_osm.py` novo: geocodifica no Nominatim com coordenada de segurança e baixa
  ways highway=raceway no Overpass, POST com User-Agent + validação de cobertura).
  Oulton International e Fosters compartilham `_osm_oulton_raw.json`.
- ✅ **`tools/nova_pista.py` (novo) — pista nova em 1 comando** a partir do 1º .ibt: acha o .ibt
  (mais novo → mais velho até ter volta válida), lê o TrackID e casa com o manifesto, congela a
  volta de referência (`<slug>.track.json` v1), deriva as curvas por curvatura (regiões contíguas
  de mesmo lado, R<150 m, MIN_GAP=20 — consolida sweepers e separa esses) e roda o
  `build_track_from_osm.py` (v2). **Validado contra Winton**: 12 curvas, 11 batendo ±0.009 com o
  modelo oficial (as 2 divergências são os ajustes manuais conhecidos do original); build com
  95.8% da volta dentro das bordas (original: 95.7%). Imprime raio/lado por curva p/ o refino
  manual contra o mapa oficial (numeração é refinável, como foi em Winton).
- ✅ `tools/garage61_tracks.py` (novo): consulta o catálogo de pistas do Garage61 com IDs do
  iRacing (exige `garage61_token` no secrets.toml — hoje VAZIO; por isso usamos catálogo público).
- ⏳ **Falta por pista: SÓ o .ibt. COMBINADO (decisão do Leo, 2026-06-12): quando ele rodar
  numa pista nova (2+ voltas completas; treino vale), ELE AVISA na sessão — aí o Claude roda
  `python tools/nova_pista.py <pista>` e faz a checagem (mapa/curvas no app, numeração vs mapa
  oficial, width nas bordas).** Sem agendamento automático.

**Sessão 2026-06-12 — selector de sessão, Comparison livre, defaults de abertura e aba Tyres:**
- ✅ **Selector de sessão** na tabstrip (pista·carro reais + menu em vidro) — ver §2.2.
- ✅ **Comparison: seleção livre de voltas** (N vs M, entre sessões; picker fluxo B) — ver §2.1.
- ✅ **Defaults de abertura** (pedidos do usuário): mapas abrem PRÓXIMOS do carro
  (`initialZoom={16}`, slider ~72% — "90% de zoom" dele = perto, não visão geral);
  players SEMPRE começam na largada (t=0; pulos só por clique); tracking do follow em
  QUALQUER zoom (um "fade" da âncora perto de z=1 foi testado e REJEITADO — não recriar).
  Fix do anel verde do Sector Comparison (padding lateral compensado).
- ✅ **Aba Tyres da Telemetry** (3 iterações até aprovar) — ver §2.3. Posição das rodas
  CALIBRADA pelo usuário pelos sliders da própria aba e fixada em `TYRE_DEFAULTS`
  (lidos do localStorage do navegador dele via Chrome MCP; override local removido).
- ✅ **Toggle do player mudou de função** (pedido dele): não esconde mais o carro da média —
  os DOIS carros ficam sempre visíveis e o switch alterna o **lock da câmera** entre eles
  (`followCar` no InteractiveTrack; `camB` nas 3 telas fullmap).
- Commits: 1cb6b18 → … → 0754578 → dfe3d71 (Telemetry fechada) → 9b12bdf (lock da câmera);
  todos pushados.

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
1. ~~Comparison: seleção LIVRE de voltas~~ ✅ **FEITO (2026-06-11):**
   - Backend: `/api/laps?path=` (índice leve de voltas p/ o picker) e `/api/lap?path=&lap=N`
     (canais/tempo/linha/setores de UMA volta no grid padrão `A.GRID` — voltas de sessões
     DIFERENTES da mesma pista saem comparáveis ponto a ponto). `webdata.py` ganhou cache
     LRU(3) do .ibt por (path, mtime) — picker/troca de sessão não releem o arquivo.
     Calibração de sinais da volta avulsa usa a MELHOR da sessão (estável).
   - Frontend: `Comparison.tsx` parametrizada por LADOS (`Side` A/B; default = média vs
     melhor, igual antes). Chevron nos rows A/B abre o **picker** (fluxo B do handoff):
     select de sessão compatível (mesmo carro+pista pelo nome do arquivo + guard por
     trackId) → `LapTable` (reexportada do Stint) → Select. Delta/setores/gap/fantasma
     recalculados client-side de `timeArr` A−B (defaults reproduzem `p.delta` ao milésimo).
     Chip "↺ padrão" volta ao média vs melhor.
   - Verificado no preview: cross-session real (média da sessão 00:34 vs Volta 5 da 00:42),
     soma dos setores = Δ total ao centésimo, gap em metros vivo, reset, console limpo;
     `/api/lap` da best = `ref_time` do payload (diff 0).
2. ~~Selector de SESSÃO na SessionStrip~~ ✅ **FEITO (2026-06-11):** aba ativa mostra
   pista · carro reais e abre o menu de sessões (`components/SessionMenu.tsx`, vidro, lista
   com pista/carro/data parseados do nome do .ibt, ativa marcada). `useSession.ts` virou
   mini-STORE com subscribers (todas as telas/chrome veem a mesma sessão; boot único; escolha
   lembrada em sessionStorage `pw_session`). `App.tsx` remonta a tela na troca
   (`key={current}`). Verificado por DOM no preview (hit-test, oclusão, remount, console limpo).
3. ✅ **Telemetry FECHADA (2026-06-12):** toggle Segments/Sectors agora muda também as
   marcas dos GRÁFICOS e do scrubber (curvas vs setores); canais com **ocultar/reordenar**
   (chip "Canais" no painel → switches + ↑↓; persiste em `localStorage pw_channels_v1`,
   `lib/channelPrefs.ts`; guard de último canal visível). Detalhes GO Fast: **chip BRAKING**
   seguindo o carro nas zonas de freada (InteractiveTrack, todas as telas fullmap) e
   **atalhos 🏁〰⏱ na tabstrip** (stint/telemetry/lap). ~~aba "Tyres" é stub~~
   ✅ **Tyres FEITA (2026-06-12, v3 aprovada):**
   payload ganhou `tyres{ref,media}` (12 temps por banda + 4 pressões kPa no grid, inteiros;
   O/M/I já mapeadas pelo LADO da roda no backend — `webdata._tyres`; None p/ carro sem
   canais → aba desabilitada). Painel: **DOIS carros lado a lado (Melhor vs Média)** usando
   o BLUEPRINT do mapa (PORSCHE_MARK em wireframe), bandas térmicas = rects DENTRO do svg
   sobre as rodas do desenho, temp DENTRO de cada banda (contorno via paint-order), pressão
   do lado externo; rampa 40°C azul→130°C vermelho; ao vivo no player (10 Hz, cache
   `[data-ty]`/`[data-tyb]`/`[data-typ]` com prefixo ref-/media-). Posição das rodas
   calibrável (chip "Ajustar posição" → 6 sliders, `lib/tyreLayout.ts`); valores do usuário
   FIXADOS em `TYRE_DEFAULTS {yF:156,yR:435,trackF:93,trackR:93,w:70,h:71}` — não mexer sem
   pedido. PENDENTE da linha: canal hide/reorder; o toggle Segments/Sectors hoje só alterna
   o navegador (não muda os gráficos).
4. **Dashboard**: donut "uso por carro" entre sessões (pede endpoint leve de sumários — ler só o
   header YAML de cada .ibt, sem análise completa).
5. **AI Engineer**: ligar o chat no coach com IA quando o pool do MAX abrir (~15/06; design
   pronto — ver memória `pitwall-coach-ia-decisao`). A ANÁLISE LOCAL (templates rotulados sobre
   o relatório) já cobre perdas/setores/consistência/potencial/combustível; o fallback segue
   honesto ("IA em breve").
6. **Novas pistas (temporada 2026 S3)**: preparação PRONTA (OSM + manifesto + track IDs +
   `tools/nova_pista.py`). Por pista, quando existir um .ibt dela com volta válida:
   `python tools/nova_pista.py <pedaço-do-nome>` → conferir mapa/curvas no app e refinar a
   numeração se necessário. Fonte da verdade: `tracks/temporada_2026s3.json`.
7. Detalhes GO Fast não replicados (menores): tooltip "BRAKING" ao passar pela zona de freada,
   ícones à direita da tabstrip, conteúdo do painel Tyres.

## 3. Contrato de dados ATUAL (payload de `/api/session`)
```
{ contexto{carro, pista, suaMelhor, referencia, deltaTotal, voltasGravadas/Validas/Limpas,
           cornersSrc, fuelFim, fonte("garage61"|"local"), hasStint(bool), abEqual(bool=A é a mesma volta que B)},
  eixoDist[], delta[], ref{throttle,brake,speed,rpm,gear,steer}, media{...},
  track{x,y}(centerline FIXA), racing_line{x,y}(melhor), racing_line_b{x,y}(média),
  track_edges{left{x,y}, right{x,y}}, track_width_m, track_fixed,
  ref_time[](tempo da melhor até cada ponto, p/ modo Time/gap),
  corners[{n,name,apex_pct}], setores[], sectorTimes{labels,ref,media,genericos},
  scorecard{brake_aggression,trail_overlap,circle_use,rotation_eff,coasting_total_s},
  insights[{corner,phase,cost_s,...,what,why,fix,validate}],
  laps[{n,t,valid,pit,off(excursão fora-de-pista),clean,best,s[],fuel}],
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
1. **Coach de IA no chat do AI Engineer** quando o pool do MAX abrir (~15/06) — design
   pronto na memória `pitwall-coach-ia-decisao`; a análise local já cobre o básico.
2. **DECISÕES DO USUÁRIO (2026-06-12):** o Dashboard completo (donut uso-por-carro,
   licenças, histórico de performance) fica para QUANDO a conexão com a API do iRacing
   sair — fazer tudo junto. Pistas novas: ele está na última semana da temporada; quando
   o calendário novo sair, ELE abre uma sessão dedicada indicando as pistas p/ recriar
   (pipeline OSM).
3. Validar no preview com o checklist do DESIGN-UI.md §9 (incl. item 4: finish() nas CSS
   animations antes de medir) e commitar no fluxo `git add -A; git commit; git push`
   (identidade local já configurada; gh CLI NÃO instalado).
