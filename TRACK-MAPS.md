# TRACK-MAPS — contornos oficiais do iRacing no PitWall

**Sessão:** 2026-07-11 (Mac) · **Decisões do Leo:** fonte `racing-track-maps-vector`,
catálogo completo, contorno oficial usado **no player** (carro por telemetria + linha
de traçado sobre o desenho oficial).

Este documento consolida tudo do pipeline de track maps oficiais: de onde vêm os
desenhos, como são georreferenciados sobre a telemetria e como entram no app.
Referência de pesquisa das fontes: `fontes_track_layouts_iracing.md`.

---

## 1. Visão geral

O PitWall tinha duas geometrias por pista:

| Geometria | Origem | Papel |
|---|---|---|
| Volta de referência congelada | 1º `.ibt` da pista (`nova_pista.py`) | posicionamento do carro, curvas, análise |
| Asfalto OSM (`center/left/right`) | OpenStreetMap (`build_track_from_osm.py`) | desenho da faixa no player (largura = chute `width_m`) |

Agora existe uma terceira, com prioridade visual:

| Geometria | Origem | Papel |
|---|---|---|
| **Contorno OFICIAL** (bloco `official` no `.track.json`) | SVG do portal do iRacing, georreferenciado por fit | **desenho da faixa no player** (pit lane e largada inclusos) |

A geometria **métrica** (carro, setores, delta) continua vindo da telemetria — o
contorno oficial substitui apenas o **desenho** do asfalto, com fidelidade medida.

---

## 2. Fonte dos desenhos (vendor)

- **Repositório:** `github.com/meowmachine/racing-track-maps-vector`, pasta `from-iracing/`.
- **Conteúdo:** 149 famílias de pista / **424 configurações** do iRacing (levantamento
  de mai/2026), cada uma com 6 camadas SVG (1920×1080 px, sem georreferência):
  `background`, `active` (asfalto da config), `inactive`, `pitroad`, `start-finish`, `turns`.
- **Clone local (não versionado no PitWall):** pasta IRMÃ do projeto, clone esparso
  (~47 MB, só `from-iracing/`):

  ```bash
  cd <pasta-pai-do-PitWall>
  git clone --depth 1 --filter=blob:none --sparse https://github.com/meowmachine/racing-track-maps-vector.git
  git -C racing-track-maps-vector sparse-checkout set from-iracing
  ```

- **CDN público (validado em 2026-07-11, HTTP 200 sem cookie):** os mesmos arquivos
  existem em `https://members-assets.iracing.com/public/track-maps/{js_var}/{trackId}-{config}/{layer}.svg`
  — serve de fallback/atualização se o vendor sumir.
- Os metadados do vendor (`iracing-tracks-metadata.json`) têm **BOM** → ler com `utf-8-sig`.

## 3. Índice por trackID

- **Arquivo:** `tracks/iracing_track_maps_index.json` — gerado por
  **`tools/gerar_indice_trackmaps.py`** (re-rodar após `git -C ../racing-track-maps-vector pull`).
- **Conteúdo por config:** nome/config/categoria, localização e lat/lon da pista,
  comprimento (km), curvas, grid, boxes, volta nominal, noite/chuva/IA, caminho local
  no vendor e URL do CDN. Pistas da temporada corrente ganham `temporada_2026s3`
  (semana + slug) cruzando com `tracks/temporada_2026s3.json`.
- **Cobertura validada:** 424/424 configs com as 6 camadas presentes; as 13 pistas da
  temporada 2026 S3 estão todas no catálogo com os track_ids batendo 1:1 com o manifesto
  (Winton=439, Charlotte Roval=554, Interlagos=212 etc.).

## 4. Georreferenciamento (`tools/casar_svg_oficial.py`)

O `active.svg` oficial é um **anel preenchido**: um path com 2 subpaths = contorno
externo + interno da faixa de asfalto. O script:

1. extrai os 2 anéis e deriva a **centerline** (ponto médio externo→interno mais próximo);
2. ajusta uma transformação de **similaridade** (escala + rotação + translação, com
   flip de Y) contra a centerline do `<slug>.track.json` — busca grossa de rotação
   (2° em 2°) e refino por **ICP com Umeyama** (~40 iterações);
3. reorienta os anéis (CCW) e **realinha o início do anel interno** ao do externo,
   para a emenda do polígono do front cair DENTRO do asfalto (corda ≈ largura da faixa);
4. grava o bloco `official` **dentro do próprio `.track.json`**;
5. valida: % dos pontos da volta de referência dentro do anel (alerta se < 97%).

```bash
python tools/casar_svg_oficial.py <slug-ou-pedaço>     # ex.: winton
python tools/casar_svg_oficial.py winton --vendor /outro/caminho
```

Pré-requisitos: o `<slug>.track.json` já existe (ou seja, `nova_pista.py` já rodou),
o vendor está clonado e o índice foi gerado. Dependência `svgpathtools` (no requirements.txt).

### Bloco `official` gravado no `.track.json`

```jsonc
"official": {
  "source": "iRacing members-assets via racing-track-maps-vector (fit por similaridade+ICP)",
  "fitted": { "mean_m": 1.09, "p95_m": 1.93, "ref_lap_inside_pct": 100.0 },
  "outer":  { "lat": [...], "lon": [...] },   // anel externo, 1600 pts, CCW
  "inner":  { "lat": [...], "lon": [...] },   // anel interno, 1600 pts, CCW, início realinhado
  "px_to_m": {                                 // afim px CRUS do SVG (y p/ baixo) -> metros
    "A": [[..,..],[..,..]], "b": [..,..],      //   p_m = A @ [x_px, y_px] + b
    "frame": { "lat0": .., "lon0": .., "R": 111320.0 }
  },
  "start_finish": { "lat": .., "lon": .. }     // centróide do subpath da LINHA de largada
}
```

O `px_to_m` permite renderizar **qualquer** camada oficial (pitroad, turns, largada)
direto do SVG no futuro, sem extração vetorial.

### Números de curva oficiais (`official.turns`)

O script também extrai os rótulos NUMÉRICOS do `turns.svg` (via regex nos `<text>`) e
grava `official.turns = [{n, pct, lat, lon}]`, onde `pct` é a fração da volta de
referência mais próxima do rótulo. Ao rodar, imprime a comparação com o modelo de
curvas do app (`tracks/<slug>.json`) — serve para **conferir a numeração** de cada
pista nova contra o mapa oficial sem processo manual.

> Achado em Winton: os 12 rótulos oficiais expõem exatamente as 2 divergências
> manuais conhecidas do modelo (a T6 oficial em 0.442 não tem curva no modelo e a
> numeração desloca dali em diante; a C12 do modelo, em 0.996, sobra perto da
> largada). O modelo de Winton foi mantido como está (refinado e aprovado). Os `pct`
> dos rótulos são aproximados (o texto fica AO LADO da pista) — usar como guia,
> não como verdade de apex.

## 5. Integração no app

- **`src/webdata.py`** — quando o `.track.json` tem `official.outer/inner`, o payload
  serve esses anéis como `track_edges` (left=outer, right=inner); senão cai nas bordas
  OSM como antes. `track_width_m` continua o do OSM (a faixa desenhada do SVG é estilizada).
- **Frontend: ZERO mudança.** O `projectTrackPair` (`frontend/src/lib/track.ts`) já monta
  o polígono do asfalto (`roadD` = left fwd + right reverso + Z) a partir das edges — com
  os anéis realinhados o preenchimento sai correto (winding nonzero) nas 3 telas fullmap.
- **`tools/nova_pista.py`** — ganhou a etapa **v3**: depois do build OSM, chama o
  `casar_svg_oficial.py` automaticamente; sem vendor clonado, avisa e segue só com OSM.
- **`tools/build_track_from_osm.py`** preserva o bloco `official` ao re-rodar (carrega o
  JSON existente e regrava).

### Fluxo por pista nova (inalterado para o Leo)

1. Rodar 2+ voltas completas na pista (gera o `.ibt`) e avisar na sessão.
2. `python tools/nova_pista.py <pedaço-do-nome>` → volta congelada + curvas + asfalto
   OSM + **contorno oficial casado** (v3).
3. Conferir no app: mapa/curvas/numeração; o `fitted` impresso diz a qualidade do fit.

### Thumbs oficiais no SeasonStrip

`tools/gerar_calendario.py` ganhou o `thumb_oficial()`: quando a pista ainda não foi
criada no PitWall, o thumb do card vem da centerline do track map oficial da config
exata (antes: silhueta OSM de todas as variantes do circuito). Ordem de prioridade
nova: **centerline real → oficial → silhueta OSM → placeholder**. Com isso o
calendário 2026 S3 ficou **sem nenhum placeholder** — inclusive Oran Park (demolida,
sem OSM), cujo `active.svg` é um contorno único (traçado em "8") tratado como
silhueta. O JSON de saída mantém o formato (`thumbs{chave:{paths,fonte}}`) — zero
mudança no front. Requer índice + vendor; sem eles o script degrada como antes.

## 6. Validação (Winton National, 439 — piloto)

- Fit centerline SVG → telemetria: **desvio médio 1,09 m · p95 1,93 m · máx 3,15 m**
  (volta de ~3,0 km).
- **100%** da volta de referência dentro do anel oficial.
- Payload verificado servindo os anéis (1600 pts/lado); overlay visual conferido
  (asfalto + volta + pit + largada coerentes; emenda do polígono dentro do asfalto).
- Fit grosso (sem ICP) dava ~3,0 m de desvio médio; o ICP baixou para 1,09 m.

## 7. Pegadinhas descobertas (importante p/ próximas sessões)

- **`pitroad.svg` é linha TRACEJADA** (dezenas de subpaths minúsculos) + setas
  decorativas → **não extrair vetores dele**; para desenhar o pit, usar a afim `px_to_m`.
- **`start-finish.svg` tem uma SETA decorativa no infield** além da linha de largada —
  o script pega o subpath com centróide mais próximo da centerline (e descarta se
  estiver a mais de ~1 largura da pista).
- **`turns.svg` usa `<text>`** — `svgpathtools` não lê; renderizar via afim se um dia
  quisermos os números oficiais (o app tem modelo próprio de curvas).
- **A faixa desenhada é ~40% mais larga que a real** (Winton: ~15,3 m vs 11 m) —
  nunca usar como fonte de `width_m`.
- **Metadados do vendor com BOM** → `utf-8-sig`.
- **`active.svg` com mais de 2 subpaths**: o script usa os 2 maiores e avisa; conferir
  visualmente (pode acontecer em configs com traçados separados; Navarra Medium tem um
  3º subpath de comprimento zero, inofensivo).
- **`active.svg` com UM subpath só = traçado que cruza sobre si mesmo** (ex.: Oran
  Park GP, figura em "8"): não é um anel — o `casar_svg_oficial.py` recusa (o roadD do
  front também assume anel). O thumb do calendário trata usando o contorno único como
  silhueta. Se um dia uma pista dessas entrar no player, o fit precisa de outro
  tratamento (dividir o contorno no cruzamento).

## 8. Pendências / próximos passos

- [ ] **Pistas da temporada**: casar o contorno oficial de cada uma no 1º stint
      (automático via `nova_pista.py`; Okayama é a semana 1).
- [ ] **Validação visual no Windows**: conferir o asfalto oficial no player real
      (nesta sessão a checagem foi por overlay estático — o Mac não tem Node nem `.ibt` reais).
- [ ] **Pit lane e largada no player** (opcional): payload + render usando
      `official.pitroad`/`start_finish` via afim `px_to_m` (front ainda não desenha).
- [ ] **`samples/` quebrados**: os `.ibt` de exemplo do GitHub têm ~90 s de dados, sem
      volta completa (MX-5 em Winton fecha em ~97 s) → numa máquina nova o fallback
      levanta "Sessão sem voltas válidas". Recortar samples com 2+ voltas inteiras a
      partir dos `.ibt` originais.
- [ ] **Atualização do catálogo**: quando o iRacing lançar pistas novas,
      `git -C ../racing-track-maps-vector pull` + `python tools/gerar_indice_trackmaps.py`
      (ou baixar direto do CDN público, padrão de URL na seção 2).

## 9. Artefatos de demonstração (sessão 2026-07-11)

- Demo interativa de Winton (asfalto oficial + carro animado + pit + largada):
  https://claude.ai/code/artifact/dbe70598-f6dd-46d3-bb39-0f8efaf19882
- Galeria da temporada 2026 S3 (13 mapas oficiais):
  https://claude.ai/code/artifact/07d0cfdc-7532-43b5-ad91-51e19213763b
