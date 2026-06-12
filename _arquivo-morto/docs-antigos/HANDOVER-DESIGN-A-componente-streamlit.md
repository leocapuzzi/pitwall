# HANDOVER — Design CENÁRIO A: componente HTML dentro do Streamlit

> **Objetivo deste cenário:** redesenhar a interface do PitWall como um **bloco HTML/CSS/JS
> sob medida** embutido no app Streamlit atual. Liberdade visual total **dentro do bloco**,
> mantendo o app rodando com **um clique** (`streamlit run`). É o caminho de **menor
> complexidade de execução** (sem servidor extra, sem Node).
>
> Documento autossuficiente. Companheiro: `HANDOVER-DESIGN-B-livre.md` (versão sem amarras).

---

## 1. Contexto do projeto (resumo)

**PitWall** = ferramenta pessoal de *debriefing* de telemetria do iRacing (lê arquivos `.ibt`,
analisa as voltas e gera insights de pilotagem). Roda **local, no PC Windows**. Usuário **não
programa** — guiar passo a passo, em PT-BR.

**Fato-chave de arquitetura:** o backend (toda a análise) é **Python puro, agnóstico de UI**.
Só o `src/app.py` está acoplado ao Streamlit. Ou seja, a interface é uma **camada fina** sobre
um motor já pronto — este cenário só reescreve essa camada como um componente HTML.

**Identidade visual já estabelecida** (manter como base, pode evoluir):
- Sua volta / BEST / "você" = **vermelho `#E8412A`**.
- Referência / média / outro = **azul `#2E86FF`**.
- Tema escuro. Padrão de leitura inspirado no **Garage61**.
- **⭐ Referência visual (norte):** **GO Fast** — prints reais em **`DESIGN REFERENCES/`**.
  Tema **preto + verde vibrante**, nav em pílula, **cards arredondados**, **gráficos empilhados
  PREENCHIDOS sincronizados** (Throttle verde / Brake vermelho / Speed azul), toggle
  Segments/Sectors, card Sector Comparison, mini-mapa com curvas numeradas, leaderboard com pódio.
  **Tudo isso é alcançável como componente HTML/JS (Cenário A).**
- **⚠️ O que provavelmente NÃO cabe bem no Cenário A:** o centerpiece do GO Fast — a **pista 3D
  em perspectiva, animada, com replay e carro wireframe** (WebGL/Three.js + estado de playback).
  Tratar como item do **Cenário B / web-nativo**; no Cenário A, começar com o **mapa 2D** (que já
  temos) e os gráficos empilhados, deixando o 3D animado como ambição futura.

---

## 2. Como o Streamlit hospeda HTML (o padrão que JÁ usamos)

Isto **já funciona hoje** em `src/telemetry_view.py` (o visualizador mapa+gráficos):
1. O Python monta uma **string HTML** (com CSS e JS embutidos) e injeta os dados como **JSON**.
2. O app renderiza com `streamlit.components.v1.html(html, height=740)`.
3. É **uma via** (display): o Python manda dados → o componente desenha.

**Implicações (a "regra do jogo" do cenário A):**
- **HTML/CSS/JS é 100% livre dentro do bloco** — animações, grid, SVG, Canvas, libs JS (Plotly,
  D3, etc.). É aqui que mora a liberdade de design.
- **A fronteira é o JSON Python→componente.** Tudo que a tela exibe precisa estar nesse JSON
  (o backend já produz — ver §4).
- **Interação que MUDA a análise** (trocar de volta, mudar o modo de comparação, ajustar
  tolerância) → fica em **widgets do Streamlit** (fora do bloco, ex.: sidebar), **ou** exige um
  *componente bidirecional* do Streamlit (precisa de build JS — mais trabalho; só se necessário).
- Interação **dentro** do bloco (cursor sincronizado, hover, zoom, trocar de aba visual) é livre
  e **não** precisa voltar ao Python.

> Regra prática: **desenhe a tela como HTML; deixe os "botões que recalculam" como controles do
> Streamlit.** 90% do design (layout, gráficos, cards, tipografia, cores, animação) vive no bloco.

---

## 3. O que a interface precisa apresentar (inventário de telas/conteúdo)

Hoje tudo está empilhado numa coluna só — **reorganizar é parte do objetivo** (abas, cards,
hierarquia). Os blocos de conteúdo:

1. **Cabeçalho / contexto:** carro, pista, comprimento; tempos (sua melhor, referência, **delta
   total**), nº de voltas válidas/limpas.
2. **Seletores** (controles): arquivo `.ibt`; modo (BEST vs AVG / comparar duas voltas);
   tolerância de volta limpa; toggles.
3. **Visualizador principal** (o coração): **mapa da pista** + **gráficos sincronizados**
   (velocidade, freio/acelerador, marcha, volante) com **cursor único** atravessando todos, traçado
   sobreposto das 2 voltas, marcadores de **setor** e **curva**.
4. **Delta por setor** (barras: onde ganha/perde por setor).
5. **Análise por curva (coaching):**
   - cards das **piores curvas**;
   - **tabela por curva** (Δ tempo, entrada/saída, V-mín, sinais, frase);
   - **scorecard da volta** (5 métricas: agressão de freio, trail, uso do grip, rotação, tempo morto);
   - **insights priorizados** (o quê / onde / por quê / custo / como corrigir / como validar);
   - detalhe por curva (expandível).
6. **Consistência** (tempos de cada volta, barras).
7. **Histórico de sessões** (tabela acumulada).
8. **(Futuro) Debrief do Coach de IA** — texto corrido (on hold; reservar um espaço nobre pra ele).

---

## 4. Dados disponíveis para alimentar o componente (o "contrato")

O backend já produz tudo isto (módulos em `src/`). O componente recebe via JSON:

**Séries por volta (alinhadas por distância, ~1000 pontos)** — para o visualizador:
`x` (distância em m), e para A (você) e Ref (referência): `speed` (km/h), `throttle`/`brake`
(0–100), `gear`, `steer` (graus), coordenadas do mapa (`mapX`/`mapY`). + lista de `sectors`
(limites + gap) e `corners` (posições). *(Hoje montado em `telemetry_view.build_html`.)*

**Análise por curva** (`signatures.analyze_corners` → lista de dicts): por curva → `name`,
`dt`, `dt_entry`, `dt_exit`, `v_min_a`, `dv_min`, `flags` (ex.: `lockup`, `understeer_ffb`,
`wheelspin`, `countersteer`, `kerb`, `line_tight`, `early_apex`...), `coach` (frase), `wider_m`,
`d_turnin_m`, e `facts_slow`/`facts_fast` (medidas cruas).

**Scorecard** (`coaching.lap_scorecard`): `brake_aggression`, `trail_overlap`, `circle_use`,
`rotation_eff`, `coasting_total_s`.

**Insights priorizados** (`coaching.build_insights`): lista com `corner`, `apex_pct`, `phase`,
`cost_s`, `cost_weighted`, `straight_m`, `flags`, `what`, `why`, `fix`, `validate`.

**Exemplo REAL de payload** (MX-5 em Winton, média vs melhor) — é mais ou menos isto que o
componente receberia já consolidado:
```json
{
  "contexto": {"carro":"Mazda MX-5 Cup","pista":"Winton Motor Raceway - National",
               "sua_melhor":"1:33.100","referencia":"média (7 voltas)","delta_total_s":0.89},
  "scorecard": {"brake_aggression":0.82,"trail_overlap":0.34,"circle_use":0.5,
                "rotation_eff":0.5,"coasting_total_s":3.63},
  "insights_priorizados": [
    {"curva":"Curva 9","apex_pct":71,"fase":"saída","perda_s":0.17,"reta_seguinte_m":342,
     "sinais":[], "medidas":{"v_min_delta_kmh":-0.2,"linha_offset_m":0.3,"turn_in_delta_m":-9}},
    {"curva":"Curva 6","apex_pct":49,"fase":"saída","perda_s":0.17,"reta_seguinte_m":0,
     "sinais":["line_tight"],"medidas":{"v_min_delta_kmh":-1.6,"linha_offset_m":-0.5}}
  ]
}
```

---

## 5. Entregável esperado deste cenário

Um **mockup em HTML/CSS/JS** (pode ter dados de exemplo embutidos, como o JSON acima). Não
precisa estar ligado ao Python — eu faço essa ponte. Ao me entregar:
1. eu adapto o HTML para receber os **dados reais** (troco os exemplos pelos campos do §4);
2. plugo como **componente** no `app.py` (`components.html`), com os controles que recalculam
   ficando como widgets Streamlit;
3. verifico no preview e ajustamos.

**Dica para o mockup encaixar bem:** trate a tela como **um documento HTML autocontido** (CSS no
`<style>`, lógica no `<script>`, dados num objeto JS no topo). Quanto mais autocontido, mais
direto o encaixe.

---

## 6. Como rodar / mapa de arquivos

- Rodar: `abrir_pitwall.bat` (ou `streamlit run src/app.py`) → `http://localhost:8501`.
- UI atual: `src/app.py` (Streamlit) + `src/telemetry_view.py` (componente HTML do visualizador —
  **leia este para ver o padrão de componente**).
- Backend (não mexer pelo design): `ibt_reader`, `analysis`, `lapdata`, `corners`, `signatures`,
  `calibration`, `coaching`, `track_model`, `store`.
- Contexto físico/coaching: `pitwall_pilotagem.md`; canais: `ANALISES.md`.
