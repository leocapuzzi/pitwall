# Prompt pronto para o "Claude Design" (claude.ai / artifacts)

> COMO USAR: abra uma conversa nova no claude.ai, **arraste os prints desta pasta**
> (ENGINEER-0..3, 1, 2) para a conversa, e cole o texto abaixo. Comece pela tela
> Race Engineer; depois peça as outras (Dashboard, Leaderboard) em mensagens separadas.

---

Você é um designer de produto e front-end. Vou te dar **imagens de referência** (prints
do app de telemetria "GO Fast") e quero que você **recrie a interface** desse mesmo estilo
para o meu app, o **PitWall** (debriefing de telemetria de sim-racing / iRacing).

**Entregue um único arquivo HTML autocontido** (todo o CSS dentro de `<style>`, todo o JS
dentro de `<script>`, e os **dados de exemplo num objeto JS no topo do script**). Sem
dependências externas além de, no máximo, uma CDN de gráfico se precisar. O arquivo tem
que abrir sozinho no navegador.

**Tela a recriar agora: "Race Engineer" (análise de volta)** — use os prints como guia fiel de
layout e estilo.

**Estilo visual (igual aos prints):**
- Fundo **preto puro**, acento **verde vibrante**, texto branco. Cards cinza-escuro
  arredondados com borda sutil. Títulos grandes e bold. Bastante respiro.
- **Barra de navegação superior em pílula:** Dashboard · Setups · Race Engineer (ativo, verde)
  · Leaderboard, com ícones (engrenagem/sino/info) e avatar à direita.
- Cabeçalho da volta com: carro **Mazda MX-5 Cup**, pista **Winton Motor Raceway – National**,
  e chips de condição (hora, temp ar, temp pista, umidade).

**Layout central (como nos prints ENGINEER-1/2/3):**
- **Esquerda:** o **mapa/linha da pista em destaque** com gradiente **vermelho→verde**
  (pode ser 2D estilizado; se conseguir um efeito de "pista em perspectiva 3D" com canvas/WebGL,
  melhor — mas não trave nisso). Um **mini-mapa 2D** com as **12 curvas numeradas** e a posição
  atual do carro. Um toggle **Segments / Sectors**.
- **Direita:** abas **Telemetry / Tyres**; abaixo, **3 gráficos empilhados e PREENCHIDOS**, com
  **cursor vertical único sincronizado** entre eles:
  - **Throttle** (verde, 0–100)
  - **Brake** (vermelho, 0–100)
  - **Speed** (azul/ciano, eixo ~60–170 km/h)
  *(Gere séries de exemplo plausíveis para uma volta de MX-5 — não precisa de dado real aqui.)*
- **Rodapé:** um **scrubber de playback** (botão play + tempo, ex.: `00:07.038`) que move o
  cursor dos gráficos e o carro no mapa.
- **Card "Sector Comparison"** e botão **"Add Comparison"** (comparar 2 pilotos).

**Bloco-diferencial do PitWall — "Coaching / Insights" (adicione, não existe igual no GO Fast):**
um painel com **insights priorizados** (cada um: o quê / por quê / como corrigir) e um
**scorecard da volta** (5 medidores). Use os DADOS REAIS abaixo.

**DADOS DE EXEMPLO (reais, use no objeto JS do topo):**
```js
const DATA = {
  contexto: { carro: "Mazda MX-5 Cup", pista: "Winton Motor Raceway - National",
              suaMelhor: "1:33.100", referencia: "média (7 voltas)", deltaTotal: "+0.89s" },
  setores: [ {s:"S1", t:"20.126"}, {s:"S2", t:"21.784"}, {s:"S3", t:"26.858"}, {s:"S4", t:"22.030"} ],
  curvas: [1,2,3,4,5,6,7,8,9,10,11,12], // 12 curvas numeradas
  scorecard: { agressaoFreio: 0.82, trailBraking: 0.34, usoDoGrip: 0.50,
               rotacao: 0.50, tempoMortoS: 3.6 },
  insights: [
    { curva:"Curva 9", fase:"saída", custoS:0.17, retaSeguinteM:342,
      oQue:"Perde 0,17s na saída da Curva 9",
      porque:"linha um pouco fechada e turn-in ~9 m cedo demais, antes de uma reta longa",
      corrigir:"atrase um tiquinho o turn-in e abra o raio na saída para chegar mais rápido na reta" },
    { curva:"Curva 6", fase:"saída", custoS:0.17, retaSeguinteM:0,
      oQue:"Perde 0,17s na saída da Curva 6",
      porque:"linha ~50 cm mais fechada (raio menor — esfrega o pneu e sai devagar)",
      corrigir:"entre mais por fora, deixe o carro correr até o apex e use toda a largura na saída" },
    { curva:"Curva 5", fase:"saída", custoS:0.13, retaSeguinteM:124,
      oQue:"Perde 0,13s na saída da Curva 5",
      porque:"linha fechada + pegou a zebra; perdeu velocidade mínima",
      corrigir:"abra o raio e use a zebra a favor, mantendo velocidade de curva" }
  ]
};
```

**Regras:**
- Textos da interface em **português do Brasil**.
- Cores fixas: você/melhor = vermelho **#E8412A**; referência = azul **#2E86FF**; acento da marca =
  **verde** (como o GO Fast). Fundo preto.
- Priorize **fidelidade visual aos prints** + legibilidade. Pode usar Canvas/SVG para os gráficos.
- Me entregue o HTML pronto e, depois, fique aberto a ajustes que eu pedir comparando com os prints.
```
