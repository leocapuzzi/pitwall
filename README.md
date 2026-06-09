# PitWall 🏁

Debriefing de telemetria de sim-racing (iRacing). **Fase 1** — análise só com os
seus próprios dados, sem APIs, sem senha, sem custo.

## Como abrir o dashboard

**Jeito fácil:** dê dois cliques em **`abrir_pitwall.bat`**.

**Pelo terminal** (na pasta do projeto):

```powershell
.venv\Scripts\streamlit.exe run src\app.py
```

O navegador abre sozinho em `http://localhost:8501`. Para fechar, volte ao
terminal e aperte `Ctrl+C` (ou feche a janela do `.bat`).

## O que o dashboard mostra

Na barra lateral você escolhe o arquivo de telemetria (`.ibt`) — ele lista
automaticamente os da pasta `Documentos\iRacing\telemetry`, do mais novo ao mais
antigo. Depois escolhe a comparação:

- **Sua melhor vs sua média** (padrão): compara sua volta mais rápida com o seu
  ritmo médio (média sintetizada das voltas limpas). Revela quanto tempo está
  "na mesa".
- **Comparar duas voltas**: escolhe duas voltas quaisquer.

E vê:

**Seletor de análise** (barra lateral):
- **BEST vs AVG** — sua melhor volta (vermelho) vs sua média (azul).
- **Comparar duas voltas** — você escolhe a volta A (vermelho) e a B (azul).
  *(Comparar com outro piloto chega na Fase 2, com o Garage61 — mesma lógica de cores.)*

**Código de cores (vale para todas as comparações e o mapa):** sua volta / BEST =
**vermelho**; média / referência = **azul**.

1. **Visualizador integrado** no padrão Garage61 — **mapa grande à esquerda**, e à
   direita os gráficos (eixo X = distância em metros): **Velocidade, Acelerador,
   Freio, Marcha e Volante** (volante com Esq/Dir em vez de +/−). Sem legenda: cada
   gráfico tem **caixas de valor à direita** que mostram o valor no cursor para cada
   volta, na cor da volta. Recursos:
   - **Cursor sincronizado nos dois sentidos:** passe o mouse em qualquer gráfico →
     linha vertical em todos + marcador do carro no mapa; passe o mouse no **mapa** →
     a linha vertical aparece nos gráficos no mesmo ponto.
   - **Pista de referência + traçado:** o mapa mostra a pista (faixa cinza), as **duas
     linhas sobrepostas** (sua volta vs referência) e marcadores de início de setor e
     da linha de chegada — pra você saber sempre onde está na pista.
   - **Abas de setor (embaixo):** uma por setor, com o **tempo e o gap** do setor;
     clicar dá **zoom no trecho nos gráficos e no mapa**. Também dá pra arrastar nos
     gráficos para zoom livre (o mapa acompanha). Duplo-clique volta à volta toda.
   - Os eixos verticais são travados: o zoom afeta só a distância, sem distorcer escala.
2. **Delta por setor oficial** — barras por setor real da pista (lidos do
   `SplitTimeInfo` do próprio `.ibt`; verde = ganhou, vermelho = perdeu). Os tempos e
   gaps de cada setor aparecem nas abas embaixo do visualizador.
3. **Consistência** — tempo de cada volta da sessão.

Os limites dos setores oficiais aparecem como linhas laranja nos gráficos; as
curvas detectadas, como linhas pontilhadas cinza.

## Estrutura

```
src/
  ibt_reader.py      # lê o .ibt (telemetria + setores oficiais/pista/carro/setup)
  analysis.py        # separa voltas, best/média, delta e tempo por setor
  lapdata.py         # estrutura canônica de "Volta" (base p/ N voltas e outras fontes)
  store.py           # histórico local (SQLite + Parquet): sessões, voltas, setup
  telemetry_view.py  # visualizador interativo (cursor sincronizado + mapa + zoom)
  app.py             # o dashboard (Streamlit + Plotly)
  inspect_ibt.py     # utilitário: lista os canais de um arquivo .ibt
data/                # histórico gerado automaticamente (não versionado)
requirements.txt
```

Cada sessão aberta é guardada automaticamente no histórico (`data/`) com carro,
pista, condições e o setup do carro — base para acompanhar evolução, recordes
pessoais e o coach de IA das próximas fases.

## Próximas fases (ver `PLANO.md`)

- **Fase 2:** referência de pilotos (Garage61) + resultados/progresso (API iRacing).
- **Fase 3:** coach de IA que escreve o debrief.
- **Fase 4:** detecção automática de nova corrida + versão web.
