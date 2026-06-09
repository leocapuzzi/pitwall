# O que dá pra analisar na telemetria — Catálogo (base do coaching)

> Os `.ibt` do iRacing gravam **278 canais a ~60 Hz**. Este documento mapeia **tudo
> que dá pra extrair** desses dados para gerar insight de pilotagem, muito além dos
> traços que já plotamos. É a base para desenhar o motor de análise e o coach.
>
> **Confiança:** 🟢 direto e confiável · 🟡 dá, com calibração/cuidado · 🔴 aproximado/difícil.
> Tudo é alinhado por **distância** (`LapDistPct`) e comparado **mesmo carro + mesma pista**.

---

## Canais-chave confirmados (com dado real no MX-5)

| Família | Canais | Para quê |
|---|---|---|
| Posição/linha | `Lat`, `Lon`, `Alt`, `LapDist`, `LapDistPct` | traçado, linha, mapa |
| Atitude do carro | `Yaw`, `YawRate`, `Pitch`, `PitchRate`, `Roll`, `RollRate` | rotação, mergulho, rolagem |
| Velocidades | `Speed` (GPS), `VelocityX/Y/Z` (referencial do carro) | ângulo de deriva (slip) |
| Pedais/volante | `Throttle(Raw)`, `Brake(Raw)`, `Clutch`, `SteeringWheelAngle`, **`SteeringWheelTorque`** | inputs, trail-brake, sentir grip dianteiro |
| Roda a roda | **`LFspeed/RFspeed/LRspeed/RRspeed`**, `LF/LR/RF/RRbrakeLinePress` | travamento, patinação, bias de freio |
| ABS | **`BrakeABSactive`**, `BrakeABScutPct` | freou além do limite |
| Suspensão | `*shockDefl`, `*shockVel`, `*rideHeight` (4 rodas) | transferência de peso, zebra, bottoming |
| G-forces | `LatAccel`, `LongAccel`, `VertAccel` | círculo de tração, peso, impactos |
| Pneus | `*tempL/M/R`, `*tempCL/CM/CR`, `*pressure`, `*wearL/M/R`, `*odometer` (4 rodas) | grip térmico, câmber/pressão, degradação |
| Zebra/superfície | **`TireLF_RumblePitch`** (4 rodas), `PlayerTrackSurface`, `PlayerTrackSurfaceMaterial` | comeu zebra, saiu da pista |
| Tempo/erros | `LapDeltaToBestLap`, `LapBestLapTime`, `PlayerCarMyIncidentCount`, `PlayerIncidents` | delta ao vivo, incidentes |

---

## 1. Linha e traçado

| Insight | Como | Confiança |
|---|---|---|
| **Ponto de entrada (turn-in)** mais cedo/tarde | onde `SteeringWheelAngle` sai de ~0; comparar com referência | 🟢 |
| **Early vs late apex** | posição do **mínimo de velocidade** e do **pico de esterçamento** vs ápice da curva (modelo da pista). Early apex → mínimo cedo e carro corre largo na saída | 🟢 |
| **Linha mais aberta/fechada** | distância **perpendicular** entre o seu traçado (`Lat/Lon`) e o da referência, ponto a ponto → "0,4 m mais largo na saída da 6" | 🟢 |
| **Quanto esterçou / correções de volante** | pico de `SteeringWheelAngle`; **reversões** (contra-esterço) = correção de traseira | 🟢 |
| **Comeu zebra** | `TireXX_RumblePitch` > 0 (vibração da zebra) + pico de `VertAccel`/`shockVel` | 🟡 |
| **Saiu da pista / track limits** | `PlayerTrackSurface` (0 = fora) e `PlayerTrackSurfaceMaterial` (grama/brita) | 🟢 |

## 2. Grip e tração

| Insight | Como | Confiança |
|---|---|---|
| **Travamento de roda (lockup)** | `XXspeed` << `Speed` sob freio (slip ratio negativo), **por roda** → qual roda travou | 🟢 |
| **Patinação (wheelspin)** | roda **traseira** (`LRspeed/RRspeed`, MX-5 é RWD) > `Speed` sob acelerador | 🟢 |
| **ABS atuando** | `BrakeABSactive`/`BrakeABScutPct` → freou além do limite, perdeu frenagem | 🟢 |
| **Uso do grip (círculo de tração)** | `sqrt(LatAccel² + LongAccel²)` vs máximo do carro → "deixou grip na mesa" entre freio e curva | 🟢 |
| **Stress/superaquecimento de pneu** | `XXtempL/M/R`: faixa de trabalho, **interno vs externo** (câmber), dianteira vs traseira | 🟢 |
| **Pressão subindo demais (quente)** | `XXpressure` muito acima do alvo → menor área de contato | 🟡 |
| **Perda de grip por superfície** | `PlayerTrackSurfaceMaterial` (pisou na grama/brita/zebra molhada) | 🟡 |

## 3. Rotação e balanço (sub/sobre-esterço)

| Insight | Como | Confiança |
|---|---|---|
| **Ângulo de deriva do carro (attitude/slip)** | `β = atan2(VelocityY, VelocityX)` → quanto o carro está "de lado" | 🟢 |
| **Sub vs sobre-esterço** | `YawRate` real vs esperado (`Speed·esterço/entre-eixos`): abaixo = **understeer**, acima = **oversteer**. Reforço: queda de `|SteeringWheelTorque|` = dianteira largando; contra-esterço = traseira saindo | 🟡 |
| **Rotação na entrada** | `YawRate` na fase de entrada cruzado com **freio** (trail-brake rotaciona) e **acelerador** | 🟢 |
| **Atitude do chassi** | `Pitch` (mergulho na freada), `Roll` (rolagem na curva), `RollRate` (rapidez da transição) | 🟢 |

## 4. Frenagem (detalhe)

| Insight | Como | Confiança |
|---|---|---|
| Ponto de freada e **pressão** | `Brake` + `XXbrakeLinePress` (bar) por roda | 🟢 |
| **Trail-braking** | `Brake` ainda aplicado **depois** do turn-in (sobreposição freio × esterço) | 🟢 |
| **Bias dianteira/traseira** | razão `LFbrakeLinePress` / `RRbrakeLinePress` | 🟢 |
| **Modulação / liberação** | suavidade da saída do freio (derivada); soltar de uma vez vs progressivo | 🟢 |

## 5. Acelerador (detalhe)

| Insight | Como | Confiança |
|---|---|---|
| **Ponto de reacelerar** | onde `Throttle` volta a subir após o ápice | 🟢 |
| **Agressividade** | `dThrottle/dt` (abrir de socão vs progressivo → patinação) | 🟢 |
| **Lift/coast desnecessário** | trechos sem freio **e** sem acelerador (tempo morto) | 🟢 |
| **Acelerador parcial mantido** | hesitação na saída (não confiou no carro) | 🟢 |

## 6. Transferência de peso e chassi

| Insight | Como | Confiança |
|---|---|---|
| Transferência long./lateral | `LongAccel`, `LatAccel` (filtrar picos de impacto) | 🟢 |
| Carga por roda / diagonal | `*shockDefl` e `*rideHeight` das 4 rodas | 🟢 |
| **Bottoming (raspar o assoalho)** | `rideHeight` mínimo / fim de curso do amortecedor | 🟡 |
| Brusquidão nas transições | `shockVel`, `RollRate`, `PitchRate` (mexeu rápido demais = desestabiliza) | 🟢 |

## 7. Pneus e térmico (stint)

| Insight | Como | Confiança |
|---|---|---|
| Faixa de trabalho do pneu | `XXtemp` vs janela ideal do composto | 🟡 |
| Câmber/pressão (sinal) | diferença interno-meio-externo (`tempL/M/R`) | 🟢 |
| **Degradação ao longo do stint** | queda de pace + `wear`/`pressure`/`temp` subindo volta a volta | 🟢 |

## 8. Consistência, erros e ritmo

| Insight | Como | Confiança |
|---|---|---|
| Variação volta a volta | desvio dos canais entre voltas limpas (já temos a "média") | 🟢 |
| **Erros pontuais** | travadas, contra-esterços, idas à grama, lifts não intencionais | 🟢 |
| Incidentes | `PlayerCarMyIncidentCount` (quando e onde "pegou x") | 🟢 |
| Delta ao vivo do iRacing | `LapDeltaToBestLap` (referência interna do próprio sim) | 🟢 |

---

## 9. O pulo do gato — a "assinatura" de cada curva

O insight forte **não** vem de um canal isolado, e sim de **cruzar vários na mesma
curva**. Exemplos de diagnóstico que o motor pode montar por curva:

- *"Travou a dianteira (LFspeed↓ + ABS) no trail-brake → entrou de understeer →
  atrasou o ápice → perdeu 0,15s na saída."*
- *"Carregou velocidade demais na entrada (β alto, Roll rápido) → escorregou a traseira
  (contra-esterço) → teve que esperar pra acelerar."*
- *"Abriu o acelerador de socão (dThrottle alto) → patinou a traseira (RRspeed>Speed) →
  saída lenta."*
- *"Linha 0,5 m mais aberta na entrada da 6 + freou 8 m antes → ápice cedo → correu largo."*

Cada curva vira um conjunto de **fatos medidos** (freada, velocidade mínima, slip, yaw,
travamento, zebra, acelerador) → daí saem as **regras** que escrevem a frase de coaching
hoje, e depois alimentam o **coach de IA (Fase 3)** com contexto rico.

---

## 10. Cuidados de cálculo (pra não gerar insight falso)

- **Filtrar picos de impacto** em `LatAccel/LongAccel/VertAccel` (zebra/buraco geram 4 G
  irreais) antes de usar como "força de curva".
- **Slip ratio**: comparar `XXspeed` com `Speed` exige cuidado com ruído a baixa velocidade.
- **Sub/sobre-esterço quantitativo** depende do entre-eixos do carro (pegar do setup/specs)
  e de filtragem — começar pelo qualitativo (β, contra-esterço, queda de torque) é mais seguro.
- **Zebra**: `RumblePitch` é o sinal mais limpo; `VertAccel` sozinho confunde zebra com buraco.
- Sempre **mesmo carro + mesma pista**, voltas **limpas**, alinhado por distância.
```
