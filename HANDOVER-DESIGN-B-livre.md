# HANDOVER — Design CENÁRIO B: liberdade total (como você quer)

> **Objetivo deste cenário:** desenhar a interface **ideal** do PitWall **sem nenhuma amarra de
> implementação**. Design visual/UX puro — layout, navegação, identidade, animações, do jeito que
> você quiser. **Como vamos implementar depois é decisão posterior** (componente HTML no Streamlit,
> ou migração para web nativa). Aqui o foco é o **melhor design possível**.
>
> Documento autossuficiente. Companheiro: `HANDOVER-DESIGN-A-componente-streamlit.md` (versão
> restrita ao que cabe no Streamlit hoje).

---

## 1. Contexto do projeto (resumo)

**PitWall** = ferramenta pessoal de *debriefing* de telemetria do iRacing (lê `.ibt`, analisa as
voltas, gera insights de pilotagem como um "engenheiro de pista virtual"). Usuário **não programa**.

**Fato-chave que liberta este cenário:** o backend (toda a análise) é **Python puro, agnóstico de
UI** — só a camada de tela depende da stack. Então **este design pode virar um front web de verdade
no futuro** (o backend já está pronto para ser consumido como uma API). **Não se limite ao
Streamlit aqui** — desenhe o ideal; depois a gente decide o caminho de implementação comparando com
o Cenário A.

**Identidade atual** (ponto de partida — sinta-se livre para repensar): tema escuro; sua volta/BEST
= **vermelho `#E8412A`**, referência/média = **azul `#2E86FF`**; leitura inspirada no Garage61.

**⭐ Referência visual = NORTE deste design: GO Fast** (`go-fast.gg`). Prints reais na pasta
**`DESIGN REFERENCES/`** do projeto (ENGINEER-0..3 = tela Race Engineer; 1 = Dashboard; 2 =
Leaderboard). Linguagem a perseguir:
- Fundo **preto puro**, acento **verde vibrante**, texto branco, **cards cinza-escuro
  arredondados** com borda sutil, títulos **grandes/bold**, muito respiro.
- **Nav superior em pílula** (Dashboard / Setups / Race Engineer / Leaderboard, ativo verde) +
  ícones + avatar.
- **Tela de análise (Race Engineer):** linha da pista numa **pista 3D em perspectiva** com
  gradiente **vermelho→verde** e **carro wireframe** sobre ela; **mini-mapa 2D** com curvas
  numeradas; toggle **Segments/Sectors**; painel direito com abas **Telemetry/Tyres** e
  **gráficos empilhados PREENCHIDOS** (Throttle verde, Brake vermelho, Speed azul) com **cursor
  sincronizado**; **scrubber de PLAYBACK** (replay anima o carro + os gráficos); **Add Comparison**
  (multi-piloto); card **Sector Comparison**.
- Dashboard com **render 3D do carro** + cards de métrica; Leaderboard com filtros + **pódio** +
  tabela com delta.

**Honestidade de implementação:** quase tudo é viável (tema, layout, cards, gráficos empilhados,
tabelas). O **centerpiece — pista 3D animada com replay/carro wireframe — é WebGL/Three.js** e é o
que mais **empurra para web-nativo**. Como este é o Cenário "sem amarras", **mire no GO Fast
inteiro** (inclusive o 3D); a viabilidade/etapas a gente resolve na comparação A×B.

---

## 2. O que o produto FAZ (para você desenhar com conteúdo real)

A interface precisa **apresentar** os blocos abaixo. Não há ordem/layout obrigatório — repensar a
organização (abas, dashboard, fluxo, navegação) **é parte do objetivo**:

1. **Contexto da sessão:** carro, pista, comprimento; sua melhor volta, a referência, o **delta
   total**; nº de voltas válidas/limpas.
2. **Escolha do que comparar:** arquivo `.ibt`; modo (sua melhor vs sua média / duas voltas
   específicas); tolerância de "volta limpa".
3. **Visualizador central (o coração):** **mapa da pista** + **gráficos sincronizados** (velocidade,
   freio/acelerador, marcha, volante) com **cursor único** cruzando todos; traçado das 2 voltas
   sobreposto no mapa; marcadores de **setor** e de **curva numerada**.
4. **Delta por setor:** onde se ganha/perde tempo, por setor.
5. **Análise por curva (coaching) — o diferencial do produto:**
   - piores curvas em destaque;
   - tabela/visão por curva (Δ tempo, fase entrada/saída, velocidade mínima, **sinais** detectados);
   - **scorecard da volta** (5 medidores: agressão de freio, trail-braking, uso do grip, rotação,
     tempo morto);
   - **insights priorizados**, cada um com **o quê / onde / por quê / custo / como corrigir / como
     validar**;
   - detalhe aprofundado por curva.
6. **Consistência:** tempo de cada volta (e quais entraram na média).
7. **Histórico / evolução:** sessões acumuladas (base para tendências/PB no futuro).
8. **Debrief do Coach de IA (em breve):** um **texto corrido** estilo engenheiro de pista, gerado a
   partir dos insights — **reserve um espaço nobre/protagonista** para ele no design.

---

## 3. Conteúdo/dados reais que cada tela exibe (para o mockup não ser "lorem ipsum")

O backend já produz tudo isto — desenhe em cima destes dados de verdade:

**Séries por volta** (~1000 pontos, alinhadas por distância): distância (m); por volta
(você/ref): velocidade (km/h), freio/acelerador (0–100%), marcha, ângulo de volante (°),
traçado no mapa (x/y); + setores e curvas (posições/nomes numerados).

**Por curva:** Δ tempo total + por fase (entrada/saída), velocidade mínima, e **sinais**
detectados — ex.: travou roda, ABS, subesterço, patinou, contra-esterço, zebra, **linha mais
aberta/fechada**, apex cedo. Mais a frase de coaching já redigida.

**Scorecard da volta:** agressão de freio (%), trail-braking (%), uso do grip/círculo de atrito
(%), eficiência de rotação, tempo morto (s).

**Insight (exemplo REAL, MX-5 em Winton):**
```json
{
  "contexto": {"carro":"Mazda MX-5 Cup","pista":"Winton - National",
               "sua_melhor":"1:33.100","delta_total_s":0.89},
  "scorecard": {"brake_aggression":0.82,"trail_overlap":0.34,"circle_use":0.50,
                "rotation_eff":0.50,"coasting_total_s":3.63},
  "insights": [
    {"curva":"Curva 9","fase":"saída","perda_s":0.17,"reta_seguinte_m":342,
     "porque":"linha um pouco fechada e turn-in ~9 m cedo demais antes de uma reta longa",
     "corrigir":"atrase um tiquinho o turn-in e abra o raio na saída",
     "validar":"V-min mais tarde; volante abre na saída; ganho na reta seguinte"}
  ]
}
```
> Esse é o tipo de conteúdo que a tela mostra: **números medidos + linguagem de engenheiro**.

---

## 4. Liberdade & restrições deste cenário

- **Liberdade:** total. Layout, navegação (single-page, abas, dashboard, wizard), identidade
  visual, tipografia, animações, modo claro/escuro, responsivo — como você quiser. Pense no
  "produto dos sonhos".
- **Única coisa a respeitar:** o **conteúdo** do §2/§3 (são os dados que existem; o design tem que
  caber esses elementos). Não precisa inventar dado que não temos, nem se limitar a como o app
  parece hoje.
- **Sobre implementação (só pra você ter no radar, não pra limitar):** depois a gente compara A e B.
  Se o seu B for próximo do que dá pra fazer como **componente HTML**, unimos rápido. Se for além,
  vira o **gatilho** para a migração web nativa (backend já pronto). **Não corte asas agora** — o
  objetivo de B é mostrar o ideal.

---

## 5. Entregável esperado

Um **mockup** do design ideal — no formato que você preferir:
- HTML/CSS (ou React) no "Claude design" / artifacts, **com os dados de exemplo do §3**; ou
- imagens/telas (Figma, etc.).

> **Dica (opcional, não obrigatória aqui):** se o mockup for em HTML, fazê-lo **autocontido**
> (CSS no `<style>`, lógica no `<script>`, dados num objeto JS no topo) facilita MUITO caso a
> gente decida aproveitá-lo como componente no Streamlit depois. Mas **não se limite por isso** —
> o objetivo do Cenário B é o design ideal; a viabilidade a gente resolve na comparação A×B.

Com isso em mãos, a gente **compara A × B** e decide: implementar como componente no Streamlit, um
híbrido, ou puxar o gatilho da web nativa.

---

## 6. Referências do projeto

- Rodar o app atual (pra ver o conteúdo vivo): `abrir_pitwall.bat` → `http://localhost:8501`.
- Base de física/coaching (vocabulário do produto): `pitwall_pilotagem.md`.
- Catálogo do que a telemetria mede: `ANALISES.md`.
- Plano geral e decisões: `PLANO.md`.
