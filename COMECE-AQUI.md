# COMECE AQUI — Retomar o PitWall no PC Windows

Este arquivo sincroniza pelo iCloud. Abra-o no PC para retomar de onde paramos.
O contexto completo está no **`PLANO.md`** (mesma pasta) — ele é auto-suficiente.

> A sessão do Claude no PC é "nova" (não lembra das conversas do Mac). O `PLANO.md`
> é a ponte. Se o Claude sugerir algo que contradiz o plano, diga:
> *"confere no PLANO.md, já decidimos isso"*.

---

## ✅ Pré-checklist (antes de abrir o Claude no PC)

1. **iCloud sincronizado:** a pasta `Claude/PItWall` aparece no PC e o `PLANO.md` está
   baixado (não só "na nuvem").
2. **Ter um `.ibt` real:** no iRacing, ativar gravação de telemetria (tecla **Alt+L**
   dentro do sim) e rodar algumas voltas. Arquivos em `Documentos\iRacing\telemetry`.

---

## 📋 Mensagem para colar na sessão do PC

```
Estou no meu PC Windows, onde rodo o iRacing. Vou construir o PitWall e
NÃO programo — preciso que você me guie passo a passo.

1) Primeiro, leia o arquivo PLANO.md nesta pasta. Ele tem todo o escopo e
   as decisões que já fechamos. Siga esse plano.

2) Vamos começar a FASE 1. Me guie do zero:
   - Me ajude a localizar/confirmar um arquivo .ibt real de uma sessão minha
     (em Documentos\iRacing\telemetry).
   - Monte comigo o ambiente Python, me dando os comandos exatos pra colar.
   - Construa um primeiro dashboard que leia esse .ibt de verdade e mostre:
     os canais (velocidade, freio, acelerador, volante), um seletor de voltas,
     e o delta "best vs average" por setor (usando os setores oficiais do
     SplitTimeInfo).

3) Vá me explicando o que cada passo faz, sem pressupor conhecimento técnico.

Comece lendo o PLANO.md e me dizendo o plano da Fase 1 antes de executar.
```

---

## 🎯 O que esperar na Fase 1

| Passo | O que o Claude faz | O que você faz |
|---|---|---|
| 1. Contexto | Lê o `PLANO.md` e confirma o plano da Fase 1 | Confere se bate |
| 2. Telemetria | Ajuda a achar/validar um `.ibt` real | Aponta a pasta / roda sessão de teste |
| 3. Ambiente | Dá os comandos pra instalar Python + bibliotecas | Cola e reporta o resultado |
| 4. Ler o dado | Script que abre o `.ibt` e lista voltas/canais | Confirma que os dados aparecem |
| 5. Dashboard | 1ª tela (canais + seletor + delta por setor) | Abre no navegador e dá feedback |

**Resultado:** dashboard local lendo uma volta sua de verdade, com gráficos dos canais
e o **delta best vs average por setor** — o primeiro insight real e a fundação do resto.

---

## ⚠️ Lembretes

- **Código fica local** no PC (fora do iCloud, pra evitar conflitos). **Documentos**
  (PLANO.md, este arquivo) ficam no iCloud. GitHub como ponte depois, se quiser.
- Pequenos perrengues (instalar Python, achar o `.ibt`) são normais — só reportar a
  tela que o Claude resolve.
