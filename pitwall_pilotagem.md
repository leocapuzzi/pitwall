# Base de Conhecimento — Dinâmica Veicular, Técnica de Pilotagem e Análise de Telemetria (iRacing)

> **Projeto:** PitWall — engenheiro de pista virtual / analisador de telemetria iRacing
> **Versão:** 1.0 — Junho/2026
> **Idioma:** PT-BR. Nomes de canais de telemetria mantidos em inglês (são strings literais do SDK). Termos de motorsport (understeer, oversteer, slip angle, trail braking, apex) mantidos no padrão internacional, com glosa em português.
> **Público:** (1) consumo primário por LLM via RAG; (2) documento técnico de estudo.

> **📂 ESTE É O DOCUMENTO DE PILOTAGEM.** Cobre **apenas a técnica do piloto** (dinâmica do carro → assinatura na telemetria → correção do piloto). A camada de **setup** vive no arquivo companheiro **`pitwall_setup_fase2_v1.md`** (FASE 2) — fora do escopo de coaching atual. Referências a **`U-SET-*`** nas linhas *Relacionado* apontam para lá. A regra de ouro do `DIAG-04` vale: **exaurir o lado do piloto antes de cogitar o carro.** A telemetria assume o **export `.ibt` completo** (`*tempCL/CM/CR`, `*tempL/M/R`, `*shockDefl`, `*rideHeight` etc.).

---

## PARTE 0 — COMO USAR ESTA BASE

### 0.1 Objetivo e filosofia
Esta base existe para transformar dados brutos de telemetria em **diagnóstico e prescrição**, do mesmo jeito que um engenheiro de pista converte um datalog num plano de ação para o piloto. A lógica central é uma cadeia de três elos:

**`fenômeno físico → assinatura nos dados → correção (piloto ou setup)`**

Nenhum número de telemetria significa nada sozinho. Significa algo *em relação a* uma referência (volta ideal, outro piloto, outra volta sua) e *dentro de* um modelo físico. Esta base fornece o modelo físico e o mapa de assinaturas; a metodologia de comparação está na Parte 3.

### 0.2 Convenção de IDs
Cada conceito tem um ID estável para referência cruzada e citação pela IA:
- `U-*` = fundamento universal (Parte 1)
- `U-SET-*` = setup (arquivo companheiro, FASE 2)
- `TEL-*` = telemetria/método (Parte 3)
- `SIG-*` = assinatura de sintoma (Parte 3B)
- `MX5-* / GT3-* / FRM-*` = camadas por classe (Parte 4)
- `DIAG-*` = lógica de diagnóstico (Parte 5)

### 0.3 Schema de cada conceito (para chunking consistente)
Entradas de **fundamento** seguem: **Conceito** (a física) → **Na pilotagem** (implicação para a técnica) → **Telemetria** (canais + assinatura) → **Relacionado** (IDs).
Entradas de **assinatura/diagnóstico** seguem: **Assinatura** → **Causa provável** → **Correção (piloto)** → **Relacionado**. *(A direção de setup de cada sintoma foi movida para o arquivo companheiro de setup — FASE 2.)*
Cada entrada é redigida para ser **autossuficiente** (sobrevive a ser recuperada isolada num RAG).

### 0.4 Convenção das fases de curva (referenciada por toda a base)
Toda curva é decomposta em fases. Esta é a régua que todo o resto usa (detalhe em `U-LINE-01`):

1. **Braking (frenagem em reta):** do ponto de frenagem até o início da inscrição.
2. **Turn-in (inscrição):** início do giro de volante, geralmente com freio ainda aplicado.
3. **Trail (frenagem progressiva):** liberação gradual do freio enquanto o ângulo de volante aumenta.
4. **Apex / V-min:** ponto de menor velocidade da curva e maior carga lateral.
5. **Throttle pickup (retomada):** início e progressão do acelerador.
6. **Exit / track-out (saída):** abertura do volante, acelerador a fundo, carro correndo para fora.

Mapeie **toda** análise a essas fases antes de diagnosticar. "Entrada" = fases 1–3; "meio" = fase 4; "saída" = fases 5–6.

### 0.5 Glossário de canais de telemetria do iRacing (referência)
Nomes confirmados no SDK (irsdk/pyirsdk; `.ibt` no disco). Disponibilidade exata varia por carro — rode `irsdk.exe --parse` para o dump definitivo do carro alvo.

**Inputs do piloto**
| Canal | Unidade | Significado |
|---|---|---|
| `Throttle` | 0–1 | Acelerador processado pelo carro (×100 = %) |
| `Brake` | 0–1 | Freio processado pelo carro |
| `ThrottleRaw` | 0–1 | Acelerador **bruto** (antes de qualquer mapa/processamento do carro) |
| `BrakeRaw` | 0–1 | Freio bruto — comparar com `Brake` revela processamento/ABS |
| `Clutch` | 0–1 | Embreagem (1 = solta, 0 = pisada — atenção à convenção) |
| `SteeringWheelAngle` | rad | Ângulo de volante (sinal: validar empiricamente por curva conhecida) |
| `Gear` | int | −1 ré, 0 neutro, 1..n |

**Movimento do corpo do carro**
| Canal | Unidade | Significado |
|---|---|---|
| `Speed` | m/s | Velocidade no solo (×3.6 = km/h) |
| `LongAccel` | m/s² | Aceleração longitudinal (frenagem/tração) |
| `LatAccel` | m/s² | Aceleração lateral (curva) |
| `VertAccel` | m/s² | Aceleração vertical (zebras, ondulações) |
| `YawRate` | rad/s | Taxa de guinada (rotação no eixo vertical) |
| `RollRate` | rad/s | Taxa de rolagem |
| `PitchRate` | rad/s | Taxa de arfagem (pitch) |
| `VelocityX` | m/s | Velocidade longitudinal (eixo do carro, p/ frente) |
| `VelocityY` | m/s | Velocidade lateral (eixo do carro) — base do body slip |
| `VelocityZ` | m/s | Velocidade vertical |
| `Yaw` / `Pitch` / `Roll` | rad | Orientação do carro |

**Feedback de direção / motor**
| Canal | Unidade | Significado |
|---|---|---|
| `SteeringWheelTorque` | N·m | Torque de retorno do volante — **proxy de self-aligning torque / grip dianteiro** |
| `RPM` | rev/min | Rotação do motor |
| `ShiftIndicatorPct` | 0–1 | Quão perto do shift ideal |

**Pneu / freio por roda** (prefixos `LF`,`RF`,`LR`,`RR` = dianteiro-esq, dianteiro-dir, traseiro-esq, traseiro-dir)
| Canal | Unidade | Significado |
|---|---|---|
| `LFspeed` etc. | rad/s | Velocidade **angular** da roda — base do slip ratio (lockup/wheelspin) |
| `LFtempCL` / `LFtempCM` / `LFtempCR` | °C | Temperatura de **carcaça** em 3 pontos (interno/meio/externo) — ao vivo |
| `LFtempL` / `LFtempM` / `LFtempR` | °C | Temperatura de **superfície** (principalmente em `.ibt`) |
| `LFwearL` / `LFwearM` / `LFwearR` | fração | Desgaste restante (1.0 = novo) |
| `LFcoldPressure` | kPa | Pressão setada (fria) |
| `LFpressure` | kPa | Pressão **ao vivo** (`.ibt`) |
| `LFbrakeLinePress` | bar | Pressão de linha de freio na roda |
| `LFshockDefl` | m | Deflexão do amortecedor |
| `LFshockVel` | m/s | Velocidade do amortecedor — leitura de transient |
| `LFrideHeight` etc. | m | Altura em relação ao solo |

**Ajustes de cockpit (Driver Controls — atenção à semântica)**
| Canal | Unidade | Significado |
|---|---|---|
| `DcABS` | nível | **Nível de ABS setado pelo piloto** — NÃO é ativação |
| `DcTractionControl` | nível | **Nível de TC setado** — NÃO é ativação |
| `DcBrakeBias` | % | Bias de freio (% dianteiro) |
| `BrakeABSactive` | bool | **ABS atuando agora** (builds recentes / certos carros) |

**Volta / tempo / sessão**
| Canal | Unidade | Significado |
|---|---|---|
| `Lap` | int | Número da volta |
| `LapDist` | m | Distância percorrida na volta (eixo X natural p/ traços) |
| `LapDistPct` | 0–1 | Fração da volta — **canal de alinhamento entre voltas** |
| `LapCurrentLapTime` | s | Tempo da volta atual |
| `LapLastLapTime` / `LapBestLapTime` | s | Última / melhor volta |
| `LapDeltaToBestLap` | s | Delta vivo vs melhor volta |
| `LapDeltaToSessionBestLap` | s | Delta vivo vs melhor da sessão |
| `FuelLevel` / `FuelLevelPct` | L / 0–1 | Combustível |
| `OnPitRoad` | bool | No pit lane |

> **Regra de ouro de sinais:** convenções de sinal de `LatAccel`, `SteeringWheelAngle`, `VelocityY` e `YawRate` podem variar por carro/build. O app **deve calibrar o sinal empiricamente** numa curva de mão conhecida antes de confiar em comparações de balanço. Nunca assuma a polaridade.

### 0.6 Canais DERIVADOS que o app deve calcular
Estes não existem no `.ibt` — o PitWall os computa. São o coração da análise (detalhe em `TEL-02`):

- **Body slip angle (β):** `β = atan2(VelocityY, VelocityX)` — ângulo entre para onde o carro aponta e para onde ele vai. Núcleo da detecção de rotação/oversteer.
- **Aceleração combinada (G total):** `G = sqrt(LatAccel² + LongAccel²)`. A nuvem de `(LongAccel, LatAccel)` é o **diagrama G-G** = o círculo de atrito medido do carro.
- **Uso do círculo de atrito (%):** `G / G_max`, onde `G_max` é o raio do envelope G-G daquele carro/pista. Mede quanto do grip disponível está sendo usado a cada instante.
- **Raio instantâneo:** `R = Speed / YawRate` (ou `R = Speed² / LatAccel`). Revela a linha real percorrida.
- **Slip ratio proxy por roda:** `SR ≈ (ω_roda · r_eff − v) / v`, com `ω_roda` = `LFspeed` (rad/s) e `r_eff` = raio de rolamento do pneu. `SR < 0` = travando; `SR > 0` na roda motriz = patinando.
- **Delta-t por segmento:** derivada do `LapDeltaTo...` segmentada por trecho/curva → onde exatamente o tempo nasce e morre.
- **Understeer angle (proxy):** comparar `SteeringWheelAngle` real vs o ângulo "Ackermann" esperado para o `R` instantâneo; excesso de volante para o raio = understeer.

---

## PARTE 1 — FUNDAMENTOS UNIVERSAIS

Estes valem para **todo** carro com quatro rodas e pneus. As particularidades de MX-5, GT3 e fórmulas (Parte 4) são **modulações** destes princípios — não os substituem.

### 1.1 O pneu — a fundação de tudo

Todo grip, toda força que acelera, freia ou curva o carro passa por quatro contact patches do tamanho da palma da sua mão. Entender o pneu é entender 80% da pilotagem.

#### `[U-TIRE-01]` Atrito do pneu não é atrito de física do ensino médio
**Conceito:** O modelo de Coulomb (F = μ·N, μ constante) é falso para pneus. O grip de um pneu vem de adesão molecular + deformação da borracha engatando na textura do asfalto, e depende de carga, temperatura, escorregamento (slip), pressão e velocidade. A força não cresce linearmente com a carga (ver `U-TIRE-05`) e só existe em sua plenitude quando há um pouco de **escorregamento** (ver `U-TIRE-02/03`). Um pneu parado em relação ao solo não gera força lateral: ele precisa estar "deslizando" microscopicamente.
**Na pilotagem:** Você não "tem" grip — você **gerencia** um recurso finito e não-linear. Toda a técnica é sobre operar o pneu perto do seu pico sem ultrapassá-lo.
**Telemetria:** Nenhum canal mede μ diretamente. Você o infere do envelope `LatAccel`/`LongAccel` (diagrama G-G) e da relação força×escorregamento.
**Relacionado:** `U-TIRE-02`, `U-TIRE-04`, `U-TIRE-05`.

#### `[U-TIRE-02]` Slip angle (ângulo de deriva lateral)
**Conceito:** É o ângulo entre a direção para onde a roda aponta e a direção para onde ela realmente se move. Conforme o slip angle aumenta de zero, a **força lateral** sobe quase linearmente, atinge um **pico** (tipicamente entre ~5° e ~12° dependendo do pneu), e depois **cai** — o pneu "desiste". Andar rápido é viver no platô em torno desse pico.
**Na pilotagem:** Curva no limite = manter os pneus perto do pico de slip angle. Passar do pico (volante a mais, escorregar demais) **reduz** a força lateral e só piora — o instinto de "virar mais" quando o carro não vira é exatamente o erro. Dianteira no pico antes da traseira = understeer; traseira no pico antes da dianteira = oversteer.
**Telemetria:** Slip angle real exige modelo de pneu, mas o **body slip β** (`atan2(VelocityY, VelocityX)`, ver Parte 0.6) é um proxy do conjunto. `SteeringWheelTorque` cai quando a dianteira passa do pico (a força que retorna o volante some) — sinal precoce de saturação dianteira. `LatAccel` que para de subir mesmo com mais `SteeringWheelAngle` indica dianteira saturada.
**Relacionado:** `U-TIRE-08`, `U-BAL-01`, `SIG-01`.

#### `[U-TIRE-03]` Slip ratio (escorregamento longitudinal)
**Conceito:** Análogo longitudinal do slip angle. É a diferença relativa entre a velocidade da superfície do pneu e a velocidade do carro. Sob frenagem o pneu gira mais devagar que o solo (slip negativo); sob tração, mais rápido (slip positivo). A força longitudinal também tem um **pico** (geralmente em ~5–15% de slip ratio) e cai depois: roda 100% travada (slip = −1) ou patinando livre tem **menos** grip que a roda no pico.
**Na pilotagem:** Threshold braking e controle de tração manual = manter o slip ratio no pico, sem travar nem patinar. Travar a roda não só alonga a frenagem como **tira a capacidade de dirigir** (uma roda travada não gera força lateral — ver círculo de atrito).
**Telemetria:** Compare `LFspeed`/`RFspeed`/etc. (rad/s × raio) com `Speed`. Roda muito mais lenta que o carro sob `Brake` alto = travamento. Roda motriz muito mais rápida que `Speed` sob `Throttle` = wheelspin. O slip ratio proxy (Parte 0.6) é o canal derivado-chave.
**Relacionado:** `U-BRK-01`, `U-ACC-02`, `SIG-07`, `SIG-09`.

#### `[U-TIRE-04]` Círculo (elipse) de atrito — o conceito mais importante da base
**Conceito:** Cada pneu tem um **orçamento total de grip** que precisa ser dividido entre força lateral (curva) e longitudinal (frear/acelerar). Plote força lateral no eixo X e longitudinal no Y: o limite forma aproximadamente um círculo (na prática uma elipse). Você pode usar 100% para frear em reta, ou 100% para curvar, **mas não 100% dos dois ao mesmo tempo**. Frear e curvar juntos = ficar na borda diagonal do círculo, com menos de cada um. A soma vetorial é que não pode exceder o raio.
**Na pilotagem:** É a física que governa **toda** transição. Trail braking = trocar gradualmente grip longitudinal por lateral conforme você sai do freio e entra no volante, mantendo o vetor total na borda do círculo o tempo todo. O pecado é deixar o vetor **encolher para dentro** do círculo (frear e já não curvar, ou curvar e ainda não acelerar) — grip desperdiçado = tempo perdido.
**Telemetria:** O **diagrama G-G** (nuvem de `LatAccel`×`LongAccel`) É o círculo de atrito medido. Uma volta boa preenche a borda do envelope; buracos perto dos eixos diagonais (transições) revelam grip não-usado. O canal derivado "uso do círculo (%)" (Parte 0.6) quantifica isso instante a instante.
**Relacionado:** `U-BRK-03`, `U-INP-03`, `U-LOAD-04`, `SIG-12`.

#### `[U-TIRE-05]` Sensibilidade à carga (load sensitivity)
**Conceito:** A força máxima de um pneu cresce com a carga vertical, **mas em taxa decrescente** — dobrar a carga gera menos que o dobro de grip. Consequência crítica: quando a carga transfere de um lado para o outro (ver `U-LOAD`), o lado descarregado perde mais grip do que o lado carregado ganha. **A transferência de carga reduz o grip total do eixo.** Por isso suspensão dura demais (que transfere carga mais bruscamente para fora) custa aderência.
**Na pilotagem:** Suavidade tem base física. Inputs bruscos jogam carga rápido para um canto, esvaziam o oposto, e o **par** perde grip. É por isso que o piloto rápido parece estar "andando devagar" — ele mantém as quatro rodas com carga equilibrada o máximo possível.
**Telemetria:** Indireta. `LatAccel`/`LongAccel` muito "serrilhados" e picos de `LFshockVel`/`RFshockVel` altos indicam carga sendo arremessada. Distribuição de `LFtempCL/CM/CR` desigual lado a lado reflete histórico de carga.
**Relacionado:** `U-LOAD-01`, `U-LOAD-06`, `U-INP-02`, `U-SET-02`.

#### `[U-TIRE-06]` Temperatura do pneu e janela operacional
**Conceito:** O pneu só entrega μ máximo dentro de uma **janela de temperatura**. Frio = borracha rígida, pouco grip (e tendência a deslizar, o que esquenta). Quente demais = borracha "melando", grip cai e desgaste dispara. A distribuição **através** do tread (interno/meio/externo: `CL`/`CM`/`CR`) conta a história:
- Interno muito mais quente que externo → **camber negativo demais** (ou pressão baixa).
- Meio muito mais quente que as bordas → **pressão alta demais** (banda estufa no centro).
- Bordas mais quentes que o meio → **pressão baixa demais**.
- Um lado do carro sistematicamente mais quente → trabalho assimétrico (oval, ou desbalanço L/R).
**Na pilotagem:** Em stint, você gerencia temperatura: deslizar demais cozinha o pneu (degradação), andar frio demais não acessa o grip. Out-lap serve para colocar o pneu na janela.
**Telemetria:** `LFtempCL/CM/CR` (carcaça, ao vivo) e `LFtempL/M/R` (superfície). Compare entre as quatro rodas e ao longo do stint. Subida contínua + queda de `LatAccel` de pico ao longo das voltas = superaquecimento/degradação.
**Relacionado:** `U-TIRE-07`, `U-SET-05`, `U-SET-06`, `SIG-17`.

#### `[U-TIRE-07]` Pressão e contact patch
**Conceito:** A pressão define o **tamanho e o formato** do contact patch e a rigidez da carcaça. Baixa demais: patch grande mas carcaça mole, bordas sobrecarregadas, esquenta nas bordas, resposta lenta e "vaga". Alta demais: patch pequeno e abaulado, centro sobrecarregado, menos grip mecânico, resposta nervosa. Existe uma pressão **quente-alvo** ótima por pneu/carro/pista.
**Na pilotagem:** A pressão fria é setada para chegar à pressão quente-alvo depois do aquecimento. Pressão errada distorce todo o resto do diagnóstico (um carro pode "parecer" com problema de balanço quando é só pressão fora da janela).
**Telemetria:** `LFcoldPressure` (setada) vs `LFpressure` (ao vivo). Cruze com o perfil de temperatura `CL/CM/CR` (`U-TIRE-06`) para decidir o ajuste.
**Relacionado:** `U-TIRE-06`, `U-SET-06`.

#### `[U-TIRE-08]` Self-aligning torque (SAT) e o feedback de volante
**Conceito:** Um pneu com slip angle gera, além da força lateral, um **torque que tenta realinhar a roda** (porque o pico de pressão do patch fica atrás do centro). Esse torque é o que você sente no volante. Ele **cresce com o slip angle até pouco antes do pico de grip e depois CAI** — ou seja, o volante "alivia" um pouco *antes* de a dianteira realmente desistir. É o aviso prévio da natureza.
**Na pilotagem:** O piloto sensível sente a dianteira chegando no limite pela leveza do volante e ajusta antes de escorregar. Em sim, esse sinal vem pelo Force Feedback.
**Telemetria:** `SteeringWheelTorque` é o canal direto. **Queda** de `SteeringWheelTorque` enquanto `SteeringWheelAngle` ainda sobe = dianteira passando do pico = understeer iminente. É um dos sinais mais ricos e subutilizados na análise.
**Relacionado:** `U-TIRE-02`, `SIG-01`, `SIG-02`.

### 1.2 Transferência de carga — o mecanismo central

Se o pneu é a fundação, a transferência de carga é o motor que move grip de canto em canto do carro a cada instante. Dominar isso é dominar o balanço.

#### `[U-LOAD-01]` Transferência de carga: o conceito geral
**Conceito:** Quando o carro acelera em qualquer direção (frear, curvar, acelerar), a inércia age no **centro de gravidade (CG)**, que está acima do solo. Isso gera um momento que **transfere carga vertical** entre os pneus: para trás na aceleração, para frente na frenagem, para fora na curva. A carga total não muda — ela se **redistribui**. E como grip depende de carga de forma não-linear (`U-TIRE-05`), redistribuir carga **redistribui grip** — é assim que você "liga" e "desliga" a frente e a traseira.
**Na pilotagem:** Toda a arte de balancear o carro é usar os controles para colocar carga onde você precisa de grip: freio para carregar a dianteira e fazer o carro girar na entrada; acelerador para carregar a traseira e estabilizar/tracionar na saída.
**Telemetria:** `LongAccel` e `LatAccel` são as causas; `LFshockDefl`/etc. e `*rideHeight` mostram o efeito (carro mergulha na frente sob freio, agacha atrás sob tração, rola para fora na curva).
**Relacionado:** `U-LOAD-02/03/04`, `U-TIRE-05`.

#### `[U-LOAD-02]` Transferência longitudinal (frenagem e aceleração)
**Conceito:** Sob frenagem, carga vai para o eixo dianteiro (mergulho/dive); sob aceleração, para o traseiro (agachamento/squat). A magnitude depende de desaceleração × altura do CG ÷ entre-eixos. Mais carga na frente sob freio = mais grip dianteiro disponível para frear E para curvar; a traseira fica leve e nervosa.
**Na pilotagem:** Frear forte "planta" a dianteira — é o que dá a ela autoridade para inscrever. Tirar o freio cedo demais devolve carga à traseira e a dianteira "perde a mordida" (volta o understeer). Por isso a *forma* como você sai do freio é tão decisiva quanto a força do freio.
**Telemetria:** `LongAccel` negativo (frenagem) correlacionado com mergulho dianteiro em `LFshockDefl`/`RFshockDefl` (comprimem) e `LRshockDefl`/`RRshockDefl` (estendem). `PitchRate` capta a dinâmica.
**Relacionado:** `U-BRK-03`, `U-LOAD-04`, `U-ACC-01`.

#### `[U-LOAD-03]` Transferência lateral (curva)
**Conceito:** Na curva, carga transfere para os pneus **externos** (o carro rola/roll). O eixo que recebe relativamente mais transferência perde mais grip (por `U-TIRE-05`) e define o balanço: distribuir mais transferência para a dianteira → understeer; para a traseira → oversteer. É exatamente assim que barras estabilizadoras ajustam o carro (`U-SET-02`).
**Na pilotagem:** A velocidade com que você impõe o ângulo de volante controla a velocidade da rolagem e o pico transiente de carga. Virar bruscamente "estala" carga para fora e pode passar o eixo do pico de grip momentaneamente.
**Telemetria:** `LatAccel` correlacionado com `RollRate` e com `*shockDefl` dos pneus externos comprimindo. Temperaturas (`CL/CM/CR`) dos pneus externos tendem a ser maiores.
**Relacionado:** `U-SET-02`, `U-BAL-01`, `U-TIRE-06`.

#### `[U-LOAD-04]` Transferência combinada / diagonal — a chave do trail braking
**Conceito:** Frenagem + curva ao mesmo tempo somam transferência longitudinal e lateral: a carga concentra **diagonalmente** no pneu dianteiro externo, e o **traseiro interno** quase descarrega. Isso (a) dá grip máximo à dianteira externa para inscrever e (b) tira grip da traseira, o que **ajuda o carro a girar** (rotação). É a base física do trail braking (`U-BRK-03`) e também do risco de oversteer de entrada (`SIG-04`).
**Na pilotagem:** Dosar a pressão de freio no turn-in é dosar quanta rotação você pede. Mais freio retido = mais carga na frente e mais leveza atrás = mais rotação (até o ponto de a traseira soltar). É um dial contínuo, não um interruptor.
**Telemetria:** `Brake` decaindo enquanto `SteeringWheelAngle` cresce; `LongAccel` e `LatAccel` ambos significativos simultaneamente (vetor na borda diagonal do G-G); traseiro interno (`*shockDefl`) próximo do topo de extensão; `YawRate` subindo "de graça" nessa fase.
**Relacionado:** `U-BRK-03`, `U-TIRE-04`, `U-YAW-02`, `SIG-04`.

#### `[U-LOAD-05]` Geometria de massa: CG, bitola, entre-eixos
**Conceito:** A **quantidade** de transferência (para uma dada aceleração) escala com **altura do CG ÷ bitola** (lateral) e **altura do CG ÷ entre-eixos** (longitudinal). CG baixo e bitola/entre-eixos largos = menos transferência = mais grip total mantido (carros mais "plantados"). Distribuição de peso (dianteira/traseira) define o ponto de partida do balanço e a inércia em guinada.
**Na pilotagem:** Explica por que arquétipos diferentes se comportam diferente (Parte 4): um GT3 pesado com CG controlado responde a transient devagar; uma fórmula leve e baixa muda de direção instantaneamente mas pune brusquidão.
**Telemetria:** É propriedade do carro/setup (não um canal por volta), mas a **assinatura** aparece na velocidade de resposta de `YawRate`/`RollRate` a um degrau de `SteeringWheelAngle`.
**Relacionado:** `U-LOAD-06`, `MX5-01`, `GT3-06`, `FRM-05`.

#### `[U-LOAD-06]` Velocidade da transferência (transient) — por que a taxa importa
**Conceito:** Não importa só **quanta** carga transfere, mas **quão rápido**. A velocidade da transferência é governada principalmente pelos **amortecedores** (dampers) e pela rigidez. Transferência rápida demais = picos de carga que passam o pneu do pico (`U-TIRE-02/05`) e desestabilizam; lenta demais = carro "preguiçoso", demora a responder e a "plantar".
**Na pilotagem:** É por isso que suavizar os inputs (`U-INP-02`) ganha tempo: você controla a *taxa* de transferência. O piloto não comanda só a posição do volante/pedal, mas a **velocidade** com que chega lá.
**Telemetria:** `LFshockVel`/etc. são leitura direta da velocidade de transferência. Picos altos de shock velocity em turn-in/saída = inputs bruscos ou dampers inadequados. `RollRate`/`PitchRate` complementam.
**Relacionado:** `U-SET-03`, `U-INP-02`, `U-TIRE-05`.

### 1.3 Balanço do carro — understeer, oversteer, neutro

#### `[U-BAL-01]` Definição rigorosa de balanço
**Conceito:** Balanço é a comparação entre os slip angles dos eixos dianteiro e traseiro no limite. **Understeer (sub-esterço):** dianteira atinge o limite primeiro — o carro "reto-fica", quer ir largo, exige mais volante do que a geometria pediria. **Oversteer (sobre-esterço):** traseira atinge o limite primeiro — a traseira escorrega, o carro gira mais do que o pedido, body slip cresce. **Neutro:** os dois eixos chegam ao limite juntos — teoricamente o mais rápido, mas o mais difícil de controlar. Importante: balanço **não é fixo** — varia por fase de curva, velocidade e input (`U-BAL-04`).
**Na pilotagem:** Você quer um carro o mais perto do neutro que sua confiança e a consistência permitam, com um leve viés que combine com a pista e o pneu. Entender *qual* eixo está saturando e *em qual fase* é o cerne do diagnóstico.
**Telemetria:** Compare `SteeringWheelAngle` necessário vs raio (`R = Speed/YawRate`): muito volante para o raio = understeer. `β` (body slip) crescente e `YawRate` "adiantado" em relação ao volante = oversteer. `SteeringWheelTorque` caindo cedo = dianteira saturando.
**Relacionado:** `U-TIRE-02`, `U-YAW-03`, `SIG-01`–`SIG-06`.

#### `[U-BAL-02]` Understeer — anatomia
**Conceito:** A dianteira esgota o grip antes da traseira. Causas físicas: muita transferência lateral para a dianteira, dianteira fria/sobrecarregada/pressão errada, excesso de velocidade de entrada (energia que a dianteira não segura), ou volante além do pico de slip (`U-TIRE-02`). "Push" de saída surge quando o acelerel transfere carga para trás e alivia a frente (`SIG-03`).
**Na pilotagem:** A cura **não** é mais volante (passa do pico e piora). É reduzir a energia (entrar mais devagar/ mais reto), esperar a frente recuperar, ou ajustar carga (sair menos do freio cedo na entrada). Reconhecer understeer de *entrada* (excesso de velocidade) vs de *saída* (acelerador) é essencial.
**Telemetria:** `SteeringWheelAngle` alto com `LatAccel` estagnado; `SteeringWheelTorque` baixo/caindo; raio real (`Speed/YawRate`) maior que o necessário; `β` pequeno.
**Relacionado:** `SIG-01`, `SIG-02`, `SIG-03`, `U-TIRE-08`.

#### `[U-BAL-03]` Oversteer — anatomia
**Conceito:** A traseira esgota o grip antes da dianteira; a traseira escorrega para fora e o carro gira. Tipos: **de entrada** (trail braking demais tira carga da traseira — `U-LOAD-04`); **de potência** (torque demais na saída satura a traseira longitudinalmente, sobrando pouco lateral — `U-TIRE-04`); **lift-off / snap** (tirar o pé no meio da curva transfere carga para frente e descarrega/recarrega a traseira bruscamente — `U-BAL-05`).
**Na pilotagem:** Correção: reduzir o que está saturando a traseira (menos freio na entrada, menos/mais suave acelerador na saída) e **contra-esterço** proporcional e rápido, devolvendo o volante assim que a traseira segura (over-correção causa o "tank-slapper"). Oversteer leve e controlado de entrada é uma ferramenta de rotação; descontrolado é tempo e risco.
**Telemetria:** `β` (body slip) crescendo rápido; `YawRate` excedendo o esperado para o `SteeringWheelAngle`; contra-esterço visível (sinal de `SteeringWheelAngle` invertendo); na saída, wheelspin (`*speed` traseiro > `Speed`) acompanhando.
**Relacionado:** `SIG-04`, `SIG-05`, `SIG-06`, `U-YAW-03`.

#### `[U-BAL-04]` Balanço por fase de curva (entry / mid / exit)
**Conceito:** O balanço de um mesmo carro **muda dentro da mesma curva** porque a carga e os inputs mudam por fase. Diagnóstico só faz sentido **por fase**:
- **Entrada (turn-in/trail):** dominada por transferência longitudinal+diagonal (`U-LOAD-04`). Problemas aqui = freio/velocidade de entrada/rotação.
- **Meio (apex/V-min):** dominado por transferência lateral pura (`U-LOAD-03`), pedais neutros. Problema aqui = balanço mecânico estável (molas/barras/geometria/pressão).
- **Saída (pickup/exit):** dominada por tração e transferência para trás (`U-LOAD-02`). Problema aqui = acelerador/diff/grip traseiro.
**Na pilotagem:** "O carro tem understeer" é uma frase inútil. "Understeer no meio da curva mas solta na saída" é acionável e aponta causas opostas (mais grip dianteiro mecânico vs menos agressividade no acelerador / diff).
**Telemetria:** Segmente cada curva em entrada/meio/saída por `LapDistPct` + estado de `Brake`/`Throttle`/`SteeringWheelAngle` (ver `TEL-05`) e classifique o balanço **em cada fase separadamente**.
**Relacionado:** `U-LINE-01`, `DIAG-03`, todas as `SIG-*`.

#### `[U-BAL-05]` Lift-off / snap oversteer — a física do tirar o pé
**Conceito:** Tirar o acelerador abruptamente no meio de uma curva carregada transfere carga para a dianteira e **descarrega a traseira** (`U-LOAD-02` ao contrário), que pode passar do pico lateral e soltar de repente — o "snap". Em carros de motor traseiro/traseira leve o efeito é mais violento. Engine braking agrava (desacelera as rodas traseiras).
**Na pilotagem:** Evite mudanças bruscas de acelerador com o carro de lado/carregado. Se precisar reduzir, faça progressivo. Muito do "o carro me traiu do nada" é lift-off oversteer auto-infligido.
**Telemetria:** Queda rápida de `Throttle` no meio da curva, seguida (centésimos depois) de `β`/`YawRate` disparando. A sequência temporal *acelerador-some-então-traseira-solta* é a assinatura inconfundível.
**Relacionado:** `SIG-06`, `U-ACC-03`, `U-LOAD-02`.

#### `[U-BAL-06]` Balanço transiente vs permanente (steady-state)
**Conceito:** **Permanente** = comportamento numa curva longa de raio constante (governado por mecânica/aero estáveis). **Transiente** = comportamento durante as *mudanças* (turn-in, inversões, pickup) — governado por dampers, rigidez e velocidade de input (`U-LOAD-06`). Um carro pode ser neutro em regime permanente mas nervoso no transiente (ou vice-versa).
**Na pilotagem:** Problemas que aparecem só "no momento em que eu viro" ou "no instante em que piso" são transientes (olhar dampers/suavidade); problemas que persistem na curva mantida são permanentes (olhar molas/barras/aero/pressão).
**Telemetria:** Picos de `*shockVel`, `RollRate`, `PitchRate` isolam a janela transiente; valores sustentados de `LatAccel`/`SteeringWheelAngle` na curva mantida isolam o regime permanente.
**Relacionado:** `U-SET-03`, `U-LOAD-06`, `DIAG-04`.

### 1.4 A curva e a linha (racing line)

#### `[U-LINE-01]` As fases da curva (definição canônica)
**Conceito:** Repetindo a régua da Parte 0.4 com a física de cada fase: **(1) Braking** — desaceleração máxima em reta, vetor de grip 100% longitudinal. **(2) Turn-in** — começa o volante; o vetor de grip começa a rotacionar do longitudinal para o lateral (borda do círculo de atrito). **(3) Trail** — freio liberado progressivamente conforme o volante aumenta; transferência diagonal gera rotação (`U-LOAD-04`). **(4) Apex / V-min** — ponto de menor velocidade e maior `LatAccel`; pedais quase neutros; grip ~100% lateral. **(5) Pickup** — acelerador progressivo; vetor começa a rotacionar de volta para o longitudinal. **(6) Exit** — volante abrindo, acelerador a fundo, usando toda a pista.
**Na pilotagem:** As fases se sobrepõem (não há fronteiras rígidas) e a transição **contínua** entre elas é onde mora o tempo. O objetivo é nunca deixar o vetor de grip "cair para dentro" do círculo entre uma fase e outra (`U-INP-03`).
**Telemetria:** O padrão de referência: `Brake` cai enquanto `SteeringWheelAngle` sobe (2→3), `Speed` atinge mínimo no apex (4), `Throttle` sobe enquanto `SteeringWheelAngle` cai (5→6). Sobreposição saudável de `Brake`>0 e `SteeringWheelAngle`>0, e de `Throttle`>0 e `SteeringWheelAngle`>0.
**Relacionado:** TODAS as entradas — esta é a espinha dorsal.

#### `[U-LINE-02]` Geometria: raio vs velocidade
**Conceito:** A velocidade máxima numa curva escala com a raiz quadrada do raio (`v_max = sqrt(μ·g·R)` no caso plano simples). Dobrar o raio permite ~41% mais velocidade. Por isso a linha de corrida **abre** a curva: entrar por fora, apexar por dentro, sair por fora maximiza o raio efetivo e, portanto, a velocidade possível por todo o arco.
**Na pilotagem:** A "linha" não é estética — é a busca pelo maior raio compatível com os limites da pista, ponderada pela importância da saída (`U-LINE-04`). Usar toda a largura disponível na entrada e na saída é geometria pura.
**Telemetria:** O **raio instantâneo** (`Speed/YawRate`) revela a linha real. Um raio menor que o disponível = linha apertada demais (jogando velocidade fora); o app pode comparar o raio percorrido vs o raio geométrico máximo do traçado.
**Relacionado:** `U-LINE-03`, `U-LINE-04`.

#### `[U-LINE-03]` Apex geométrico vs late apex
**Conceito:** O **apex geométrico** (ponto médio do interior da curva) maximiza o raio puro e a velocidade mínima — ideal para curvas isoladas sem reta importante na saída. O **late apex** (apex deslocado para depois) sacrifica um pouco de velocidade de entrada/meio para **endireitar a saída mais cedo**, permitindo acelerar antes e mais forte — ideal quando há reta após a curva.
**Na pilotagem:** A escolha do apex é uma decisão de **onde gastar o orçamento de velocidade**. Errar para early apex (apex cedo) é o erro mais comum e custoso: força a fechar o volante na saída, gera understeer/saída comprometida (`SIG-10`).
**Telemetria:** Posição do `Speed` mínimo (V-min) em `LapDistPct` revela onde está o apex efetivo. V-min cedo demais + necessidade de aumentar `SteeringWheelAngle` na saída = early apex.
**Relacionado:** `U-LINE-04`, `SIG-10`, `SIG-15`.

#### `[U-LINE-04]` Slow-in / fast-out e a prioridade da reta seguinte
**Conceito:** O tempo numa volta é dominado pelas **retas**, e a velocidade numa reta é "semeada" pela velocidade de **saída** da curva que a precede — e essa vantagem se **multiplica** por todo o comprimento da reta. Logo: sacrificar um pouco de velocidade de entrada/meio para otimizar a saída de uma curva que dá numa reta longa quase sempre vale a pena. Quanto mais longa a reta, mais a saída importa e menos a entrada importa.
**Na pilotagem:** Priorize matematicamente: curva → reta longa = late apex, foco total na tração de saída. Curva → outra curva imediata = otimizar a transição, não a saída isolada (`U-LINE-05`).
**Telemetria:** Correlacione `Speed` na saída da curva (fase 6) com o `Speed` no fim da reta seguinte; o app deve **ponderar o custo de cada erro pelo comprimento da reta a jusante** (`DIAG-05`).
**Relacionado:** `U-LINE-03`, `U-LINE-06`, `DIAG-05`.

#### `[U-LINE-05]` Curvas em sequência e a curva de compromisso
**Conceito:** Curvas encadeadas (S, esses, complexos) não podem ser otimizadas isoladamente — a saída de uma é a entrada da outra. Frequentemente você **sacrifica** a primeira curva (linha "errada" para ela sozinha) para acertar a entrada da segunda, especialmente se a segunda dá numa reta. A "curva de compromisso" é resolver a sequência como um sistema, não como partes.
**Na pilotagem:** Pense de trás para frente: identifique a curva mais importante do complexo (a que precede a reta mais longa) e construa a linha das anteriores para servir a ela.
**Telemetria:** Analise complexos como **um segmento único** no delta-t; otimizar uma curva e perder na seguinte resulta em delta neutro ou negativo — o app deve avaliar o saldo do conjunto.
**Relacionado:** `U-LINE-04`, `DIAG-01`, `DIAG-05`.

#### `[U-LINE-06]` Velocidade mínima de curva ≠ tempo mínimo de volta
**Conceito:** Maximizar a V-min de uma curva (apex geométrico) **não** minimiza necessariamente o tempo de volta. O tempo mínimo é uma otimização **global** que troca velocidade entre curvas e retas. Às vezes a volta mais rápida tem uma V-min mais *baixa* numa curva específica porque isso habilita uma saída melhor para uma reta longa. Confundir o ótimo **local** (essa curva) com o **global** (a volta) é um erro analítico clássico.
**Na pilotagem:** Não persiga recordes de velocidade de apex curva a curva; persiga o relógio no fim da volta. Um setor pode ficar "pior" num ponto e a volta inteira melhorar.
**Telemetria:** Cuidado ao otimizar canais locais (V-min, `LatAccel` de pico) — sempre valide contra `LapDeltaTo...` do **segmento + reta seguinte**, nunca do ponto isolado.
**Relacionado:** `U-LINE-04`, `U-INP-03`, `DIAG-01`.

### 1.5 Frenagem

#### `[U-BRK-01]` Threshold braking — o pico de desaceleração
**Conceito:** A desaceleração máxima acontece com o pneu no pico do slip ratio (`U-TIRE-03`), **não** com a roda travada. Travar reduz a desaceleração E elimina a capacidade de dirigir (roda travada = força lateral ~zero). O threshold é aplicar a pressão máxima que mantém o pneu logo abaixo do travamento. Em reta, a frenagem é ainda mais forte logo após o ponto de frenagem (carga ainda alta, sem demanda lateral) e deve **diminuir** conforme você começa a curvar (orçamento sendo dividido — `U-TIRE-04`).
**Na pilotagem:** O perfil de freio ideal é tipicamente um **pico forte e precoce** seguido de liberação progressiva — não uma pressão constante. "Bater" no freio com força e depois sangrar a pressão.
**Telemetria:** `Brake` deve subir rápido a um pico alto logo após o ponto de frenagem, com `LongAccel` (negativo) atingindo o máximo do carro sem que `*speed` das rodas colapse abaixo de `Speed` (= sem travar). Curva de `Brake` "em platô baixo" = sub-frenagem (`SIG-13`).
**Relacionado:** `U-BRK-02`, `U-TIRE-03`, `SIG-07`, `SIG-13`.

#### `[U-BRK-02]` Brake release — a liberação é tão importante quanto a aplicação
**Conceito:** *Como* você sai do freio governa a transferência de carga na entrada (`U-LOAD-02/04`). Soltar o freio de uma vez devolve carga à traseira de repente (dianteira perde mordida → understeer; ou traseira recarrega → instabilidade). Soltar **progressivamente** mantém carga na dianteira durante a inscrição (trail braking — `U-BRK-03`), preservando a rotação.
**Na pilotagem:** A liberação do freio deve ser **espelhada** com a entrada do volante: conforme o volante entra, o pé sai do freio na mesma cadência, mantendo o vetor na borda do círculo. É um cruzamento suave, não dois eventos separados.
**Telemetria:** A inclinação de descida de `Brake` deve coincidir com a subida de `SteeringWheelAngle`. Um "degrau" (freio cai a zero antes de o volante entrar) revela coasting/transição perdida (`SIG-12`).
**Relacionado:** `U-BRK-03`, `U-LOAD-04`, `SIG-12`.

#### `[U-BRK-03]` Trail braking — física, benefício e risco
**Conceito:** Manter parte do freio enquanto inicia a curva. Física: a carga retida na dianteira (`U-LOAD-02`) dá grip para inscrever, e a traseira aliviada (`U-LOAD-04`) **roda o carro** (rotação). Benefícios: ponto de frenagem mais tarde, melhor inscrição, rotação que aponta o carro para o apex. Risco: aliviar a traseira demais = oversteer de entrada (`SIG-04`); por isso é um dial dosado, não um "tudo ou nada".
**Na pilotagem:** Quantidade de trail = quantidade de rotação desejada, calibrada por carro e curva. Curvas lentas/de gancho pedem mais trail (mais rotação); curvas rápidas pedem pouco ou nenhum (estabilidade > rotação). Excesso de trail num carro de traseira leve = recipe para o snap.
**Telemetria:** Sobreposição de `Brake`>0 e `SteeringWheelAngle`>0 na entrada; `LongAccel` e `LatAccel` ambos significativos (borda diagonal do G-G); `YawRate` subindo durante a sobreposição = rotação sendo gerada.
**Relacionado:** `U-LOAD-04`, `U-TIRE-04`, `U-YAW-02`, `SIG-04`.

#### `[U-BRK-04]` Brake bias e travamentos
**Conceito:** O bias distribui a pressão de freio entre eixos (% dianteiro). Bias muito à frente = dianteira trava primeiro (understeer de frenagem, perda de direção); muito atrás = traseira trava primeiro (instabilidade, oversteer de frenagem — perigoso). O bias ótimo coloca os dois eixos perto do travamento juntos, e muda com a transferência: à medida que a carga vai para a frente na frenagem, dá para "migrar" bias para trás. Em curva, a traseira aliviada trava mais fácil — bias muito traseiro pune o trail braking.
**Na pilotagem:** Travamento dianteiro: o carro vai reto, fumaça no pneu da frente → aliviar pressão e/ou mover bias para trás. Travamento traseiro na frenagem: traseira "anda" → mover bias para frente, urgente. Saber **qual** roda travou é o diagnóstico.
**Telemetria:** Compare `LFspeed`/`RFspeed` vs `LRspeed`/`RRspeed` contra `Speed` sob `Brake` alto. Roda(s) cuja velocidade angular despenca abaixo da do carro = travando. `DcBrakeBias` informa o ajuste atual; `*brakeLinePress` mostra a distribuição de pressão real.
**Relacionado:** `U-BRK-01`, `SIG-07`, `SIG-08`.

#### `[U-BRK-05]` Modulação de freio e o link com ABS
**Conceito:** Sem ABS, manter o pico exige o pé do piloto modular a pressão na iminência do travamento (cadência fina, não pulsos grosseiros). Com ABS (carros modernos/GT3 — `GT3-03`), o sistema modula por você perto do limite, permitindo aplicar **mais** pressão e focar menos na modulação — mas o ABS atuando custa um pouco de desaceleração ótima e muda a técnica de release.
**Na pilotagem:** Carro sem ABS recompensa pé sensível e penaliza "chutar" o freio. Carro com ABS recompensa frear forte e cedo, mas confiar demais no ABS em trail braking pode mascarar perda de grip traseiro.
**Telemetria:** `BrakeABSactive` (onde disponível) marca a atuação; divergência entre `BrakeRaw` (pé) e `Brake` (efetivo no carro) também revela intervenção. Sem o canal de ativação, infira pelo serrilhado de `*speed` das rodas perto do limite.
**Relacionado:** `GT3-03`, `U-BRK-01`, `U-BRK-04`.

#### `[U-BRK-06]` O erro de "frear cedo e leve"
**Conceito:** Um dos maiores ladrões de tempo amador: começar a frenagem cedo demais com pressão baixa, "por segurança". Isso desperdiça o pico de desaceleração do pneu (`U-BRK-01`), alonga o tempo sob freio, reduz a velocidade carregada na pista inteira antes da curva e tipicamente leva a chegar lento ao apex sem nem usar o grip disponível.
**Na pilotagem:** O correto é frear **mais tarde e mais forte**, com pico precoce e liberação progressiva. A confiança para isso vem de saber onde está o limite (treino + telemetria), não de adivinhar.
**Telemetria:** Ponto de frenagem (início de `Brake`>0) cedo em `LapDistPct` + pico de `Brake` baixo + `LongAccel` de pico bem abaixo do máximo do carro = assinatura clássica (`SIG-13`).
**Relacionado:** `SIG-13`, `U-BRK-01`.

### 1.6 Tração e aceleração

#### `[U-ACC-01]` O limite de tração na saída
**Conceito:** Na saída, o orçamento de grip traseiro é dividido entre força lateral (ainda em curva) e longitudinal (tração) — círculo de atrito de novo (`U-TIRE-04`). Aplicar torque demais cedo demais, com o carro ainda muito virado, satura a traseira longitudinalmente e sobra pouco lateral → wheelspin/oversteer de potência (`SIG-05`). Conforme o carro endireita (volante abrindo), mais orçamento fica livre para tração → você pode aplicar mais acelerador.
**Na pilotagem:** O acelerador "abre" na mesma proporção que o volante "fecha". O ideal é tocar o acelerador no apex e progredir até o fundo exatamente conforme a curvatura diminui — uma curva de `Throttle` que espelha a abertura do volante.
**Telemetria:** `Throttle` subindo enquanto `SteeringWheelAngle` desce; sem queda de `Speed`/sem wheelspin (`*speed` traseiro coerente com `Speed`). Aplicação a fundo cedo demais aparece como wheelspin ou queda de `LatAccel`.
**Relacionado:** `U-ACC-02`, `U-TIRE-04`, `SIG-05`, `SIG-09`.

#### `[U-ACC-02]` Modulação de acelerador e wheelspin
**Conceito:** Patinar a roda motriz (`U-TIRE-03`, slip ratio alto) reduz tração e aquece/degrada o pneu. Em curva, wheelspin também tira força lateral da traseira (oversteer). A aplicação ótima mantém o slip ratio traseiro no pico — progressiva, não em degrau.
**Na pilotagem:** Em carros potentes (GT3, F4), a saída é gerenciamento de torque: progressão suave, eventualmente short-shift (`U-ACC-04`) para reduzir torque na roda. Em carros fracos (MX-5, FF1600), wheelspin é raro e o jogo é o oposto — não desperdiçar momentum (`MX5-04`).
**Telemetria:** Roda motriz (`LRspeed`/`RRspeed` em tração traseira) com velocidade angular acima da implícita por `Speed` = wheelspin. `Throttle` a fundo com `Speed` estagnando = patinando. Em carros com TC, inferir corte por `Throttle` alto + RPM oscilando + falta de aceleração.
**Relacionado:** `U-ACC-01`, `GT3-04`, `SIG-09`.

#### `[U-ACC-03]` Acelerador e rotação (oversteer de potência como ferramenta)
**Conceito:** O acelerador é um controle de **balanço**, não só de velocidade. Em tração traseira, pisar transfere carga para trás (estabiliza/traciona) mas, se a traseira já está no limite lateral, o torque a faz escorregar (rotação/oversteer de potência). Em tração dianteira, pisar pode **puxar** o carro para fora (understeer de potência). O diferencial (`U-SET-04`) modula fortemente esse efeito.
**Na pilotagem:** Pilotos avançados usam pequenas variações de acelerador para ajustar o ângulo do carro na saída — "rodar" no acelerador para apontar e depois endireitar. Requer traseira e diff previsíveis.
**Telemetria:** Correlação entre `Throttle` e `YawRate`/`β` na saída revela quanto o acelerador está rotacionando o carro. Útil para distinguir oversteer de potência (vem com `Throttle`) de lift-off (vem com queda de `Throttle`).
**Relacionado:** `U-SET-04`, `U-BAL-03`, `U-YAW-02`.

#### `[U-ACC-04]` Short-shifting e gestão de torque para tração
**Conceito:** Trocar para a marcha mais alta antes do corte reduz o torque na roda (a marcha mais longa multiplica menos), o que pode **melhorar a tração** na saída de curvas lentas em carros muito potentes, ao custo de estar fora da faixa ideal de potência. Tradeoff entre tração e potência bruta.
**Na pilotagem:** Útil em GT3/fórmula em curvas lentas escorregadias ou com pneu degradado. Em carros fracos raramente compensa (você precisa de toda a potência — `MX5-04`).
**Telemetria:** `Gear` subindo em RPM abaixo do shift ideal (`ShiftIndicatorPct`); cruze com redução de wheelspin (`*speed` traseiro) para validar o ganho de tração.
**Relacionado:** `U-ACC-02`, `GT3-04`.

### 1.7 Dinâmica de guinada (yaw) e rotação

#### `[U-YAW-01]` Momento de guinada — como o carro gira no eixo vertical
**Conceito:** Rotação (mudança de direção do nariz) é causada por um momento de guinada em torno do eixo vertical, gerado pelo desbalanço de forças laterais entre eixos dianteiro e traseiro. Você cria/modula esse momento com: **direção** (gera força lateral na dianteira), **freio em curva** (alivia a traseira, `U-LOAD-04`), **acelerador** (carrega/satura a traseira, `U-ACC-03`) e o **diferencial** (`U-SET-04`).
**Na pilotagem:** "Fazer o carro girar" não é só volante — é orquestrar freio, acelerador e diff para gerar a rotação certa na hora certa. Um carro que "não gira" no apex pode precisar de mais rotação na entrada (trail) em vez de mais volante.
**Telemetria:** `YawRate` é a medida direta da rotação. Correlacione com a fonte: `YawRate` subindo durante `Brake`+`SteeringWheelAngle` = rotação por trail; durante `Throttle` = rotação por potência.
**Relacionado:** `U-YAW-02`, `U-YAW-03`, `U-LOAD-04`.

#### `[U-YAW-02]` Rotação na entrada vs na saída
**Conceito:** Toda a rotação necessária para apontar o carro à saída deve idealmente acontecer **na entrada e no apex** (via trail braking + carga, `U-LOAD-04`), de modo que na saída o carro já esteja apontado e você possa abrir o volante e acelerar (`U-ACC-01`). Rotação que sobra para a saída = você ainda virando quando deveria estar acelerando = saída comprometida e/ou oversteer de potência.
**Na pilotagem:** "Gire o carro cedo." Resolver a direção na entrada libera a saída. Pilotos que tentam girar o carro com o acelerador na saída (em vez de tê-lo apontado no apex) sofrem com tração e consistência.
**Telemetria:** Pico de `YawRate` deve ocorrer em torno do apex/início da saída, não tardiamente. `YawRate` ainda alto na fase 6 (exit) com `Throttle` subindo = rotação atrasada.
**Relacionado:** `U-YAW-01`, `U-LINE-03`, `SIG-15`.

#### `[U-YAW-03]` Yaw rate vs steering — o detector de balanço
**Conceito:** Comparar a **rotação real** (`YawRate`) com a **rotação comandada** (implícita em `SteeringWheelAngle` e `Speed`) revela o balanço diretamente. Rotação real **menor** que a comandada (muito volante, pouco yaw) = understeer. Rotação real **maior** que a comandada (pouco volante, muito yaw, ou contra-esterço) = oversteer. O body slip `β` complementa: `β` crescente confirma a traseira saindo.
**Na pilotagem:** Este é o "test universal de balanço" que o app pode computar em qualquer ponto da pista, sem depender da sensação do piloto.
**Telemetria:** Canal derivado: `YawRate_esperado = Speed / R_geométrico` ou via ângulo de volante e geometria; compare com `YawRate` medido. Diferença assinada = índice de under/oversteer contínuo. Some `β` para robustez.
**Relacionado:** `U-BAL-01`, `U-BAL-04`, `DIAG-03`.

### 1.8 Inputs e o princípio do tempo mínimo

#### `[U-INP-01]` Direção — ângulo, slip e mãos
**Conceito:** O volante comanda o slip angle dianteiro (`U-TIRE-02`), não diretamente a trajetória. Há um ângulo ótimo (no pico de grip dianteiro); além dele, mais volante = menos força lateral = mais understeer. Movimentos de volante devem ser **mínimos e precisos** — cada correção excedente custa grip e estabilidade. Mãos "ocupadas" (corrigindo o tempo todo) denunciam ou um carro mal balanceado ou over-condução.
**Na pilotagem:** Vire o necessário e **segure** — não fique "procurando" o apex com microcorreções. Olhe longe (para a saída); os olhos guiam as mãos. Suavidade no volante = controle fino da taxa de transferência lateral (`U-LOAD-06`).
**Telemetria:** `SteeringWheelAngle` deve ser limpo: subir, manter, descer. "Serrilhado" de alta frequência (`SIG-14`) = over-condução ou perseguindo um carro instável. Reversões de sinal = contra-esterço (oversteer).
**Relacionado:** `U-INP-02`, `SIG-14`, `U-TIRE-08`.

#### `[U-INP-02]` Suavidade vs agressividade — quando cada uma
**Conceito:** Suavidade vence porque controla a **taxa** de transferência de carga (`U-LOAD-06`), mantendo os quatro pneus equilibrados perto do pico (`U-TIRE-05`). Mas suavidade não é lentidão: a aplicação pode ser **rápida e decidida** desde que **progressiva** (sem degraus). Há momentos para agressividade calculada (um turn-in incisivo para gerar rotação, um "snap" de volante para acertar um chicane), mas a regra default é progressão.
**Na pilotagem:** Carros pesados/aero (GT3) recompensam suavidade pela inércia (`GT3-06`); carros leves (fórmula) toleram inputs mais rápidos mas punem brusquidão por terem pouca inércia "perdoadora" (`FRM-05`).
**Telemetria:** Taxas de variação (`d/dt`) de `Throttle`, `Brake`, `SteeringWheelAngle` e os picos de `*shockVel` medem a brusquidão. Inputs progressivos = transições suaves no G-G; degraus = picos e buracos.
**Relacionado:** `U-LOAD-06`, `U-TIRE-05`, `GT3-06`, `FRM-05`.

#### `[U-INP-03]` O círculo de atrito como bússola — viver na borda
**Conceito:** A síntese de toda a técnica: a cada instante, o vetor de aceleração total (`sqrt(LatAccel² + LongAccel²)`) deve estar **na borda** do círculo de atrito do carro. Tempo perdido = qualquer instante em que o vetor está **dentro** do círculo (grip sobrando). Os maiores buracos ficam nas **transições** (freio↔curva, curva↔acelerador), onde amadores deixam o grip cair. Andar rápido é encadear as fases mantendo o vetor sempre na borda, girando-o do longitudinal para o lateral e de volta.
**Na pilotagem:** A imagem mental do piloto rápido é "manter a bolinha na borda do prato" — nunca deixar a aceleração total relaxar entre fases. Trail braking e pickup progressivo existem justamente para tampar esses buracos.
**Telemetria:** O **diagrama G-G** é a ferramenta-rainha. Borda bem preenchida e contínua = bom; buracos perto dos eixos diagonais = grip desperdiçado nas transições. O canal derivado "uso do círculo (%)" mostra, ponto a ponto na volta, onde você está abaixo de 100%.
**Relacionado:** `U-TIRE-04`, `U-BRK-02`, `U-ACC-01`, `SIG-12`.

#### `[U-INP-04]` Coasting — o pecado capital do tempo de volta
**Conceito:** Coasting = o intervalo em que **nem freio nem acelerador** estão aplicados (vácuo entre os pedais). É grip 100% desperdiçado: o carro está "à deriva", sem usar o orçamento longitudinal nem para frear nem para acelerar, tipicamente porque o piloto saiu do freio cedo e ainda não confia em acelerar. Frações de segundo de coasting por curva somam muito numa volta.
**Na pilotagem:** A transição ideal é **freio → acelerador quase sem hiato** (com a sobreposição correta via trail e pickup). Eliminar o coasting é frequentemente o ganho mais fácil e imediato para um piloto intermediário.
**Telemetria:** Janelas em que `Brake ≈ 0` **e** `Throttle ≈ 0` simultaneamente (com o carro em movimento, fora de retas onde isso é normal antes de uma frenagem). O app deve medir o **tempo total de coasting por volta** e localizá-lo por curva (`SIG-12`).
**Relacionado:** `U-INP-03`, `U-BRK-02`, `U-ACC-01`, `SIG-12`.

---

## PARTE 3 — TELEMETRIA: CANAIS, DERIVADOS E MÉTODO

#### `[TEL-01]` Mapa de canais por domínio físico
Agrupamento para guiar qual canal olhar por tipo de pergunta (nomes e unidades na Parte 0.5):
- **Velocidade/linha:** `Speed`, `LapDist`, `LapDistPct`, derivado raio `Speed/YawRate`.
- **Balanço/rotação:** `YawRate`, `SteeringWheelAngle`, `SteeringWheelTorque`, derivados `β` e under/oversteer index (`U-YAW-03`).
- **Frenagem:** `Brake`, `BrakeRaw`, `LongAccel`, `*brakeLinePress`, `*speed` (travamento), `DcBrakeBias`, `BrakeABSactive`.
- **Tração/saída:** `Throttle`, `ThrottleRaw`, `LongAccel`, `*speed` traseiro (wheelspin), `RPM`, `Gear`, `DcTractionControl`.
- **Transferência de carga:** `LongAccel`, `LatAccel`, `*shockDefl`, `*shockVel`, `*rideHeight`, `RollRate`, `PitchRate`.
- **Pneu (estado/janela):** `*tempCL/CM/CR`, `*tempL/M/R`, `*pressure`, `*coldPressure`, `*wear`.
- **Combinado/limite:** derivados `G_total` e diagrama G-G (`LatAccel`×`LongAccel`).

#### `[TEL-02]` Canais derivados que o app deve calcular (com fórmulas)
Reforço operacional da Parte 0.6 — estes são o motor analítico:
- **Body slip `β`** = `atan2(VelocityY, VelocityX)` [rad]. Núcleo de oversteer/rotação.
- **`G_total`** = `sqrt(LatAccel² + LongAccel²)` [m/s²]. Constrói o G-G.
- **Uso do círculo (%)** = `G_total / G_max(carro,pista)`. `G_max` estimado pelo percentil alto do envelope G-G de boas voltas.
- **Raio instantâneo `R`** = `Speed / YawRate` (ou `Speed²/LatAccel`) [m]. Linha real.
- **Slip ratio por roda** = `(ω·r_eff − Speed)/Speed`, `ω` = `*speed` [rad/s], `r_eff` = raio de rolamento. Travamento (<0) / wheelspin (>0 na motriz).
- **Under/oversteer index** = `YawRate_medido − YawRate_esperado`, com `YawRate_esperado` derivado de geometria/velocidade. Assinado: + = oversteer, − = understeer (calibrar sinal!).
- **Tempo de coasting/volta** = soma das amostras com `Brake<ε` e `Throttle<ε` em movimento.
- **Delta-t segmentado** = derivada de `LapDeltaToBestLap`/`LapDeltaToSessionBestLap` por trecho, atribuída a fases de curva.

> **Cuidado de unidades/sinais:** padronize tudo para SI antes de calcular; valide a polaridade de `LatAccel`, `YawRate`, `VelocityY`, `SteeringWheelAngle` numa curva conhecida (Parte 0.5, regra de ouro). Aplique suavização leve (ex.: média móvel curta) antes de derivar taxas para não amplificar ruído.

#### `[TEL-03]` Metodologia de comparação
**Conceito:** Telemetria isolada não diagnostica — **comparação** diagnostica. Fluxo:
1. **Escolha a referência:** sua melhor volta limpa, a volta ideal teórica do iRacing, ou um piloto mais rápido (mesmo carro/pista/condições).
2. **Alinhe por distância, não por tempo:** use `LapDistPct` (ou `LapDist`) como eixo X comum, para que os mesmos pontos da pista coincidam entre voltas.
3. **Sobreponha os canais** (`Speed`, `Throttle`, `Brake`, `SteeringWheelAngle`) e o **delta-t** (`U-LINE`/`TEL-02`).
4. **Localize onde o delta cresce** (onde você perde tempo) **antes** de explicar por quê.
5. **Classifique a fase** (entrada/meio/saída — `TEL-05`) do trecho de perda.
6. **Meça as assinaturas** da Parte 3B naquele trecho.
7. **Hipótese → prescrição → validação** (Parte 5).
**Relacionado:** `DIAG-01`, `DIAG-02`, `U-LINE-04`.

#### `[TEL-04]` Os traços-chave e como lê-los
**Conceito:** As visualizações que carregam o diagnóstico:
- **Speed trace** (Speed × LapDist): a "impressão digital" da volta. Onde sua curva está abaixo da referência mostra onde você perde velocidade (e o delta-t cresce ali). V-min revela apex e excesso/falta de velocidade de curva.
- **Throttle/Brake/Steering overlay:** revela técnica — sobreposição (trail/pickup), coasting (gap), brusquidão (degraus), ponto e pressão de frenagem.
- **Diagrama G-G** (`LatAccel`×`LongAccel`): o círculo de atrito medido — preenchimento da borda = uso de grip; buracos nas transições = tempo perdido (`U-INP-03`).
- **Steered angle × LatAccel:** detector de understeer (muito volante para pouca lateral, e queda de `SteeringWheelTorque`).
- **YawRate × Steering / β:** detector de oversteer e de rotação (`U-YAW-03`).
**Relacionado:** `TEL-02`, `U-INP-03`, `U-YAW-03`.

#### `[TEL-05]` Segmentação por fase a partir do dado
**Conceito:** Para classificar e diagnosticar por fase, o app identifica as fases automaticamente:
- **Braking (1):** `Brake` > limiar e `SteeringWheelAngle` ≈ 0.
- **Turn-in/Trail (2–3):** `Brake` > limiar **e** `SteeringWheelAngle` crescendo (sobreposição).
- **Apex/V-min (4):** mínimo local de `Speed`; `Brake`≈0 e `Throttle`≈0 ou em transição; `|SteeringWheelAngle|` máximo.
- **Pickup (5):** `Throttle` crescendo **e** `SteeringWheelAngle` decrescendo (sobreposição).
- **Exit (6):** `Throttle` alto/cheio e `SteeringWheelAngle`→0.
Detecte a curva pelos picos de `|SteeringWheelAngle|`/`LatAccel` e segmente em torno do V-min. Isso dá os "trechos" para o delta-t e para casar as assinaturas (Parte 3B) à fase certa.
**Relacionado:** `U-LINE-01`, `U-BAL-04`, `DIAG-02`.

---

## PARTE 3B — CATÁLOGO DE ASSINATURAS (sintoma → telemetria → correção)

Cada entrada mapeia um sintoma a sua assinatura nos canais, causas prováveis, correção de **piloto** e direção de **setup**. Use sempre **com a fase de curva** correta (`TEL-05`) e validando contra o **custo em tempo** (`DIAG-05`).

#### `[SIG-01]` Understeer de entrada (turn-in)
**Assinatura:** No turn-in, `SteeringWheelAngle` sobe mas `LatAccel`/`YawRate` não acompanham (rotação real < comandada, `U-YAW-03`); `SteeringWheelTorque` baixo/caindo (`U-TIRE-08`); raio real (`Speed/YawRate`) maior que o desejado; frequentemente `Speed` de entrada alto demais.
**Causa provável:** Excesso de velocidade de entrada (energia que a dianteira não segura); freio liberado cedo demais (dianteira descarregada antes de inscrever, `U-LOAD-02`); volante além do pico de slip (`U-TIRE-02`); dianteira fria/pressão errada.
**Correção (piloto):** Frear um pouco mais (chegar com menos energia) e/ou **trail braking** — segurar mais freio no turn-in para carregar a dianteira (`U-BRK-03`); não adicionar volante (piora). Olhar o apex mais tarde.
**Relacionado:** `U-BAL-02`, `U-BRK-03`, `U-LOAD-04`.

#### `[SIG-02]` Understeer de meio de curva (apex)
**Assinatura:** Na fase 4 (pedais neutros, `|SteeringWheelAngle|` máximo), `LatAccel` abaixo do potencial e raio real grande; `SteeringWheelTorque` baixo; perfil de `*tempCL/CM/CR` dianteiro possivelmente fora da janela.
**Causa provável:** Balanço **mecânico** com viés dianteiro (regime permanente, `U-BAL-06`) — molas/barras/pressão/camber; ou aero em curva rápida (`U-SET-08`).
**Correção (piloto):** Pouco a fazer puramente na técnica além de não exagerar volante e ajustar a linha (apex mais tarde para abrir o raio); confirmar V-min adequada (nem rápido demais).
**Relacionado:** `U-SET-02`, `U-BAL-04`, `U-SET-08`.

#### `[SIG-03]` Understeer de saída (power understeer / push)
**Assinatura:** Na saída (fase 5–6), ao subir `Throttle` o carro lava para fora: `LatAccel` cai e raio cresce conforme `Throttle` aumenta; em tração dianteira, `*speed` dianteiro pode patinar.
**Causa provável:** Acelerador transfere carga para trás e alivia a frente (`U-LOAD-02`); em FWD, torque na dianteira reduz grip lateral dela; diff power muito travado segurando o carro reto.
**Correção (piloto):** Esperar o carro endireitar mais antes de pisar fundo (rotação resolvida na entrada, `U-YAW-02`); progressão de acelerador mais paciente (`U-ACC-01`).
**Relacionado:** `U-ACC-01`, `U-SET-04`, `U-YAW-02`.

#### `[SIG-04]` Oversteer de entrada (trail-braking oversteer)
**Assinatura:** Durante a sobreposição `Brake`+`SteeringWheelAngle`, `β`/`YawRate` disparam acima do comandado; pode aparecer contra-esterço (sinal de `SteeringWheelAngle` invertendo); traseiro interno (`*shockDefl`) muito estendido / `*speed` traseiro baixo (perto de travar).
**Causa provável:** Trail braking demais para o carro (traseira aliviada além do limite, `U-LOAD-04`); bias muito traseiro (traseira trava, `U-BRK-04`); engine braking forte; carro de traseira leve.
**Correção (piloto):** Reduzir a pressão de freio retida no turn-in (menos trail); liberar o freio um pouco mais cedo/suave; contra-esterço proporcional e devolver rápido.
**Relacionado:** `U-BAL-03`, `U-BRK-04`, `U-LOAD-04`.

#### `[SIG-05]` Oversteer de potência (saída)
**Assinatura:** Ao aplicar `Throttle` na saída, `β`/`YawRate` crescem **junto com** o acelerador; roda(s) motriz(es) (`LRspeed`/`RRspeed`) acima do implícito por `Speed` (wheelspin); em carros com TC, cortes inferidos (acelerador alto, RPM oscilando).
**Causa provável:** Torque demais cedo demais com o carro ainda virado (orçamento traseiro saturado longitudinal, `U-TIRE-04`); diff power muito aberto; traseira sem grip (pressão/temperatura/aero).
**Correção (piloto):** Progressão de acelerador mais suave e mais tardia; esperar o carro apontar (`U-YAW-02`); short-shift em curvas lentas (`U-ACC-04`).
**Relacionado:** `U-ACC-01`, `U-ACC-03`, `U-SET-04`.

#### `[SIG-06]` Lift-off / snap oversteer
**Assinatura:** Sequência temporal característica: queda **rápida** de `Throttle` no meio da curva → centésimos depois, `β`/`YawRate` disparam; `PitchRate` mostra transferência brusca para frente. Distingue-se de `SIG-05` porque vem do **alívio** do acelerador, não da aplicação.
**Causa provável:** Tirar o pé abruptamente com o carro carregado (`U-BAL-05`); engine braking; coast do diff aberto; traseira leve/aero traseiro baixo.
**Correção (piloto):** Nunca soltar o acelerador de repente em curva carregada — reduzir progressivo; planejar a desaceleração antes de virar.
**Relacionado:** `U-BAL-05`, `U-LOAD-02`, `U-SET-04`.

#### `[SIG-07]` Travamento de roda dianteira
**Assinatura:** Sob `Brake` alto, `LFspeed`/`RFspeed` (×raio) caem **abaixo** de `Speed` (slip ratio dianteiro muito negativo); `LatAccel` colapsa (roda travada não dirige); carro vai reto apesar de `SteeringWheelAngle`.
**Causa provável:** Pressão de freio acima do pico (`U-BRK-01`); bias muito à frente (`U-BRK-04`); frear forte demais já com volante (orçamento dividido, `U-TIRE-04`); pneu frio.
**Correção (piloto):** Aliviar levemente a pressão (threshold), modular; reduzir freio conforme adiciona volante; não frear no pico já em curva.
**Relacionado:** `U-BRK-01`, `U-BRK-04`, `U-TIRE-03`.

#### `[SIG-08]` Travamento de roda traseira / instabilidade na frenagem
**Assinatura:** Sob `Brake`, `LRspeed`/`RRspeed` caem abaixo de `Speed` (e abaixo das dianteiras); `β`/`YawRate` instáveis em **reta** sob freio; carro "anda" de traseira. **Perigoso.**
**Causa provável:** Bias muito traseiro (`U-BRK-04`); engine braking + downshift agressivo travando as motrizes; traseira leve na transferência (`U-LOAD-02`).
**Correção (piloto):** Reduzir pressão; downshifts mais tardios e com blip suave; mover bias à frente imediatamente.
**Relacionado:** `U-BRK-04`, `U-BAL-03`, `U-SET-04`.

#### `[SIG-09]` Wheelspin na saída
**Assinatura:** `Throttle` alto com `Speed` estagnando; roda motriz (`*speed` traseiro em RWD) acima do implícito por `Speed`; pode acompanhar oversteer (`SIG-05`); `*tempCL/CM/CR` da motriz subindo (degradação por patinar).
**Causa provável:** Torque > grip longitudinal traseiro (`U-TIRE-03`); aplicação cedo/brusca; curva lenta + carro potente; pneu degradado/frio.
**Correção (piloto):** Progressão mais suave; short-shift (`U-ACC-04`); esperar endireitar.
**Relacionado:** `U-ACC-02`, `GT3-04`, `SIG-05`.

#### `[SIG-10]` Early apex (apex cedo)
**Assinatura:** V-min (`Speed` mínimo) ocorre **cedo** em `LapDistPct`; na saída, `SteeringWheelAngle` precisa **aumentar** (em vez de abrir) e/ou `Throttle` precisa recuar; saída para fora da pista ou understeer de saída forçado.
**Causa provável:** Erro de linha clássico — virou cedo demais, apex deslocado para o início da curva (`U-LINE-03`).
**Correção (piloto):** Atrasar o turn-in, mirar apex mais tarde (late apex, `U-LINE-03/04`); entrar mais por fora e mais reto.
**Relacionado:** `U-LINE-03`, `U-LINE-04`, `SIG-15`.

#### `[SIG-11]` V-min baixa demais / scrub (excesso de frenagem ou volante)
**Assinatura:** `Speed` no apex bem **abaixo** da referência sem ganho compensatório; `SteeringWheelAngle` grande com `LatAccel` não saturado (arrastando/scrub) ou freio levado longe demais para dentro da curva.
**Causa provável:** Frenagem excessiva/longa (chegou lento), volante demais (passou do pico, `U-TIRE-02`), ou medo/sub-confiança.
**Correção (piloto):** Carregar mais velocidade na entrada (frear menos/mais tarde), confiar no grip lateral; minimizar volante.
**Relacionado:** `U-LINE-06`, `U-BRK-06`, `SIG-02`.

#### `[SIG-12]` Coasting / gap freio→acelerador
**Assinatura:** Janela com `Brake≈0` **e** `Throttle≈0` simultaneamente, com o carro em curva/movimento (fora da reta pré-frenagem); buraco correspondente no diagrama G-G perto da transição; `LongAccel`≈0 nesse intervalo.
**Causa provável:** Saiu do freio cedo e demora a confiar no acelerador (`U-INP-04`); transição mal encadeada (`U-BRK-02`/`U-ACC-01`).
**Correção (piloto):** Espelhar liberação de freio com entrada de volante (trail) e tocar o acelerador mais cedo no apex; **eliminar o hiato**. Frequentemente o ganho mais rápido disponível.
**Relacionado:** `U-INP-04`, `U-INP-03`, `U-BRK-02`, `U-ACC-01`.

#### `[SIG-13]` Frear cedo e leve (sub-uso do pico de frenagem)
**Assinatura:** Início de `Brake`>0 cedo em `LapDistPct`; pico de `Brake` baixo; `LongAccel` de pico bem abaixo do máximo do carro (visto no G-G); duração sob freio longa.
**Causa provável:** Sub-confiança no ponto/pressão de frenagem (`U-BRK-06`).
**Correção (piloto):** Atrasar o ponto de frenagem e **bater** mais forte no freio (pico precoce), depois sangrar; subir o limite gradualmente com referência da telemetria.
**Relacionado:** `U-BRK-01`, `U-BRK-06`.

#### `[SIG-14]` Over-condução / steering serrilhado
**Assinatura:** `SteeringWheelAngle` com oscilações de alta frequência (microcorreções) em vez de um arco limpo; `LatAccel` "nervoso"; sem ganho de tempo — frequentemente perda.
**Causa provável:** Perseguir o apex com as mãos (`U-INP-01`), corrigir um carro instável, ou olhar perto demais.
**Correção (piloto):** Inputs mínimos: virar, **segurar**, abrir; olhar longe (saída); deixar o carro "correr". Se o carro está instável, tratar a instabilidade (setup/`SIG-04`/`SIG-06`).
**Relacionado:** `U-INP-01`, `DIAG-04`.

#### `[SIG-15]` Entrada gananciosa comprometendo a saída
**Assinatura:** Entrada (fase 1–3) **mais rápida** que a referência, mas saída (5–6) e `Speed` na reta seguinte **mais lentas**; V-min frequentemente cedo (`SIG-10`); delta-t fica negativo só **depois** do apex.
**Causa provável:** Priorizou velocidade de entrada/apex sobre a saída numa curva que dá em reta (violou `U-LINE-04`).
**Correção (piloto):** Sacrificar entrada por uma saída melhor (late apex); a métrica é o tempo no fim da reta, não a entrada (`U-LINE-04/06`).
**Relacionado:** `U-LINE-04`, `U-LINE-06`, `SIG-10`.

#### `[SIG-16]` Inconsistência (variância volta-a-volta)
**Assinatura:** Alta variância dos canais (`Brake` peak, ponto de frenagem, V-min, `SteeringWheelAngle`, linha via raio) entre voltas comparáveis; delta-t flutuante nos mesmos trechos.
**Causa provável:** Falta de referências/repetibilidade do piloto; ou carro no limite/instável que pune pequenas variações.
**Correção (piloto):** Estabelecer referências fixas (pontos de frenagem, de turn-in, de apex); buscar repetibilidade antes de buscar limite; treinar o trecho isolado.
**Relacionado:** `U-SET-09`, `DIAG-04`.

#### `[SIG-17]` Pneu fora da janela / degradação
**Assinatura:** `*tempCL/CM/CR` fora da janela alvo (frio ou superaquecido); ao longo do stint, queda progressiva do `LatAccel`/`LongAccel` de pico (envelope G-G encolhendo) e subida de `*wear`; perfil `CL/CM/CR` denunciando camber/pressão (`U-TIRE-06`).
**Causa provável:** Pressão/camber fora do ideal; estilo que desliza demais (cozinha o pneu); stint longo; out-lap insuficiente (frio).
**Correção (piloto):** Gerenciar deslizamento (menos scrub/wheelspin), aquecer no out-lap, adaptar a janela.
**Relacionado:** `U-TIRE-06`, `U-SET-05`, `U-SET-06`.

#### `[SIG-18]` Uso de zebra/kerb (bom vs ruim)
**Assinatura:** Picos de `VertAccel`/`*shockVel`/`*shockDefl` e `RollRate` ao tocar zebra; bom uso = leve, sem desestabilizar `β`/`YawRate`; ruim = pico violento que descarrega rodas e dispara perda de grip/instabilidade depois.
**Causa provável:** Linha sobre/sub-utilizando a zebra; setup rígido demais para a zebra; entrada brusca.
**Correção (piloto):** Usar a zebra que **alarga o raio** sem desestabilizar; evitar zebras agressivas que jogam o carro; tocar progressivo.
**Relacionado:** `U-LOAD-06`, `U-SET-03`, `U-LINE-02`.

---

## PARTE 4 — CAMADAS POR CLASSE (deltas não-redundantes)

> **Como ler esta parte:** Tudo nas Partes 1–3 é a base universal e **vale para todas as classes**. Aqui registramos **apenas os deltas** — onde cada conceito universal pesa **mais** ou **menos**, qual fenômeno domina, e qual a ênfase de telemetria. Cada entrada referencia os IDs universais sem repetir a teoria. Schema: **Físico** (o que é distinto) → **Implicação na pilotagem** → **Telemetria (ênfase)** → **Relacionado**.

### 4A MX-5 Cup — o carro de momentum puro

#### `[MX5-01]` Perfil da classe
**Físico:** Baixa potência (~180 cv), peso baixo-moderado, **aerodinâmica desprezível** (sem downforce significativo), pneu de baixa-média aderência, tração traseira, **sem ABS e sem TC**. O envelope G-G é pequeno e quase constante com a velocidade (o grip não cresce em curva rápida como no GT3).
**Implicação na pilotagem:** É o arquétipo do **momentum car**: como sobra pouca potência para recuperar velocidade perdida, **a velocidade mínima de curva (V-min) é o recurso mais valioso da volta**. Erros de frenagem/linha que matam V-min custam caríssimo porque o motor não "apaga" o erro na saída. Inverte parcialmente a regra geral do `U-LINE-04`: a saída ainda importa, mas o pecado mais caro aqui é **scrubar velocidade no meio da curva**.
**Telemetria (ênfase):** `Speed` no ponto de V-min (mais que pico de `LongAccel`); tempo total off-throttle; suavidade de `LatAccel`. O G-G é pequeno — o jogo é **preencher a borda lateral** sem desperdício.
**Relacionado:** `U-LINE-06`, `U-INP-04`, `FRM-02` (parentesco com FF1600).

#### `[MX5-02]` Conservação de momentum — V-min é rei
**Físico:** Reaceleração lenta (baixa relação potência/peso) significa que cada km/h abaixo do necessário no apex se propaga por toda a reta seguinte.
**Implicação na pilotagem:** Carregar o **máximo de velocidade de curva** que o grip permite, mantendo o carro num arco amplo e contínuo. Frear o estritamente necessário, soltar cedo o freio e deixar o carro **rolar** no limite lateral. "Lentidão" no apex aqui não é segurança — é tempo perdido que não volta.
**Telemetria (ênfase):** Comparar o **traço de `Speed` no fundo da curva** entre voltas/pilotos é o diagnóstico número um. Um V-min 2–3 km/h maior, sustentado, costuma valer mais que uma frenagem heroica.
**Relacionado:** `U-LINE-06`, `SIG-11`, `MX5-03`.

#### `[MX5-03]` Trail braking suave e de janela estreita
**Físico:** Sem ABS e com grip modesto, a janela entre "freio que ajuda a rotação" e "trava/empurra" é **estreita**.
**Implicação na pilotagem:** O trail braking (`U-BRK-03`) existe e ajuda a girar, mas deve ser **leve e progressivo** — sangrar uma pressão pequena até depois do turn-in, não mergulhar fundo com o carro já virando. Excesso de trail trava a dianteira (sem ABS para salvar) ou tira a traseira de leve.
**Telemetria (ênfase):** Sobreposição curta e suave de `Brake` decrescente com `SteeringWheelAngle` crescente; `Brake` deve chegar a zero pouco depois do turn-in. Picos de `BrakeRaw` no trail = brusquidão.
**Relacionado:** `U-BRK-02`, `U-BRK-03`, `SIG-07`.

#### `[MX5-04]` Sem auxílios — gestão manual de travamento e wheelspin
**Físico:** `DcABS` e `DcTractionControl` irrelevantes (carro não tem); `BrakeABSactive` não dispara. Toda a modulação é do pé do piloto.
**Implicação na pilotagem:** Threshold braking (`U-BRK-01`) e modulação de acelerador (`U-ACC-02`) são 100% responsabilidade do piloto. Travou, **alivia**; patinou, **alivia**. Não há rede de segurança eletrônica.
**Telemetria (ênfase):** Travamento se vê só pelos canais físicos — `*speed` de uma roda despencando vs `Speed` (dianteira na frenagem, `U-BRK-04`); wheelspin pela roda traseira girando acima do esperado na saída (`U-ACC-02`). Sem `BrakeABSactive` como atalho.
**Relacionado:** `U-BRK-01`, `U-ACC-02`, `SIG-07`, `SIG-09`.

#### `[MX5-05]` Suavidade — difícil estragar com potência, fácil estragar com brusquidão
**Físico:** Pouca potência limita o oversteer de potência (`U-ACC-03`); o carro raramente "sai" só por pisar fundo. Mas o grip baixo pune **inputs bruscos** que jogam carga e estouram o pneu.
**Implicação na pilotagem:** O erro típico do MX-5 não é excesso de agressão no acelerador — é **direção/freio bruscos** que desestabilizam o pouco grip disponível. Mãos suaves e contínuas (`U-INP-01/02`) extraem mais que tentar "atacar".
**Telemetria (ênfase):** `SteeringWheelAngle` em arco limpo (sem serrilhado, `SIG-14`); `LatAccel` sem picos nervosos; transições graduais de `Brake`/`Throttle`.
**Relacionado:** `U-INP-02`, `SIG-14`, `U-ACC-03`.

#### `[MX5-06]` Ênfase de telemetria e parentesco com FF1600
**Físico:** Mesma família de **momentum cars** do FF1600 (`FRM-02`): a diferença é tração traseira + carroceria fechada vs open-wheel, mas a **filosofia de velocidade de curva** é idêntica.
**Implicação na pilotagem:** O que se aprende de conservação de momentum no MX-5 transfere quase diretamente para o FF1600 (e vice-versa). A prescrição mestra para ambos: **proteja a V-min, seja suave, role o carro**.
**Telemetria (ênfase):** Prioridade de canais: `Speed` (V-min), tempo off-throttle, suavidade de `SteeringWheelAngle`/`LatAccel`, ponto de throttle-on. Pico de `LongAccel` e gestão de aero/aids são **secundários ou inexistentes** aqui.
**Relacionado:** `FRM-02`, `U-LINE-06`, `MX5-02`.

### 4B GT3 — potência, downforce e energia

#### `[GT3-01]` Perfil da classe
**Físico:** Alta potência (~500–600 cv), **downforce significativo**, peso alto (~1300 kg), pneus slick de alta aderência, **ABS e TC ajustáveis** (`DcABS`, `DcTractionControl`), freios potentes que aquecem. O envelope G-G é **grande e cresce com a velocidade** (downforce).
**Implicação na pilotagem:** É um carro de **gestão**: gestão de aderência dependente de velocidade, gestão de energia (freio/pneu) ao longo do stint, e uso inteligente dos auxílios. A massa torna os transientes (`U-LOAD-06`) **mais lentos** — recompensa antecipação e suavidade, pune inputs que pedem reação instantânea de um carro pesado.
**Telemetria (ênfase):** `BrakeABSactive`, `DcABS`, `DcTractionControl`, `*brakeLinePress`, temperaturas `*tempCL/CM/CR` e o **diagrama G-G por faixa de velocidade**.
**Relacionado:** `GT3-02`, `GT3-04`, `GT3-06`, `U-SET-08`.

#### `[GT3-02]` Downforce — grip que depende da velocidade
**Físico:** O grip cresce com **o quadrado da velocidade** (`U-SET-08`). Em curva rápida, o carro tem muito mais aderência que em curva lenta; o limite de `LatAccel` não é constante.
**Implicação na pilotagem:** **Confiar no downforce** em curvas rápidas — o instinto de frear/desacelerar como num carro de momentum desperdiça grip que só existe em alta. Em curvas lentas, o carro vira "sem asa" e exige mais paciência. Calibrar a confiança à velocidade é a habilidade central do GT3.
**Telemetria (ênfase):** `LatAccel` de pico **muito maior** em curvas rápidas que lentas; correlacionar o balanço (`U-YAW-03`) com `Speed`. Sub-uso em alta = `LatAccel` abaixo do envelope possível para aquela velocidade.
**Relacionado:** `U-SET-08`, `GT3-03`, `U-INP-03`.

#### `[GT3-03]` Balanço aerodinâmico e rake — under/oversteer dependente de velocidade
**Físico:** A distribuição dianteira/traseira do downforce (asas + **rake**) cria um balanço que **muda com a velocidade**: o carro pode ser neutro em baixa e empurrar (ou soltar) em alta.
**Implicação na pilotagem:** Distinguir um problema **mecânico** (aparece igual em qualquer velocidade) de um **aerodinâmico** (só em curva rápida) muda completamente a correção — e é uma decisão de setup, não de pé. O piloto adapta a entrada conforme o balanço daquela faixa de velocidade.
**Telemetria (ênfase):** Sintoma que **escala com `Speed`** = aero. Compare o under/oversteer index (`U-YAW-03`) em curvas de velocidades diferentes; se diverge com a velocidade, é rake/asa.
**Relacionado:** `U-SET-08`, `GT3-02`, `SIG-01`, `SIG-04`.

#### `[GT3-04]` ABS muda a frenagem
**Físico:** O ABS (nível em `DcABS`, ativação real em `BrakeABSactive`) impede o travamento permitindo frear **mais forte e mais fundo** do que seria possível modulando à mão, mas com o ABS atuando o pneu opera num ponto ligeiramente fora do pico — frear *através* do ABS o tempo todo não é o ideal.
**Implicação na pilotagem:** Pode-se atacar o freio com mais confiança, mas o alvo é frear **logo abaixo** do ponto onde o ABS dispara constantemente; usá-lo como rede, não como muleta. Em trail braking, o ABS dá margem extra para sangrar o freio com o carro virando.
**Telemetria (ênfase):** **`BrakeABSactive`** é o canal-chave: ativações curtas e pontuais no pico de frenagem = bom uso; `BrakeABSactive` ligado por longos trechos = freio forte demais, pneu fora do pico (e distância de frenagem pode até piorar). Cruze com `*brakeLinePress` e `LongAccel`.
**Relacionado:** `U-BRK-05`, `U-BRK-01`, `SIG-07`.

#### `[GT3-05]` TC muda a aplicação de potência
**Físico:** O controle de tração (nível em `DcTractionControl`) corta torque quando detecta patinagem na saída. Protege contra wheelspin, mas TC alto/cortando muito **estrangula** a aceleração e custa tempo.
**Implicação na pilotagem:** O alvo é aplicar acelerador de forma que o TC **mal precise atuar** — usá-lo como segurança nos limites, não como substituto da modulação (`U-ACC-02`). Em piso bom, menos intervenção = mais tração efetiva.
**Telemetria (ênfase):** O iRacing **não** expõe um canal direto de "TC ativo"; **infere-se o corte** pelo descasamento: `Throttle` alto mas `RPM`/aceleração **estagnando** ou oscilando, com `*speed` da roda motriz indicando patinagem (ver Parte 0.6). `DcTractionControl` informa o nível setado. Cortes frequentes = aplicação cedo/agressiva demais.
**Relacionado:** `U-ACC-02`, `U-ACC-03`, `SIG-09`.

#### `[GT3-06]` Gestão de energia — freios, pneus e stint
**Físico:** Massa alta + potência alta geram muito calor em freios e pneus. Fora da janela térmica (`U-TIRE-06`), o grip cai; o envelope G-G **encolhe ao longo do stint** com a degradação.
**Implicação na pilotagem:** Pilotar uma corrida de GT3 é **administrar um recurso que se esgota**: gerir temperatura de pneu (menos deslizamento/scrub), temperatura de freio, e poupar onde o custo em tempo é baixo. O ritmo de classificação não se sustenta a corrida inteira.
**Telemetria (ênfase):** Tendência de `*tempCL/CM/CR` e `*wear` ao longo das voltas; queda progressiva do `LatAccel`/`LongAccel` de pico (envelope encolhendo, `SIG-17`); temperatura de freio onde disponível. Gerência = manter o pneu na janela o máximo possível.
**Relacionado:** `U-TIRE-06`, `SIG-17`, `U-SET-06`.

#### `[GT3-07]` Massa e transientes lentos — a suavidade obrigatória
**Físico:** Muita massa torna a transferência de carga (`U-LOAD-06`) **mais lenta e mais ampla**; o carro demora a "assentar" depois de cada input e penaliza quem o apressa.
**Implicação na pilotagem:** Inputs precisam ser **antecipados e graduais** — soltar o freio progressivamente para a frente assentar, abrir o volante ao invés de arrancá-lo, aplicar acelerador de forma linear. Brusquidão num carro pesado provoca transferências violentas que desequilibram o balanço (`SIG-05/06`).
**Telemetria (ênfase):** `*shockVel`/`*shockDefl` revelam a velocidade da transferência; transições suaves de `Brake`→`Throttle` e arco limpo de `SteeringWheelAngle`. Picos bruscos = carro desestabilizado.
**Relacionado:** `U-LOAD-06`, `U-INP-02`, `SIG-05`.

#### `[GT3-08]` Ênfase de telemetria (resumo da classe)
**Físico:** Resumo dos canais que mais diferenciam o GT3 das classes de momentum.
**Implicação na pilotagem:** O diagnóstico de GT3 olha primeiro para **uso dos auxílios** (frear no limite do ABS, acelerar no limite do TC), **gestão térmica** (janela de pneu/freio) e **aproveitamento do downforce** (grip em alta).
**Telemetria (ênfase):** Prioridade de canais: `BrakeABSactive`, `DcABS`, `DcTractionControl`, `*brakeLinePress`, `*tempCL/CM/CR`, `*wear`, e `LatAccel` por faixa de `Speed`. V-min pura (foco do MX-5) é **menos** central — o GT3 ganha/perde mais na frenagem, na tração e na gestão.
**Relacionado:** `GT3-04`, `GT3-05`, `GT3-06`.

### 4C Fórmulas — FF1600 e F4 (leves, sem aids, open-wheel)

#### `[FRM-01]` Perfil da classe (comum a FF1600 e F4)
**Físico:** Monopostos **leves**, de resposta rápida, **sem ABS e sem TC**, com rodas expostas (open-wheel) e excelente uso de zebra. Centro de gravidade baixo e pouca inércia → transientes **muito rápidos** (oposto do GT3). FF1600 e F4 dividem essa base; a diferença está no **aero e no pneu** (ver `FRM-02/03/04`).
**Implicação na pilotagem:** Recompensam **precisão cirúrgica** e inputs limpos; punem brusquidão imediatamente (sem eletrônica para salvar). Contato roda-a-roda é perigoso (open-wheel) — disciplina de linha importa.
**Telemetria (ênfase):** Precisão de `SteeringWheelAngle` (arco limpo), relação `YawRate`×`SteeringWheelAngle` (rotação, `U-YAW-03`), `RPM`/`Gear` para short-shift (`U-ACC-04`), picos de `VertAccel`/`*shockVel` no uso de zebra (`SIG-18`).
**Relacionado:** `U-INP-01`, `U-YAW-03`, `SIG-18`.

#### `[FRM-02]` FF1600 — momentum car open-wheel, sem aero
**Físico:** **Sem downforce** (asas mínimas/inexistentes), pneu **treaded** de baixa aderência, baixa potência. O grip é modesto e **não cresce com a velocidade**. É, na essência, o irmão open-wheel do MX-5 (`MX5-06`).
**Implicação na pilotagem:** Mesma lei do momentum: **V-min é rei** (`U-LINE-06`), suavidade acima de agressão, role o carro num arco amplo. Com pneu de baixa aderência e sem asa, **precisão > agressão** — escorregar destrói tempo. Trail braking leve e curto (a traseira é leve e solta fácil).
**Telemetria (ênfase):** Igual ao MX-5 — `Speed` no V-min, tempo off-throttle, suavidade. Sem `BrakeABSactive`/TC. O detector de excesso é o **scrub** (raio apertando com `LatAccel` saturado, `SIG-11`).
**Relacionado:** `MX5-02`, `U-LINE-06`, `FRM-04`.

#### `[FRM-03]` F4 — aero moderado e slicks
**Físico:** **Aero moderado** (asas que geram downforce real, ainda que longe do GT3), pneus **slick** de aderência bem superior à do FF1600, mais potência e rev mais alto. O grip **cresce com a velocidade** — em escala menor que o GT3, mas real.
**Implicação na pilotagem:** Permite **entrada mais rápida** e **trail braking mais agressivo** que o FF1600 (mais grip dianteiro para girar sob freio); mais aderência em curva rápida (confiar parcialmente no downforce, como um GT3 "light"); maior uso da faixa de rotação. Ainda assim, sem aids — a modulação de freio/acelerador é manual.
**Telemetria (ênfase):** `LatAccel` de pico **maior que o FF1600** e crescendo com `Speed` (efeito aero, menor que GT3); trail mais longo aceitável (sobreposição `Brake`×`SteeringWheelAngle`); `RPM` mais explorado.
**Relacionado:** `U-SET-08`, `GT3-02`, `FRM-04`.

#### `[FRM-04]` A nuance FF1600 vs F4 — onde o aero do F4 muda tudo
**Físico:** A diferença prática entre os dois monopostos é **downforce + slick**. O FF1600 é um momentum car puro; o F4 introduz grip dependente de velocidade e aderência de pneu muito maior.
**Implicação na pilotagem:** Três mudanças concretas ao migrar FF1600→F4: **(1) frenagem** — o F4 freia mais tarde e mais forte (mais grip de slick) e tolera trail mais profundo; **(2) curva rápida** — o F4 carrega muito mais velocidade onde o aero atua, enquanto o FF1600 trata toda curva como "sem asa"; **(3) linha** — o F4 pode abrir mão de um pouco de V-min em troca de tração/saída (aproxima-se do `U-LINE-04` clássico), ao passo que o FF1600 protege a V-min acima de tudo (`FRM-02`). Levar o estilo "momentum puro" do FF1600 para o F4 **deixa grip de alta velocidade na mesa**; levar o estilo "confia no aero" do F4 para o FF1600 resulta em escorregar e perder a V-min.
**Telemetria (ênfase):** Comparando os dois carros na mesma curva rápida, o **gap de `LatAccel` e de `Speed`** cresce com a velocidade (vantagem F4 = aero); na frenagem, F4 tem ponto mais tardio e maior pico de `LongAccel`. Use `Speed`×`LatAccel` por faixa para flagrar o sub-uso do aero no F4.
**Relacionado:** `FRM-02`, `FRM-03`, `GT3-02`, `U-LINE-04`.

#### `[FRM-05]` Leveza — transientes rápidos sem inércia perdoadora
**Físico:** Pouca massa → transferência de carga **quase instantânea** (`U-LOAD-06`). O carro responde imediatamente, mas também **não perdoa**: não há a inércia lenta do GT3 que dá tempo de corrigir.
**Implicação na pilotagem:** Inputs precisos e bem cronometrados; o carro vira no instante em que se pede, então excesso de volante vira excesso de rotação na hora. A suavidade aqui é de **precisão e timing**, não de "esperar o carro assentar" (ele já assentou).
**Telemetria (ênfase):** Respostas rápidas de `YawRate` a `SteeringWheelAngle` (ganho alto); microcorreções (`SIG-14`) custam mais porque o carro amplifica cada uma. `*shockVel` com transições rápidas é normal — o problema é o input brusco, não a resposta rápida.
**Relacionado:** `U-LOAD-06`, `U-YAW-03`, `SIG-14`.

#### `[FRM-06]` Open-wheel e uso de zebra
**Físico:** Rodas expostas (contato = dano/voo) e suspensão que tipicamente lida bem com zebras; o ganho de alargar o raio pela zebra é real (`U-LINE-02`).
**Implicação na pilotagem:** Usar a zebra que **abre o raio** sem desestabilizar (`SIG-18`), mas com disciplina extra de linha por causa das rodas expostas. Zebra agressiva demais desequilibra um carro leve com violência.
**Telemetria (ênfase):** Picos de `VertAccel`/`*shockVel`/`RollRate` ao tocar zebra; bom uso não dispara instabilidade em `β`/`YawRate` logo depois.
**Relacionado:** `SIG-18`, `U-LINE-02`, `U-LOAD-06`.

#### `[FRM-07]` Ênfase de telemetria (resumo da classe)
**Físico:** Resumo do que mais diferencia as Fórmulas no dado.
**Implicação na pilotagem:** O diagnóstico de Fórmula olha primeiro para **precisão de input** (arco de volante, ausência de serrilhado), **eficiência de rotação** (yaw×steer), **gestão de rotação do motor** (short-shift/rev) e — no F4 — **aproveitamento do aero** em alta. Sem auxílios, travamento e wheelspin são lidos só pelos canais físicos.
**Telemetria (ênfase):** Prioridade: `SteeringWheelAngle` (precisão), `YawRate`/under-oversteer index, `RPM`/`Gear`, `Speed`×`LatAccel` (aero no F4), `VertAccel` (zebra). Sem `BrakeABSactive`/TC como atalhos.
**Relacionado:** `FRM-04`, `U-YAW-03`, `U-ACC-04`.

---

## PARTE 5 — LÓGICA DE DIAGNÓSTICO E GERAÇÃO DE INSIGHTS (o motor analítico)

> **Propósito desta parte:** transformar canais de telemetria em **insights acionáveis e priorizados**. As Partes 1–4 dão o "vocabulário" (o que cada fenômeno é e como aparece no dado); esta parte dá o **algoritmo de raciocínio** que o PitWall deve seguir. Schema variável (procedural), com IDs `DIAG-*`.

#### `[DIAG-01]` Princípio mestre — o tempo é a integral do delta
**Princípio:** O tempo de volta é a soma do tempo gasto em cada metro da pista. Logo, **toda perda de tempo tem um lugar** — um trecho específico onde o `LapDeltaToBestLap` (ou o delta contra uma referência) **cresce**. A regra de ouro do diagnóstico: **primeiro localize *onde* se perde tempo, só depois diagnostique *por quê*.** Diagnosticar antes de localizar produz conselhos genéricos e frequentemente errados.
**Como aplicar:** Alinhe as voltas por `LapDistPct` (Parte 0.6 / `TEL-03`), calcule o **delta-t segmentado** (derivada do delta acumulado por trecho), e ordene os trechos pela perda. Onde o delta acumulado **sobe** = onde está o tempo. Onde ele é plano ou desce = trecho neutro ou de ganho (não desperdice conselho ali).
**Saída esperada:** uma lista de trechos ordenados por tempo perdido, cada um pronto para ser classificado por fase (`U-LINE-01`) e diagnosticado.
**Relacionado:** `TEL-03`, `TEL-05`, `DIAG-02`.

#### `[DIAG-02]` O fluxo de análise (pipeline de ponta a ponta)
**Procedimento (ordem obrigatória):**
1. **Alinhar** — sincronizar volta-alvo e referência por `LapDistPct`; normalizar canais (Parte 0.6).
2. **Segmentar** — dividir a volta em curvas e em **fases** (braking / turn-in / trail / apex-Vmin / pickup / exit, ver `U-LINE-01` e `TEL-05`).
3. **Localizar a perda** — delta-t por segmento; ordenar do maior prejuízo ao menor (`DIAG-01`).
4. **Classificar a fase** do trecho problemático (onde, dentro da curva, o delta cresce).
5. **Medir as assinaturas** daquele trecho — comparar os canais relevantes contra a referência e contra o catálogo da Parte 3B (`SIG-*`).
6. **Formular hipótese** — casar a assinatura com uma causa (`SIG-*`) e decidir **piloto vs setup** (`DIAG-04`).
7. **Prescrever** — correção concreta de piloto e/ou setup, com o "porquê" físico (linkar IDs universais).
8. **Estimar o custo** e priorizar (`DIAG-05`).
9. **Validar** — definir o que deve mudar no dado se a correção funcionar (fechar o loop, `DIAG-06`).
**Princípio:** nunca pular da etapa 1 direto para a 7. A maioria dos conselhos ruins nasce de prescrever sem localizar (3) ou sem decidir piloto-vs-setup (6).
**Relacionado:** `DIAG-01`, `DIAG-03`, `DIAG-06`.

#### `[DIAG-03]` Árvore de decisão por fase de curva
**Princípio:** dada a **fase** onde o tempo se perde, há um conjunto pequeno e previsível de causas. Use esta tabela como roteiro de triagem (cada linha aponta para os `SIG-*`/IDs com o detalhe).

| Fase (onde o delta cresce) | Sintoma observável | Causas prováveis | Para onde ir |
|---|---|---|---|
| **Frenagem (1)** | distância de frenagem longa, pico de `LongAccel` baixo, `Brake` cedo/leve | sub-uso do freio; medo do ponto | `SIG-13`, `U-BRK-01`, `U-BRK-06` |
| **Frenagem (1)** | `*speed` de roda colapsa vs `Speed`; `BrakeABSactive` longo (GT3) | travamento / bias / freio forte demais | `SIG-07`, `SIG-08`, `U-BRK-04` |
| **Turn-in / Trail (2–3)** | `LatAccel` não sobe com mais `SteeringWheelAngle`; `SteeringWheelTorque` cai | understeer de entrada; soltou o freio cedo | `SIG-01`, `U-BAL-02`, `U-LOAD-04` |
| **Turn-in / Trail (2–3)** | `YawRate`/`β` disparam, correção de contra-esterço | oversteer de trail; bias atrás demais | `SIG-04`, `U-BRK-04`, `U-SET-04` |
| **Apex / V-min (4)** | `Speed` de fundo baixo; raio apertando com `LatAccel` saturado | V-min baixa / scrub / early apex | `SIG-10`, `SIG-11`, `U-LINE-03` |
| **Apex / V-min (4)** | `Throttle`=0 e `Brake`=0 por tempo notável | **coasting** (pecado capital) | `SIG-12`, `U-INP-04` |
| **Pickup / Exit (5–6)** | `Throttle` alto mas `RPM`/aceleração estagnam; roda motriz patina | wheelspin / TC cortando (GT3) | `SIG-09`, `U-ACC-02`, `GT3-05` |
| **Pickup / Exit (5–6)** | volante ainda fechado força aliviar acelerador na saída | early apex / understeer de saída | `SIG-03`, `SIG-10`, `U-LINE-03` |
| **Exit + reta (6→reta)** | entrada rápida mas `Speed` no fim da reta baixo | entrada gananciosa comprometendo saída | `SIG-15`, `U-LINE-04`, `DIAG-05` |
| **Qualquer / global** | alta variância dos canais entre voltas | inconsistência / falta de referência | `SIG-16`, `DIAG-04` |
| **Global ao longo do stint** | envelope G-G encolhendo, `*temp`/`*wear` subindo | degradação / pneu fora da janela | `SIG-17`, `GT3-06`, `U-TIRE-06` |

**Relacionado:** `U-LINE-01`, Parte 3B inteira, `DIAG-04`.

#### `[DIAG-04]` Distinguir problema de piloto de problema de setup
**Princípio:** a decisão que muda a prescrição. Aplique os testes de `U-SET-09`, operacionalizados em dados:
- **Consistência:** o sintoma aparece em **todas** as voltas comparáveis → tende a ser **carro/setup**. Aparece em **algumas** (alta variância, `SIG-16`) → tende a ser **piloto**.
- **Simetria:** o sintoma é pior só num lado que deveria ser simétrico (mesma curva, direções opostas no traçado) → **linha/input do piloto**. Simétrico nos dois lados → mais provável **setup**.
- **Resposta a mudança de input:** se ao alterar a técnica (frear mais tarde, soltar o freio mais cedo, abrir o volante) o sintoma some no dado → era **piloto**.
- **Grip disponível não usado:** vetor `G_total` consistentemente **dentro** do círculo de atrito (`U-INP-03`) onde deveria estar na borda → **piloto** (há aderência sobrando que a técnica não acessa).
- **Persistência apesar de boa execução:** input limpo e no limite, e o sintoma continua, consistente e simétrico → **setup**.
**Regra de prioridade:** quando há **grip sobrando + inconsistência**, **assuma piloto primeiro**. Nunca mascarar com setup um problema de técnica (cria novos problemas), nem cobrar do piloto o que é limite do carro. **No escopo atual (só pilotagem),** quando o veredito for **setup**, o coach apenas **registra** isso como território de FASE 2 e mantém o foco no que o piloto controla — **não prescreve ajuste de carro ainda.**
**Relacionado:** `U-SET-09`, `SIG-16`, `U-INP-03`.

#### `[DIAG-05]` Priorização por custo — onde o conselho rende mais
**Princípio:** nem todo tempo perdido vale o mesmo esforço de correção. Priorize pelo **tempo recuperável ponderado pelo impacto a jusante**:
- **Saída de curva que dá em reta longa** tem o **maior** retorno: um erro ali se multiplica por toda a reta (a velocidade de saída vira vantagem em cada metro reto). **Priorize acima de tudo.**
- **Curva lenta isolada** (seguida de outra curva, não de reta) tem retorno **menor** — o erro não se propaga por uma reta. Corrija depois.
- **Trechos de maior delta-t absoluto** primeiro, mas reponderados: 0,2 s perdidos numa saída para a reta principal > 0,2 s perdidos numa curva lenta isolada.
- **Erros sistemáticos** (toda volta) antes de erros isolados — corrigi-los muda o tempo médio, não só o pico.
**Como aplicar:** para cada trecho, estime `tempo_recuperável × peso_a_jusante`, onde o peso cresce com o comprimento da reta seguinte. Ordene os insights por esse produto, não pelo delta-t cru.
**Relacionado:** `U-LINE-04`, `SIG-15`, `DIAG-01`.

#### `[DIAG-06]` Anatomia de um insight acionável
**Princípio:** um insight só é útil se o piloto souber **o quê, onde, por quê, quanto custa, como corrigir e como verificar**. Todo insight gerado deve conter os seis campos:
1. **O quê** — o sintoma em uma frase (ex.: "understeer no apex da curva 3").
2. **Onde** — trecho/curva e **fase** exata (`LapDistPct`/nome da fase).
3. **Por quê** — a causa física, linkando o ID universal (ex.: "soltou o freio antes do turn-in → dianteira sem carga, `U-LOAD-04`").
4. **Custo** — tempo estimado perdido naquele trecho (em segundos), já ponderado (`DIAG-05`).
5. **Como corrigir** — ação concreta de piloto e/ou setup (não "seja mais rápido", mas "atrase o ponto de frenagem ~10 m e sangre o freio até o apex").
6. **Como validar** — o que deve mudar no dado se funcionar (ex.: "`SteeringWheelAngle` de pico menor e `LatAccel` subindo no turn-in; delta-t do trecho ≥0 ").
**Tom:** específico e mensurável. Evite genéricos ("freie melhor"); prefira o número e o canal. Um insight sem campo de **validação** é incompleto — o loop precisa fechar.
**Relacionado:** `DIAG-02`, `DIAG-05`, `DIAG-07`.

#### `[DIAG-07]` Métricas e scores por fase (quantificação)
**Princípio:** para acompanhar evolução e comparar voltas objetivamente, derive **scores por fase** a partir dos canais. Sugestões de métricas (todas calculáveis dos canais da Parte 0.6):
- **Brake aggression** — pico de `Brake`/`LongAccel` na frenagem vs o máximo do carro (quão perto do threshold, `U-BRK-01`). Baixo = freia tímido (`SIG-13`).
- **Brake release rate** — taxa de queda de `Brake` no trail; ideal é suave e contínuo (`U-BRK-02`). Quedas abruptas = soltou de uma vez.
- **Trail overlap** — área de sobreposição `Brake`×`SteeringWheelAngle` (quanto trail braking de fato). Calibrar por classe (alto demais no MX-5/FF1600 = travar).
- **Coasting time** — tempo com `Throttle`≈0 e `Brake`≈0 por curva; **alvo: mínimo** (`U-INP-04`, `SIG-12`).
- **Throttle commitment** — quão cedo (em `LapDistPct` relativo ao apex) e quão decidido o acelerador volta; cedo e progressivo = bom (`U-ACC-01`).
- **Rotation efficiency** — quanta guinada (`YawRate` integrado) por unidade de `SteeringWheelAngle`; baixo = arando (understeer); muito alto/nervoso = instável (`U-YAW-03`).
- **Line consistency** — variância do raio (`Speed/YawRate`) e do `SteeringWheelAngle` entre voltas no mesmo trecho; baixa variância = repetível (`SIG-16`).
- **Circle usage** — fração do tempo em curva com `G_total` perto do raio do círculo de atrito (`U-INP-03`); alto = aproveita o grip; baixo com tempo ruim = grip na mesa (piloto, `DIAG-04`).
**Uso:** estes scores alimentam tanto a priorização (`DIAG-05`) quanto a validação (`DIAG-06`), e permitem ao PitWall mostrar tendência sessão-a-sessão. Calibre os alvos por **classe** (Parte 4) — um trail overlap saudável no GT3 trava um FF1600.
**Relacionado:** `DIAG-05`, `DIAG-06`, `U-INP-03`.

---

## PARTE 6 — GLOSSÁRIO E FONTES CANÔNICAS

### 6.1 Glossário de termos

> Termos de motorsport mantidos no padrão internacional (como aparecem na literatura e no iRacing), com a glosa em português. Canais de telemetria estão no glossário da Parte 0.5.

- **Slip angle (ângulo de deriva):** ângulo entre a direção em que a roda aponta e a direção em que ela de fato se move; gera a força lateral (`U-TIRE-02`).
- **Slip ratio (escorregamento longitudinal):** diferença relativa entre a velocidade da banda do pneu e a velocidade do carro; gera força de frenagem/tração (`U-TIRE-03`).
- **Círculo (elipse) de atrito (friction circle):** representação do limite combinado de força lateral + longitudinal que o pneu suporta (`U-TIRE-04`).
- **Load sensitivity (sensibilidade à carga):** o coeficiente de atrito efetivo cai conforme a carga vertical sobe — grip não é proporcional à carga (`U-TIRE-05`).
- **Self-aligning torque / SAT (torque auto-alinhante):** torque que o pneu gera tendendo a retornar a roda ao centro; base do feedback de volante (`U-TIRE-08`, `SteeringWheelTorque`).
- **Transferência de carga (load transfer):** redistribuição dinâmica de peso entre as rodas sob aceleração, frenagem e curva (`U-LOAD-*`).
- **Understeer (sub-esterço):** dianteira atinge o limite antes da traseira; o carro "não vira" o suficiente (`U-BAL-02`).
- **Oversteer (sobre-esterço):** traseira atinge o limite antes da dianteira; a traseira "sai" (`U-BAL-03`).
- **Lift-off / snap oversteer:** oversteer provocado por tirar o pé do acelerador no meio da curva (`U-BAL-05`).
- **Body slip / β (ângulo de deriva do carro):** ângulo entre a direção do nariz e a direção real do movimento do carro (`atan2(VelocityY, VelocityX)`, Parte 0.6).
- **Yaw / guinada:** rotação do carro em torno do eixo vertical; sua taxa é o `YawRate` (`U-YAW-*`).
- **Racing line (linha de corrida):** trajetória ótima pela pista (`U-LINE-*`).
- **Apex (vértice):** ponto mais interno da curva tocado pela linha; geométrico vs late apex (`U-LINE-03`).
- **Late apex (apex tardio):** apex deslocado para depois do meio geométrico, priorizando a saída (`U-LINE-03`, `U-LINE-04`).
- **V-min (velocidade mínima de curva):** menor velocidade atingida no fundo da curva; métrica-rei nos momentum cars (`U-LINE-06`).
- **Slow-in / fast-out:** entrar mais devagar para sair mais rápido, priorizando a reta seguinte (`U-LINE-04`).
- **Threshold braking:** frear no pico de desaceleração possível, no limite do travamento (`U-BRK-01`).
- **Brake release (liberação de freio):** a forma de soltar o freio; tão importante quanto a aplicação (`U-BRK-02`).
- **Trail braking:** manter parte do freio enquanto se vira, usando a carga dianteira para girar o carro (`U-BRK-03`).
- **Brake bias (distribuição de frenagem):** repartição da força de freio entre eixos dianteiro/traseiro (`U-BRK-04`, `DcBrakeBias`).
- **ABS (sistema antitravamento):** evita o travamento das rodas na frenagem; ativação real em `BrakeABSactive` (`U-BRK-05`, `GT3-04`).
- **TC (controle de tração):** corta torque para conter wheelspin na aceleração (`DcTractionControl`, `GT3-05`).
- **Wheelspin (patinagem de tração):** roda motriz girando além da velocidade do carro na saída (`U-ACC-02`).
- **Short-shifting:** trocar de marcha antes do corte para domar o torque e ganhar tração (`U-ACC-04`).
- **Coasting (rolar morto):** trecho sem freio e sem acelerador; desperdício de tempo (`U-INP-04`, `SIG-12`).
- **Scrub (raspagem):** perda de velocidade por excesso de slip angle/ângulo de volante, "esfregando" o pneu (`SIG-11`).
- **Momentum car (carro de momentum):** carro de baixa potência/aero em que conservar velocidade de curva domina o tempo (MX-5, FF1600).
- **Downforce (carga aerodinâmica):** força vertical aerodinâmica que aumenta o grip e cresce com o quadrado da velocidade (`U-SET-08`, `GT3-02`).
- **Rake (inclinação aerodinâmica):** diferença de altura entre frente e traseira do carro, afeta balanço aero e difusor (`U-SET-08`, `GT3-03`).
- **Transient / steady-state (transiente / permanente):** fase em que o balanço está mudando vs fase em que se estabilizou (`U-BAL-06`, `U-LOAD-06`).
- **G-G diagram (diagrama G-G):** gráfico de `LatAccel`×`LongAccel` que mostra o envelope de aderência usado (`TEL-04`).
- **Stint:** período de pista entre paradas; relevante para degradação de pneu/freio (`GT3-06`).

### 6.2 Fontes canônicas

> Referências que embasam a física e a metodologia desta base. Use-as para aprofundamento e para resolver dúvidas que esta base não cobrir.

**Dinâmica veicular (física fundamental)**
- **Milliken, W. F. & Milliken, D. L. — *Race Car Vehicle Dynamics* (SAE International).** A referência definitiva de dinâmica de veículos de corrida: pneus, transferência de carga, balanço, estabilidade. Base teórica das Partes 1.1–1.3 e 1.7.
- **Pacejka, H. B. — *Tire and Vehicle Dynamics*.** Modelagem de pneus (incl. a "Magic Formula"); fundamenta slip angle, slip ratio e curvas de força do pneu (`U-TIRE-*`).
- **Haney, Paul — *The Racing & High-Performance Tire*.** Tratado acessível sobre comportamento do pneu, temperatura, pressão e construção; base de `U-TIRE-05/06/07`.

**Engenharia de setup e prática**
- **Smith, Carroll — *Tune to Win*, *Drive to Win*, *Engineer to Win*, *Prepare to Win*.** Clássicos sobre ajuste, técnica e engenharia de corrida na prática; base da camada de setup (arquivo companheiro, FASE 2) e do princípio técnica-vs-setup (`U-SET-09`).
- **Skip Barber Racing School / Bentley, Ross — *Going Faster!* e *Speed Secrets*.** Técnica de pilotagem aplicada: linha, frenagem, trail, visão; base das Partes 1.4–1.8.

**Física aplicada e telemetria**
- **Beckman, Brian — *The Physics of Racing* (série de ensaios).** Derivações acessíveis de transferência de carga, círculo de atrito e dinâmica em curva; apoia as Partes 1.2 e 1.7.
- **iRacing SDK / pyirsdk / irsdk.** Documentação dos canais de telemetria do iRacing e ferramentas de leitura (`irsdk.exe --parse` para dump por carro). Base da Parte 0.5, da Parte 3 e de todas as assinaturas (`SIG-*`). **Sempre validar empiricamente os sinais dos canais (`LatAccel`, `SteeringWheelAngle`, `VelocityY`, `YawRate`) numa curva conhecida, pois variam por carro/build.**

---

*Fim da base de conhecimento. Versão 1.0 — Junho/2026. Estrutura projetada para recuperação por IA (RAG): cada entrada é autossuficiente e referenciável por ID. As camadas por classe (Parte 4) registram apenas deltas sobre os fundamentos universais (Partes 1–3); o motor de diagnóstico (Parte 5) define o algoritmo de raciocínio que converte telemetria em insights priorizados. Companheiro: `pitwall_setup_fase2_v1.md` — camada de setup (FASE 2), fora do escopo de coaching atual.*
