# Liquid Glass — referência técnica

> Implementação física do efeito "Liquid Glass" (Apple) em CSS/SVG, baseada no artigo
> [kube.io/blog/liquid-glass-css-svg](https://kube.io/blog/liquid-glass-css-svg/).
> Este doc existe para (a) ajustar o efeito no PitWall e (b) reaproveitá-lo em outro
> projeto. Resumo operacional também em `DESIGN-UI.md` §2.

## 1. Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/liquidGlass.ts` | **Motor completo**: física, geração dos mapas, filtros SVG, observers, store de parâmetros |
| `src/components/SettingsMenu.tsx` | Menu da engrenagem (sliders) — só UI, fala com o motor via `get/setGlassParam` |
| `src/styles/components.css` | Fallback (blur puro p/ não-Chromium), tinte `--pw-glassbg`, estilos `.pw-set-*` do menu |
| `src/styles/pitwall.css` | Default da var `--pw-glassbg` no `:root` |
| `src/main.tsx` | `initLiquidGlass()` — liga o motor antes do React montar |
| `src/App.tsx` + `components/Chrome.tsx` | Estado aberto/fechado do menu + botão engrenagem |

**Não há dependências** — o motor é TypeScript puro + DOM. Para reusar em outro
projeto: copiar `liquidGlass.ts`, chamar `initLiquidGlass()`, dar a classe de vidro
aos elementos e (opcional) copiar `SettingsMenu.tsx` + CSS do menu.

## 2. A física (o que o artigo ensina)

O vidro é um bloco com topo plano e borda curva ("**bezel**"). Só a borda refrata —
o miolo fica limpo. Para cada distância `d` da borda (até `bezel` px):

```
x = d / bezel                              # 0 = beirada, 1 = fim do bezel
perfil(x) = (1 - (1-x)^4)^(1/4)            # squircle convexo (o que a Apple usa)
altura(x) = thickness · perfil(x)          # altura da superfície ali
inclinação = thickness · perfil'(x) / bezel
θ1 = atan(inclinação)                       # ângulo de incidência (raio vem vertical)
θ2 = asin(sin(θ1) / refIndex)               # Lei de Snell (ar n=1 → vidro n≈1.5)
desvio(x) = altura(x) · tan(θ1 − θ2)        # quanto o raio "anda" até o fundo, em px
```

O desvio aponta **para DENTRO** do painel (lente convexa = borda amostra conteúdo
mais central → imagem comprimida na borda, igual ao iOS). É **zero** na beirada
exata (altura→0) e no miolo (inclinação→0), com pico a ~3–10% do bezel.

Tudo isso é pré-calculado numa tabela 1D de 1024 amostras (`buildTables`) — uma
simulação de raios por **mudança de forma**, não por pixel.

## 3. Os três mapas (canvas → PNG dataURL)

`buildMaps(w, h, radius, params)` varre os pixels do retângulo arredondado usando a
SDF (distância interna até a borda + direção para fora) e pinta:

1. **Displacement map** (`dispURL`) — codificação padrão do `feDisplacementMap`:
   `R = 128 + dx·127`, `G = 128 + dy·127`, `B = 128`. Vetor `(dx,dy)` = direção
   para dentro × `desvio/maxDesvio` (normalizado pelo máximo).
   ⚠️ **`scale` do filtro = 2 × maxDesvio × refraction** — a spec SVG desloca
   `scale·(canal − 0.5)`, ou seja, canal cheio = só metade do scale.
2. **Máscara especular** (`specURL`) — branco com alfa
   `sin(θ1)^1.6 × [max(0, n⃗·L⃗)² + 0.45·max(0, −n⃗·L⃗)²]`: filete na borda íngreme
   virada para a luz (`lightAngle`), com contra-luz a 45% no lado oposto.
3. **Ramp do blur progressivo** (`rampURL`) — alfa 1 na borda → 0 a `2.2×bezel`;
   gerado em ¼ de resolução (é máscara suave) e **cobrindo a região expandida**
   do filtro (margens = 1, para o desfoque forte continuar sob o recorte).

Os mapas dependem de tamanho/raio/física → são refeitos em **resize** (debounce
120 ms) e quando um slider de física muda (250 ms). Os demais sliders mudam **só
atributos** do filtro (de graça, 60 fps).

## 4. A cadeia do filtro (por elemento)

```
filter #pw-lg-N  (userSpaceOnUse, região = caixa do elemento ± 48px, sRGB)
├─ feFlood 128 + feImage(disp) + feMerge      → "map"   (margens neutras!)
├─ feDisplacementMap(SourceGraphic, map)       → refração
├─ feGaussianBlur(blur)                        → "base"
├─ feGaussianBlur(blur + progBlur)             → "big"
├─ feImage(ramp) + feComposite in              → blur forte SÓ na borda
├─ feMerge(base, edgeblur)                     → blur progressivo pronto
├─ feColorMatrix saturate(satBoost) + feComponentTransfer(×1.06) → acabamento
├─ feColorMatrix saturate(specSat) sobre "big" + lift(×1.5 +0.22) → cor do brilho
├─ feImage(spec) + feComposite in              → rim com a COR do fundo
├─ feComponentTransfer feFuncA(specOpacity)    → intensidade do rim
└─ feBlend screen                              → rim por cima do vidro
```

Por que cada esquisitice:
- **feFlood neutro sob o mapa**: a região do filtro é maior que o elemento (margem
  p/ o blur ter conteúdo); sem o flood, as margens do `feImage` são transparentes
  (= canal 0 = deslocamento máximo espúrio).
- **Especular herda cor do fundo**: o rim usa o backdrop desfocado super-saturado
  (não branco puro) — é isso que dá o look "vivo" da Apple. O `intercept 0.22`
  garante rim visível mesmo sobre fundo preto.
- **`color-interpolation-filters="sRGB"`**: senão 128 ≠ neutro (drift no linearRGB).
- O elemento é aplicado via `style.backdropFilter = url(#pw-lg-N)` **inline**
  (vence o fallback de classe do CSS).

## 5. O motor (auto-aplicação)

- `GLASS_SELECTOR` (topo do liquidGlass.ts): `.pw-glass2`, `.pw-glass`,
  `.pw-maplayer .pw-minimap/.pw-lapdetail`, `.pw-scrubfloat .tp-scrub`.
  **Para dar vidro a um elemento novo: só usar uma dessas classes.** Para mudar o
  conjunto, editar a constante.
- `MutationObserver` (body, subtree) pega elementos que entram/saem;
  `ResizeObserver` dispara rebuild por tamanho. Filtros órfãos são removidos.
- Elemento que nasce **sem layout** (display:none etc.) fica registrado como
  unidade nula até o RO vê-lo com tamanho — por isso os guards `if (!u)`.
- Os `<filter>` vivem num `<svg>` invisível criado no `<body>`.
- **Suporte**: `backdrop-filter:url(#…)` é só Chromium (limite citado no artigo).
  O motor checa `'chrome' in window` e simplesmente não roda fora — ficam os
  fallbacks de blur das classes CSS.

## 6. Parâmetros (menu Settings ⚙)

| Slider | Chave | Faz o quê | Tipo |
|---|---|---|---|
| Specular opacity | `specOpacity` | intensidade do filete de luz | ao vivo |
| Specular saturation | `specSat` | quão colorido o filete fica (cor do fundo) | ao vivo |
| Refraction level | `refraction` | multiplicador do deslocamento (escala do mapa) | ao vivo |
| Blur level | `blur` | desfoque base do fundo | ao vivo |
| Progressive blur | `progBlur` | desfoque EXTRA que só existe na borda | ao vivo |
| Glass bg opacity | `bgOpacity` | tinte escuro do painel (var `--pw-glassbg`) | ao vivo |
| Bezel width | `bezel` | largura da zona curva | rebuild |
| Glass thickness | `thickness` | espessura da lente (mais = refrata mais) | rebuild |
| Refractive index | `refIndex` | material (água 1.33, vidro 1.5, safira 1.77) | rebuild |
| Light angle | `lightAngle` | de onde vem a luz do especular | rebuild |
| Backdrop saturation | `satBoost` | saturação geral do fundo refratado | ao vivo |

- **Defaults**: `GLASS_DEFAULTS` no liquidGlass.ts (calibrados pelo usuário em
  2026-06-11). Ao mudar `bgOpacity` default, alinhar também `--pw-glassbg` no
  `:root` (pitwall.css) e os fallbacks `var(--pw-glassbg,.33)` (components.css).
- Persistência: `localStorage('pw_glass_v1')` (merge com defaults → adicionar
  parâmetro novo é retro-compatível).
- Para **adicionar um slider**: nova chave em `GlassParams`/`GLASS_DEFAULTS`, usar
  no motor, e uma linha nos arrays `MAIN`/`PHYS` do SettingsMenu. Se exigir refazer
  mapas, incluir em `REBUILD_KEYS`.

## 7. Pegadinhas e limites conhecidos

- **Nunca** voltar o filtro p/ um `#id` global compartilhado: o mapa depende do
  tamanho/raio DE CADA elemento (era o motivo do efeito antigo parecer "ruído").
- Performance: o custo por frame é blur×2 + displacement por painel. Evitar
  animar o TAMANHO de um painel de vidro (rebuild em cascata) — animar
  transform/opacity é ok (não refaz nada).
- `border-radius` é lido do computed style (px ou %); raio assimétrico não é
  suportado (usa o top-left).
- Janela oculta do preview: screenshots travam e `img.decode()` pode pendurar —
  verificar por DOM (ver §8) e usar `Image.onload` com `Promise.race`.
- O vidro só "aparece" com conteúdo passando por baixo; sobre fundo vazio é
  esperado ficar escuro/chapado.
- `feImage` + dataURL é recriado a cada rebuild — sem leak (GC), mas evitar
  rebuilds por frame (os debounces já garantem).

## 8. Receita de verificação (sem screenshot)

```js
// 1) filtros aplicados?
[...document.querySelectorAll('.pw-glass2')].map(e => e.style.backdropFilter)
// 2) física do mapa: ler pixels do feImage (centro deve ser 128/128;
//    borda esquerda R>128, direita R<128, topo G>128, base G<128 — simétricos)
// 3) sliders ao vivo: mudar refraction e conferir o atributo scale do
//    feDisplacementMap (= 2·maxDisp·refraction)
```

## 9. Ideias futuras (do artigo, não implementadas)

- **Aberração cromática**: 3 feDisplacementMap com scales levemente diferentes
  (R/G/B) + recombinação — custo 3× na refração.
- Perfis alternativos de bezel: côncavo `1−perfil(x)` e "lip" (mistura) — trocar
  em `buildTables`.
- `feSpecularLighting` real no lugar do rim pré-calculado (mais caro, mais fiel).
