# PitWall — Plano de Construção

> App de análise de telemetria de sim-racing (iRacing) para "debriefing" pós-corrida.
> Documento de referência. Atualizado conforme o projeto evolui.

> **NOTA (2026-06-11):** este é o plano-mestre original — vale como registro das
> decisões (em especial §3, §4, §6 e as regras travadas do §12). O que mudou desde
> que foi escrito:
> - **UI:** o Streamlit (§2) foi substituído por **React+TS+Vite** (`frontend/`) +
>   **FastAPI** (`src/server.py`), após o handoff de design (`design_handoff_pitwall/`).
>   A versão Streamlit está em `_arquivo-morto/`.
> - **Fase 2:** a API `/data` do iRacing está **bloqueada** (login por senha
>   descontinuado; OAuth2 pausado p/ novos clients) e o Garage61 exige aprovação +
>   opt-in — integração aguardando acesso.
> - **Fase 3 (coach de IA):** design pronto, ON HOLD aguardando janela de API.
> - Estado vivo e pendências: ver `HANDOVER-SESSAO.md`; orientação geral: `COMECE-AQUI.md`.

---

## 1. Visão geral

Após cada corrida no iRacing, o **PitWall** faz um "debriefing": lê a telemetria da
última sessão, compara com uma volta de referência rápida, calcula onde o piloto
ganha/perde tempo e gera um relatório (dashboard visual + texto escrito por uma IA
"engenheiro de pista").

**Usuário:** não programa → o Claude constrói e guia passo a passo.
**Idioma do produto:** português.

---

## 2. Decisões de arquitetura (todas confirmadas com o usuário)

### Plataforma
- **Fase 1:** roda no **PC Windows** (mesma máquina do iRacing, onde ficam os `.ibt`).
  O usuário tem Claude Code no PC → desenvolvemos e rodamos lá. Sem ponte iCloud.
- **Fase 2:** versão **web**. Escolhemos uma stack web-nativa pra que a Fase 2 seja
  quase o mesmo código.

### Stack
| Camada | Tecnologia | Por quê |
|---|---|---|
| Leitura `.ibt` | Python + **pyirsdk** (classe `IBT`) | Único caminho maduro; lê offline, todos os canais a 60 Hz |
| Processamento | **pandas / numpy** | Padrão para alinhar voltas e calcular deltas |
| UI / dashboard | **Streamlit + Plotly** | Dashboard interativo com pouco código; **é web-nativo → vira a Fase 2** |
| Resultados/progresso | API `/data` do iRacing (wrapper `iracingdataapi`) | Resultados, tempos, incidentes, evolução de iRating |
| Voltas de referência | **Garage61 API** (requer **Pro** p/ telemetria) | Comparar com piloto de referência |
| Coach de IA | **API da Claude** | Lê métricas calculadas e escreve o debrief em linguagem natural |
| Banco local | **SQLite + Parquet** | Histórico de sessões e progresso, sem servidor |

---

## 3. Restrições técnicas confirmadas (importantes!)

1. **Telemetria bruta só a SUA.** O iRacing não fornece telemetria (freio/acelerador/
   traçado) de outros pilotos — nem pela API. A API `/data` dá apenas **resultados e
   tempos de volta**.
2. **Tempo por setor dos outros pilotos: provavelmente indisponível** pela API pública
   (a confirmar na Fase 2). Tempo de **volta** por piloto: disponível. Setor/curva
   detalhado existe de sobra para os **seus** dados (via `LapDistPct` a 60 Hz).
3. **Garage61 não tem busca global.** A API só retorna **suas voltas + as dos colegas
   de equipe** (privacidade). O usuário está na **equipe Bloops** (grande, cheia de
   referências rápidas) → esse é o pool de comparação.
4. **Telemetria de referência exige plano Pro do Garage61.** Sem Pro: só tempos.
   Com Pro: traços (freio/acelerador/traçado) das voltas que você já tem acesso
   (suas + da equipe Bloops). Pro **não** abre voltas de fora das suas equipes.

---

## 4. Autenticação do Garage61 (caminho legítimo)

Não extrair/reutilizar o token do app **Bloops** (credencial de terceiro, fere ToS,
frágil, risco de ban). Caminho correto:
- O usuário gera **seu próprio acesso** (token pessoal ou OAuth2) ligado à sua conta.
- Como ele é **membro da equipe Bloops**, as referências da equipe contam como
  "voltas de colegas" e aparecem legitimamente sob o token dele.
- Registrar uma API application exige ser **dono de uma equipe** → o usuário pode
  **criar a própria equipe** no Garage61 e registrar o app PitWall lá; o acesso aos
  dados flui pela identidade do usuário.
- **A verificar na Fase 2:** se as referências do Bloops realmente aparecem sob o
  token pessoal, e se a telemetria vem (precisa Pro + privacidade da volta permitir).

---

## 5. Fluxo do debriefing (ponta a ponta)

```
Corrida termina
  → detecta novo .ibt em Documents\iRacing\telemetry
  → lê telemetria + puxa resultado da sessão (API /data iRacing)
  → motor de análise: delta por curva, freada, acelerador, traçado, consistência
  → escolhe volta de referência (ver §6) e puxa telemetria dela (Garage61, Pro)
  → coach de IA lê as métricas e escreve o debrief
  → dashboard abre: gráficos + texto "onde você perdeu tempo e por quê"
```

---

## 6. Lógica de escolha da volta de referência (definida pelo usuário)

```
[1] API /data iRacing → tempo do 1º COLOCADO da subsessão (mesmo carro + pista)
      (ele não está no Garage61; é só o "alvo de pace")
[2] API Garage61 → no pool da equipe (Bloops), filtra MESMO carro + MESMA pista,
      filtra "telemetria visível" (Pro), e seleciona a volta de tempo MAIS PRÓXIMO
      ao do 1º colocado
[3] Pro destrava a telemetria dessa volta → referência da análise
```
**Por que funciona:** voltas do Garage61 são hotlaps (qualy, mais rápidas que ritmo de
corrida). Mirar no tempo do vencedor escolhe uma referência **na pace certa**.

**Ajustes embutidos:**
- Filtrar só voltas com **telemetria visível** (senão acha o tempo mas sem dados).
- **Fallback** se não houver volta próxima no pool: usar a mais próxima disponível
  (avisando o gap) **ou** a própria best do usuário como referência.
- **Configurável:** alvo = tempo do vencedor (default) **ou** volta mais rápida da
  sessão.

---

## 7. As duas análises de comparação

| Comparação | Telemetria | O que revela |
|---|---|---|
| Sua **best** vs. referência | ✅ completa | Teto de performance, tempo "na mesa" |
| Sua **average** vs. sua best | ✅ completa | Consistência / quanto você joga fora |
| Sua **average** vs. tempo médio do vencedor | ⚠️ só tempo | Gap de ritmo de corrida real |

**Como a "volta média" é construída:** sintetizada — pega todas as voltas **limpas**
do stint (exclui out/in-lap, incidentes, saídas, outliers de tempo), alinha por
`LapDistPct`, e tira a média de cada canal ponto a ponto. Revela problemas
**sistemáticos** que a best esconde.

---

## 8. As 4 análises de insight (prioridade do usuário)

1. **Delta por setor/curva** — alinhar por `LapDistPct` (distância, não tempo); mostrar
   curva onde ganha/perde cada décimo.
2. **Frenagem e aceleração** — canais de freio/acelerador sobrepostos; detectar ponto de
   freada vs. referência e momento de voltar ao acelerador.
3. **Traçado e linha** — mapa da pista (`Lat`/`Lon`) com as duas linhas sobrepostas.
4. **Consistência e erros** — variação volta a volta; detectar travadas, lift
   desnecessário, saídas.

---

## 9. Roadmap em fases

- **Fase 0 — Preparação:** ativar gravação de telemetria no iRacing (tecla **Alt+L** ou
  `app.ini`), gerar 1 `.ibt` de teste, montar ambiente Python no PC.
- **Fase 1 — MVP só com SEUS dados:** ✅ **CONCLUÍDA (2026-06-03).** ler `.ibt` →
  dashboard com seletor de voltas + traços velocidade/freio/acelerador/**volante** +
  **delta por distância entre duas voltas suas** (best vs average) + **delta e tempo
  por setor OFICIAL** (lidos do `SplitTimeInfo` no cabeçalho do `.ibt`) + mapa da
  pista + consistência + pista/carro no cabeçalho. **Zero APIs, zero senha, zero custo.**
  Código em `src/` (`ibt_reader.py`, `analysis.py`, `app.py`); abrir com
  `abrir_pitwall.bat` ou `streamlit run src/app.py`. Validado com a corrida MX-5 em
  Winton (best L3 1:33.100, 0.893s acima do ritmo médio; 4 setores oficiais).
- **Fase 2 — Referência + Resultados:** integrar API `/data` iRacing (resultados +
  progresso) e Garage61 (referência via §6). Verificar token pessoal + setores dos
  outros + necessidade do Pro.
- **Fase 3 — Coach de IA:** camada que escreve o debrief a partir das métricas.
- **Fase 4 — Polimento:** detecção automática de nova corrida; empacotar como app com
  ícone; publicar versão web.

---

## 10. Pontos a verificar (quando chegar a hora)

- Nome exato da chave de logging de telemetria no `app.ini` (verificar no arquivo local).
- API surface atual do `pyirsdk` (classe `IBT`) — repo é a fonte da verdade.
- Endpoints e rate limits exatos da API `/data` iRacing — usar endpoint `/data/doc`.
- Garage61: confirmar token pessoal vê laps da equipe Bloops; e se telemetria vem com Pro.
- API `/data` iRacing expõe tempos por setor dos outros pilotos? (provavelmente não.)

---

## 11. Próximo passo prático

No PC Windows, com o Claude aberto neste projeto:
1. Confirmar/ativar gravação de telemetria no iRacing e gerar 1 `.ibt` de teste.
2. Montar o ambiente Python (Claude guia a instalação).
3. Primeiro dashboard: ler o `.ibt` e mostrar o delta best vs average por setor.

---

## 12. Fundações travadas antes da Fase 2 (decididas com o usuário, 2026-06-03)

> Pensando na ferramenta como um "MoTeC pessoal" para evoluir no iRacing: o que é
> caro mudar depois foi decidido agora.

### Decisões confirmadas
1. **Sobrepor N voltas (não só 2).** A arquitetura se prepara para empilhar várias
   voltas. A **"média" funciona para QUALQUER conjunto de voltas** (suas ou de outro
   piloto) → permite **"minha média vs média de outro piloto"** na Fase 2.
   Cores por volta: 1ª = vermelho (você/BEST), 2ª = azul (referência), demais na paleta.
2. **Análise por curva nomeada** (entrada / ápice / saída) — direção adotada para o
   coaching (ponto de freada, velocidade mínima, ponto de reacelerar por curva).

### Implementado nesta etapa (fundações leves)
- **Histórico local** (`store.py`, SQLite + Parquet em `data/`): por sessão guarda
  **carro, pista, condições e SETUP do carro**; por volta, tempo/validade; e os canais
  das voltas válidas **alinhados por distância** (Parquet). Idempotente (não duplica).
- **Estrutura canônica de "Volta"** (`lapdata.py`): `Lap` (fonte-agnóstica),
  `build_lap`, `synth_average` (média de uma lista), `delta`, `lap_colors`. Base para a
  Fase 2 plugar Garage61/iRacing como `Lap` sem reescrever o visualizador.

### A fazer (registrado; ainda NÃO implementado)
- **Visualizador N-voltas** (hoje mostra 2; a estrutura de dados já está pronta).
- **Modelo de curvas nomeadas por pista** + métricas por curva.
- **Telas de evolução / tendências / PB** (consumindo o histórico).
- **Camada de métricas estruturadas** alimentando o coach (Fase 3).

### Regras travadas (não mudar sem migração)
- Alinhamento por `LapDistPct` (origem na linha de chegada).
- Só comparar **mesmo carro + mesma pista** (e atentar a condições seco/molhado).
- **Nunca apagar os `.ibt`** — é o acervo-fonte, não tem como recuperar.

### Fácil de mudar depois (sem dor)
Layout/design, cores, quais canais aparecem, resolução do grid (reprocessa do `.ibt`),
novos gráficos (G-G, histogramas), textos/unidades.
