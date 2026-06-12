# COMECE A FASE 2 — PitWall

Este arquivo é a "ponte" para iniciar a Fase 2 numa sessão nova do Claude (que não
lembra das conversas anteriores). O contexto completo está no **`PLANO.md`** (mesma
pasta), que é auto-suficiente.

> A Fase 1 está **concluída**: dashboard local lendo seus `.ibt`, no padrão Garage61
> (mapa + gráficos sincronizados, BEST vs AVG, setores oficiais), com histórico sendo
> salvo em `data/`. As fundações da Fase 2 já estão no código (`lapdata.py`, `store.py`).

---

## 📋 Mensagem para colar na nova sessão

```
Estou no meu PC Windows, no projeto PitWall (pasta Claude\PItWall), e NÃO programo —
preciso que você me guie passo a passo, em português, com comandos prontos para colar.

1) Leia primeiro o PLANO.md desta pasta — em especial as seções §3 e §4 (restrições e
   autenticação do Garage61), §6 (lógica de escolha da volta de referência), §10
   (pontos a verificar) e §12 (fundações já travadas). A Fase 1 está concluída.

2) Entenda o que já existe em src/: ibt_reader.py, analysis.py, telemetry_view.py,
   app.py, e principalmente as fundações da Fase 2:
   - lapdata.py  -> estrutura canônica "Lap" (fonte-agnóstica) + synth_average (média
     de qualquer lista de voltas) + lap_colors (sobrepor N voltas). É AQUI que as voltas
     do Garage61 / iRacing devem virar objetos Lap, sem reescrever o visualizador.
   - store.py    -> histórico SQLite + Parquet (já guarda carro, pista, condições, setup).

3) Vamos começar a FASE 2 — referência de outros pilotos (Garage61) + resultados e
   progresso (API /data do iRacing). Me guie do zero, começando pela AUTENTICAÇÃO, que
   é a parte que depende de mim em sites:
   - Garage61: o caminho LEGÍTIMO (meu próprio token pessoal / minha própria equipe para
     registrar o app — NÃO usar o token do app Bloops). Me diga exatamente onde clicar.
   - API /data do iRacing: como gerar/usar minhas credenciais com segurança (sem expor
     senha no código).
   - VERIFICAR na prática: se o meu token pessoal enxerga as voltas da equipe Bloops, se
     a telemetria vem (precisa Pro?), e se há tempo por setor de outros pilotos.

4) Lembretes de arquitetura que já decidimos (não recriar diferente):
   - Comparar SÓ mesmo carro + mesma pista; alinhar por LapDistPct.
   - Cores: eu/BEST = vermelho, referência = azul; preparar para sobrepor N voltas.
   - Próximas análises previstas: curva nomeada (entrada/ápice/saída) e telas de evolução/PB.

5) Antes de implementar qualquer coisa, me explique o plano da Fase 2 e a ordem dos
   passos, e me diga o que você precisa de mim (contas, tokens, cliques) primeiro.
```

---

## 🎯 O que esperar na Fase 2

| Passo | O que o Claude faz | O que você faz |
|---|---|---|
| 1. Contexto | Lê o `PLANO.md` e confirma o plano da Fase 2 | Confere se bate |
| 2. Auth Garage61 | Explica o caminho do token pessoal / criar sua equipe | Gera o token nos sites |
| 3. Auth iRacing | Guia as credenciais da API `/data` com segurança | Cola/configura credenciais |
| 4. Verificações | Testa se vê voltas da Bloops, se telemetria vem (Pro), setores | Confirma o que aparece |
| 5. Integração | Liga as fontes via `lapdata.Lap` e mostra a referência no dashboard | Dá feedback |

**Resultado:** comparar suas voltas com uma **referência real** (volta de colega de
equipe na pace certa) e acompanhar **resultados/progresso** (iRating, tempos, incidentes).

---

## ⚠️ Lembretes

- **Não usar o token do app Bloops** (credencial de terceiro — fere ToS, risco de ban).
  Usar **seu próprio acesso** (token pessoal / sua própria equipe no Garage61).
- **Nunca commitar tokens/senhas** no código. O Claude vai te mostrar como guardar isso
  com segurança (variável de ambiente / arquivo ignorado pelo git).
- **Nunca apagar os `.ibt`** — é o acervo-fonte.
- Telemetria de referência **exige plano Pro** do Garage61 (sem Pro: só tempos).
