# PitWall — Camada de Setup (FASE 2)

> **Companheiro da base de pilotagem (`pitwall_pilotagem_v1.md`).**
> **Versão:** 1.0 — Junho/2026 · **Idioma:** PT-BR (nomes de canais em inglês).
> **⚠️ FASE 2 — fora do escopo de coaching atual.** Esta camada só entra **depois** que a pilotagem estiver sólida. O coach **não prescreve** estes ajustes ainda; no máximo **sinaliza** (via `DIAG-04`, na base de pilotagem) que um sintoma é território de setup. Nunca mascarar com setup um problema de técnica.
> **IDs:** este arquivo **define** os `U-SET-*`. Referências a `U-*` (fundamentos), `SIG-*` (assinaturas), `DIAG-*`, `TEL-*` e às fases de curva apontam para a **base de pilotagem**. Cada ajuste é descrito pelo seu efeito no **balanço por fase** (`U-BAL-04`, na base de pilotagem).

---

## 1. SETUP ↔ COMPORTAMENTO

Esta parte existe para o diagnóstico: o app precisa saber **quando** um sintoma é técnica do piloto e **quando** é o carro, e que **direção** de ajuste atacaria a causa. Cada ajuste é descrito pelo seu efeito no balanço por fase (`U-BAL-04`).

#### `[U-SET-01]` Molas (wheel rate)
**Conceito:** Rigidez de mola controla quanto o canto afunda sob carga e influencia a **distribuição de transferência de carga lateral** entre eixos. Enrijecer um eixo faz ele transferir relativamente mais carga para fora na curva → perde grip relativo nesse eixo (`U-TIRE-05`). Molas duras = resposta rápida e menos rolagem, mas menos mecânica de absorver irregularidades e mais sensível a brusquidão.
**Efeito no balanço:** Enrijecer a dianteira → mais understeer (sobretudo no meio). Enrijecer a traseira → mais oversteer.
**Telemetria:** `*shockDefl` (curso usado), `*rideHeight`, `RollRate`. Afundamento excessivo ou batimento de fundo aparecem aqui.
**Relacionado:** `U-LOAD-03`, `U-SET-02`.

#### `[U-SET-02]` Barras estabilizadoras (ARB)
**Conceito:** A ferramenta primária de **balanço em regime permanente**. Uma barra mais dura num eixo aumenta a transferência de carga lateral daquele eixo (resiste à rolagem ali), reduzindo seu grip relativo (`U-TIRE-05`). É o "dial" clássico de under/oversteer no meio da curva sem mexer na resposta vertical isolada.
**Efeito no balanço:** ARB dianteira mais dura → mais understeer (meio). ARB traseira mais dura → mais oversteer (meio).
**Telemetria:** Efeito aparece como mudança no balanço em fase 4 (apex): relação `SteeringWheelAngle`×`LatAccel` e `YawRate` esperado×real (`U-YAW-03`) na curva mantida.
**Relacionado:** `U-LOAD-03`, `U-BAL-04`, `U-SET-01`.

#### `[U-SET-03]` Dampers (bump e rebound)
**Conceito:** Amortecedores controlam a **velocidade** da transferência de carga (`U-LOAD-06`), logo governam o balanço **transiente** (turn-in, inversões, pickup) sem alterar o regime permanente. Bump (compressão) e rebound (extensão), em low/high speed do amortecedor, ajustam como o carro "aceita" inputs e zebras.
**Efeito no balanço:** Mais rebound num eixo segura a carga por mais tempo ali → afeta a resposta inicial. Regra prática: ajustar dampers para suavizar transients nervosos ou acelerar respostas preguiçosas.
**Telemetria:** `*shockVel` é a leitura direta — picos altos = transients bruscos; `RollRate`/`PitchRate` durante turn-in/pickup isolam a janela transiente (`U-BAL-06`).
**Relacionado:** `U-LOAD-06`, `U-BAL-06`, `U-INP-02`.

#### `[U-SET-04]` Diferencial (preload, ramp coast/power)
**Conceito:** O diff controla quanto as rodas motrizes podem girar em velocidades diferentes — define a rotação **on-throttle** e **off-throttle**. **Power ramp** (rampa de aceleração) mais travada = mais estável/understeer na saída sob acelerador, menos rotação; mais aberta = mais rotação/oversteer de potência. **Coast** (desaceleração) mais travado = mais estável ao tirar o pé/frear; mais aberto = mais rotação na entrada. **Preload** afeta a transição on/off.
**Efeito no balanço:** Ferramenta-chave da fase de saída e da entrada off-throttle. Muito do "understeer de tração" (`SIG-03`) e do "não gira na entrada" pode ser diff, não molas/barras.
**Telemetria:** Correlação `Throttle`×`YawRate` na saída e comportamento off-throttle na entrada; diferença de `LRspeed`×`RRspeed` (rodas motrizes traseiras) sob tração indica quanto o diff está travando.
**Relacionado:** `U-ACC-03`, `U-YAW-02`, `SIG-03`, `SIG-05`.

#### `[U-SET-05]` Camber e toe
**Conceito:** **Camber** (inclinação da roda) negativo mantém o pneu plano no solo durante a rolagem, maximizando grip lateral no pico de carga — mas em excesso sobreaquece a borda interna e prejudica frenagem/tração em reta. **Toe** (convergência) ajusta estabilidade vs agilidade e resposta de turn-in, ao custo de arrasto/temperatura.
**Efeito no balanço/telemetria:** Camber correto = `*tempCL/CM/CR` uniformes no pneu externo carregado (`U-TIRE-06`); interno muito mais quente = camber demais. Toe afeta a vivacidade do turn-in (resposta de `YawRate` ao volante).
**Relacionado:** `U-TIRE-06`, `U-SET-06`.

#### `[U-SET-06]` Pressões como ferramenta de balanço e janela térmica
**Conceito:** Além do contact patch (`U-TIRE-07`), pressão é um dial **rápido** de balanço e de janela térmica. Subir pressão num eixo geralmente reduz seu grip mecânico (até certo ponto) e muda a resposta. É o primeiro lugar a checar antes de diagnosticar balanço, porque pressão fora da janela distorce tudo.
**Efeito no balanço/telemetria:** `LFpressure` ao vivo vs alvo; perfil `CL/CM/CR` (`U-TIRE-06`) diz se está alta (centro quente) ou baixa (bordas quentes). Ajuste a frio (`LFcoldPressure`) para atingir o alvo a quente.
**Relacionado:** `U-TIRE-06`, `U-TIRE-07`.

#### `[U-SET-07]` Brake bias (como ajuste)
**Conceito:** Já detalhado na física em `U-BRK-04`. Como ferramenta de setup/cockpit: mover bias para frente = mais estável na frenagem reta, mas trava dianteira antes e pune trail braking; para trás = mais rotação na entrada e melhor trail, mas risco de travar traseira. Muitos carros permitem ajuste em tempo real (`DcBrakeBias`).
**Telemetria:** `DcBrakeBias`, `*brakeLinePress`, e qual roda trava primeiro (`*speed` vs `Speed`).
**Relacionado:** `U-BRK-04`, `SIG-07`, `SIG-08`.

#### `[U-SET-08]` Aero — asas, ride height, rake (onde aplicável)
**Conceito:** Downforce gera grip que **cresce com o quadrado da velocidade** — muda o limite em curvas rápidas muito mais que em lentas. **Balanço aerodinâmico** (distribuição dianteira/traseira do downforce, afetada por asas e por **rake**/diferença de altura frente-traseira) define under/oversteer **dependente de velocidade**: um carro pode ser neutro em baixa e understeer em alta (ou vice-versa) por aero. Ride height/rake também afetam o difusor.
**Efeito no balanço/telemetria:** Sintomas que **mudam com a velocidade da curva** (estável em lenta, nervoso/empurrando em rápida) apontam para aero, não mecânica. Correlacione o balanço (`U-YAW-03`) com `Speed` na curva.
**Relacionado:** `GT3-02`, `FRM-03`, `U-LOAD-03`.

#### `[U-SET-09]` Princípio: técnica vs setup
**Conceito:** A pergunta diagnóstica mestra. Heurísticas para atribuir um sintoma ao **piloto** (não ao carro): (a) **inconsistência** — o sintoma aparece em umas voltas e não em outras → input do piloto; (b) **assimetria suspeita** — pior só num lado que deveria ser simétrico → linha/input; (c) **responde a mudança de input** — se pedir ao piloto para mudar a técnica e o sintoma some, era técnica; (d) o dado mostra grip **disponível não usado** (vetor dentro do círculo, `U-INP-03`) → técnica. Atribua ao **carro** quando o sintoma é **consistente**, **simétrico** e persiste apesar de boa execução.
**Na pilotagem:** Nunca "conserte no setup" um problema de técnica (mascara e cria outros), nem exija do piloto o que é limitação do carro. O app deve sempre tentar a hipótese de técnica primeiro quando há grip sobrando e inconsistência.
**Telemetria:** Variância volta-a-volta dos canais (`SIG-16`); simetria de temperaturas/`*speed`/`*shockDefl` entre lados; uso do círculo de atrito (`U-INP-03`).
**Relacionado:** `DIAG-04`, `SIG-16`, `U-INP-03`.

---

## 2. Direção de setup por sintoma

> Mapa rápido: para cada assinatura (`SIG-*`, definida na base de pilotagem), a **direção** de ajuste que ataca a causa. Só aplicar na **FASE 2**, e somente depois de descartar técnica (`DIAG-04`). "N/A" = sintoma é de linha/técnica, sem ajuste de setup que resolva sem efeito colateral.

- **`SIG-01` — Understeer de entrada (turn-in):** Menos ARB/mola dianteira, mais ARB/mola traseira; bias um pouco atrás (ajuda trail); checar pressão/camber dianteiros; coast do diff mais aberto p/ rotação na entrada.
- **`SIG-02` — Understeer de meio de curva (apex):** Amaciar dianteira / endurecer traseira (ARB/mola); ajustar pressão dianteira; mais camber dianteiro se as temps pedirem; se for curva rápida, balanço aero para a frente.
- **`SIG-03` — Understeer de saída (power understeer / push):** Diff power ramp mais aberto (mais rotação na saída) — cuidado p/ não virar oversteer; ajustar balanço mecânico; em alguns casos mais asa traseira não ajuda (é tração, não aero).
- **`SIG-04` — Oversteer de entrada (trail-braking oversteer):** Bias para frente; coast do diff mais travado (estabiliza off-throttle); endurecer traseira relativa só se persistente; mais engine braking management se disponível.
- **`SIG-05` — Oversteer de potência (saída):** Diff power mais travado; subir TC (se permitido) como muleta temporária; mais asa/pressão traseira para grip; ajustar balanço mecânico para a traseira.
- **`SIG-06` — Lift-off / snap oversteer:** Coast do diff mais travado; engine braking reduzido (se ajustável); ajustar balanço traseiro.
- **`SIG-07` — Travamento de roda dianteira:** Bias para trás; (em carro com ABS, subir/ajustar `DcABS`).
- **`SIG-08` — Travamento de roda traseira / instabilidade na frenagem:** Bias à frente (prioridade); coast do diff mais travado; engine braking management.
- **`SIG-09` — Wheelspin na saída:** Subir TC (muleta); diff power mais travado; mais grip traseiro (asa/pressão).
- **`SIG-10` — Early apex (apex cedo):** N/A (é linha/técnica). Confirmar via `DIAG-04`.
- **`SIG-11` — V-min baixa demais / scrub (excesso de frenagem ou volante):** Se o carro tem understeer de meio (`SIG-02`) forçando o piloto a desacelerar, atacar aquilo.
- **`SIG-12` — Coasting / gap freio→acelerador:** N/A (técnica). Validar custo em tempo (`DIAG-05`).
- **`SIG-13` — Frear cedo e leve (sub-uso do pico de frenagem):** N/A. Confirmar grip disponível no G-G.
- **`SIG-14` — Over-condução / steering serrilhado:** Se a instabilidade força as correções, atacar a causa (diff/dampers/balanço).
- **`SIG-15` — Entrada gananciosa comprometendo a saída:** N/A (estratégia de linha). Ponderar custo pelo comprimento da reta (`DIAG-05`).
- **`SIG-16` — Inconsistência (variância volta-a-volta):** Se a variância vem de o carro estar nervoso, ampliar a "janela" do setup (mais estável) ajuda a consistência mesmo que custe pico.
- **`SIG-17` — Pneu fora da janela / degradação:** Ajustar pressão/camber pelo perfil de temperatura (`U-TIRE-06`/`U-SET-05/06`).
- **`SIG-18` — Uso de zebra/kerb (bom vs ruim):** Dampers/molas que absorvam a zebra; ride height para não bater fundo.

---

## 3. Fontes (setup)

- **Smith, Carroll — *Tune to Win*, *Engineer to Win*, *Prepare to Win*.** Referência prática de ajuste e engenharia de corrida; base desta camada e do princípio técnica-vs-setup (`U-SET-09`).
- **Milliken, W. F. & Milliken, D. L. — *Race Car Vehicle Dynamics* (SAE).** Teoria de transferência de carga, balanço e estabilidade que fundamenta o efeito de cada ajuste.
- **iRacing SDK / pyirsdk.** Canais que evidenciam o efeito do setup no dado (`*shockDefl`, `*rideHeight`, `*tempCL/CM/CR`, `*pressure`). Validar sempre por carro/build.

---

*Camada de setup — FASE 2. Use em conjunto com a base de pilotagem (`pitwall_pilotagem_v1.md`). Não habilitar no coaching enquanto o escopo for "só pilotagem".*
