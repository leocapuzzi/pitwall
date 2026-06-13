/* ============================================================
   LIQUID GLASS físico — implementação do artigo
   kube.io/blog/liquid-glass-css-svg (Snell + displacement map)

   Como funciona, por elemento de vidro:
   1. A borda do vidro ("bezel") tem um perfil de altura squircle
      h(x) = (1-(1-x)^4)^(1/4). Para cada distância da borda,
      traçamos o raio de luz: ângulo da superfície → Lei de Snell
      (n1·senθ1 = n2·senθ2) → quanto o raio desvia ao atravessar
      a espessura do vidro até o fundo.
   2. Esse desvio vira um DISPLACEMENT MAP pintado num canvas
      (R = desvio X, G = desvio Y, 128 = neutro), apontando para
      DENTRO (lente convexa = borda "puxa" o conteúdo do centro).
   3. Um filtro SVG exclusivo do elemento (feImage do mapa +
      feDisplacementMap + blur progressivo na borda + brilho
      especular que herda a cor saturada do fundo) é aplicado com
      backdrop-filter:url(#...). Só Chromium; o CSS das classes
      .pw-glass/.pw-glass2 mantém o fallback de blur puro.

   Os parâmetros são ajustáveis ao vivo no menu Settings
   (engrenagem do topo) e persistem em localStorage.
   ============================================================ */

export type GlassParams = {
  /* principais (mesmos sliders do exemplo Apple Music do artigo) */
  specOpacity: number   // opacidade do brilho especular (0–1)
  specSat: number       // saturação da cor que o brilho herda do fundo
  refraction: number    // multiplicador da refração (escala do mapa)
  blur: number          // desfoque base do fundo (px)
  progBlur: number      // desfoque EXTRA progressivo na borda (px)
  bgOpacity: number     // opacidade do tinte escuro do vidro (0–0.9)
  /* física do vidro (avançado) */
  bezel: number         // largura da borda curva (px)
  thickness: number     // espessura do vidro (px) — altura da lente
  refIndex: number      // índice de refração (vidro ≈ 1.5)
  lightAngle: number    // direção da luz do especular (graus)
  satBoost: number      // saturação geral do fundo refratado
}

/* calibrado pelo usuário no menu Settings (2026-06-11) */
export const GLASS_DEFAULTS: GlassParams = {
  specOpacity: 0.48, specSat: 1.5, refraction: 2,
  blur: 0.5, progBlur: 1, bgOpacity: 0.33,
  bezel: 13, thickness: 45, refIndex: 1.34, lightAngle: 60, satBoost: 1.15,
}

const LS_KEY = 'pw_glass_v1'
/* mudar estes exige reconstruir os mapas (canvas); os demais só mexem em atributos */
const REBUILD_KEYS: (keyof GlassParams)[] = ['bezel', 'thickness', 'refIndex', 'lightAngle']

let params: GlassParams = loadParams()
const subs = new Set<(p: GlassParams) => void>()

function loadParams(): GlassParams {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...GLASS_DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...GLASS_DEFAULTS }
}
let saveT = 0
function saveParams() {
  clearTimeout(saveT)
  saveT = window.setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(params)) } catch { /* ignore */ }
  }, 300)
}

export function getGlassParams(): GlassParams { return params }
export function onGlassChange(fn: (p: GlassParams) => void) {
  subs.add(fn); return () => { subs.delete(fn) }
}
export function setGlassParam<K extends keyof GlassParams>(k: K, v: GlassParams[K]) {
  params = { ...params, [k]: v }
  saveParams()
  subs.forEach(f => f(params))
  if (REBUILD_KEYS.includes(k)) scheduleRebuildAll()
  else applyLiveParams()
}
export function resetGlassParams() {
  params = { ...GLASS_DEFAULTS }
  saveParams()
  subs.forEach(f => f(params))
  applyLiveParams()
  scheduleRebuildAll()
}

/* ============================================================
   Física: tabela 1D de refração ao longo do bezel
   ============================================================ */
type Tables = { m: Float32Array; s: Float32Array; maxM: number }

function buildTables(bezel: number, thickness: number, n: number): Tables {
  const N = 1024
  const m = new Float32Array(N)
  const s = new Float32Array(N)
  let maxM = 0
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1)              // 0 = borda externa, 1 = fim do bezel
    const u = 1 - x
    const g = 1 - u * u * u * u        // squircle: h = g^(1/4)
    const prof = Math.pow(g, 0.25)
    const dprof = g <= 0 ? 1e9 : (u * u * u) * Math.pow(g, -0.75)
    const slope = thickness * dprof / bezel        // dH/dd em px/px
    const t1 = Math.atan(slope)                    // ângulo de incidência
    const t2 = Math.asin(Math.min(1, Math.sin(t1) / n)) // Snell
    const mag = thickness * prof * Math.tan(t1 - t2)    // desvio no fundo (px)
    m[i] = mag
    s[i] = Math.sin(t1)                // inclinação (alimenta o especular)
    if (mag > maxM) maxM = mag
  }
  return { m, s, maxM: Math.max(maxM, 0.001) }
}

/* ============================================================
   Geração dos mapas (canvas → dataURL) p/ um retângulo W×H
   com cantos arredondados R e bezel B.
   ============================================================ */
const REGION_PAD = 48        // margem do filtro p/ o blur ter conteúdo nas bordas
const RAMP_SCALE = 0.25      // máscara do blur progressivo pode ser low-res

type GlassMaps = { dispURL: string; specURL: string; rampURL: string; maxDisp: number }

function buildMaps(w: number, h: number, radius: number, p: GlassParams): GlassMaps {
  const k = Math.min(window.devicePixelRatio || 1, 2)
  const B = Math.max(2, Math.min(p.bezel, Math.min(w, h) / 2 - 1))
  const R = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  const { m: tm, s: ts, maxM } = buildTables(B, p.thickness, p.refIndex)
  const N = tm.length

  const W = Math.max(2, Math.round(w * k))
  const H = Math.max(2, Math.round(h * k))
  const disp = new ImageData(W, H)
  const spec = new ImageData(W, H)
  const dd = disp.data, sd = spec.data

  const la = p.lightAngle * Math.PI / 180
  const Lx = Math.cos(la), Ly = Math.sin(la)
  const hw = w / 2, hh = h / 2
  const innerX = hw - R, innerY = hh - R
  const reach = B * 2.2                 // alcance do ramp do blur progressivo

  for (let py = 0; py < H; py++) {
    const cy = (py + 0.5) / k - hh
    const ay = Math.abs(cy), qy = ay - innerY
    const sgy = cy < 0 ? -1 : 1
    for (let px = 0; px < W; px++) {
      const o = (py * W + px) * 4
      const cx = (px + 0.5) / k - hw
      const ax = Math.abs(cx), qx = ax - innerX
      // SDF interno do retângulo arredondado + direção p/ FORA
      let d: number, ox: number, oy: number
      if (qx > 0 && qy > 0) {
        const hyp = Math.hypot(qx, qy)
        d = R - hyp
        ox = (qx / hyp) * (cx < 0 ? -1 : 1)
        oy = (qy / hyp) * sgy
      } else if (qx > qy) {
        d = R - qx
        ox = cx < 0 ? -1 : 1; oy = 0
      } else {
        d = R - qy
        ox = 0; oy = sgy
      }

      if (d >= reach) {                  // miolo plano: sem refração/brilho
        dd[o] = 128; dd[o + 1] = 128; dd[o + 2] = 128; dd[o + 3] = 255
        continue
      }

      const xN = d / B
      let mag = 0, steep = 0
      if (xN < 1) {
        const ti = Math.min(N - 1, Math.max(0, Math.round(xN * (N - 1))))
        mag = tm[ti]; steep = ts[ti]
      }
      // deslocamento p/ DENTRO (lente convexa), normalizado pelo máximo
      const dn = mag / maxM
      dd[o] = 128 + Math.round(-ox * dn * 127)
      dd[o + 1] = 128 + Math.round(-oy * dn * 127)
      dd[o + 2] = 128; dd[o + 3] = 255

      // especular: borda íngreme de frente p/ a luz (+ contra-luz mais fraca)
      const face = ox * Lx + oy * Ly
      const lit = Math.pow(Math.max(0, face), 2) + 0.45 * Math.pow(Math.max(0, -face), 2)
      const a = Math.pow(steep, 1.6) * lit
      sd[o] = 255; sd[o + 1] = 255; sd[o + 2] = 255
      sd[o + 3] = Math.round(255 * Math.min(1, a))
    }
  }

  // máscara do blur progressivo: 1 na borda → 0 no miolo; cobre a REGIÃO inteira
  // (margens = 1, p/ o desfoque forte continuar além do recorte do painel)
  const rw = Math.max(2, Math.round((w + REGION_PAD * 2) * RAMP_SCALE))
  const rh = Math.max(2, Math.round((h + REGION_PAD * 2) * RAMP_SCALE))
  const ramp = new ImageData(rw, rh)
  const rd = ramp.data
  for (let py = 0; py < rh; py++) {
    const cy = (py + 0.5) / RAMP_SCALE - REGION_PAD - hh
    const ay = Math.abs(cy), qy = ay - innerY
    for (let px = 0; px < rw; px++) {
      const o = (py * rw + px) * 4
      const cx = (px + 0.5) / RAMP_SCALE - REGION_PAD - hw
      const ax = Math.abs(cx), qx = ax - innerX
      const q = (qx > 0 && qy > 0) ? Math.hypot(qx, qy) : Math.max(qx, qy)
      const d = R - q
      const a = d <= 0 ? 1 : Math.pow(Math.max(0, 1 - d / reach), 1.3)
      rd[o] = 255; rd[o + 1] = 255; rd[o + 2] = 255
      rd[o + 3] = Math.round(255 * a)
    }
  }

  return {
    dispURL: toURL(disp), specURL: toURL(spec), rampURL: toURL(ramp),
    maxDisp: maxM,
  }
}

function toURL(img: ImageData): string {
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

/* ============================================================
   Motor: um filtro SVG por elemento de vidro, aplicado via
   backdrop-filter:url(#pw-lg-N). Observa o DOM (Mutation) e o
   tamanho (Resize) e reconstrói os mapas quando preciso.
   ============================================================ */
const GLASS_SELECTOR = [
  '.pw-glass2', '.pw-glass',
  '.pw-maplayer .pw-minimap', '.pw-maplayer .pw-lapdetail',
  '.pw-scrubfloat .tp-scrub',
].join(', ')

// Telas marcadas com .pw-liteglass NÃO recebem o filtro SVG físico (pesado de
// compor): caem no fallback CSS de blur simples. Usado na tela AI Engineer, que
// tem ~8 painéis de vidro + animações contínuas — o custo de recompor 8 filtros
// físicos por frame derrubava o FPS de TODA a tela. O vidro físico segue nas
// telas de mapa (poucos painéis, animação só no play).
const LITE_ANCESTOR = '.pw-liteglass'
function eligible(el: HTMLElement): boolean {
  return !el.closest(LITE_ANCESTOR)
}

const SVG_NS = 'http://www.w3.org/2000/svg'

type Unit = {
  el: HTMLElement
  filter: SVGFilterElement
  nMap: SVGElement; nDisp: SVGElement; nBase: SVGElement; nBig: SVGElement
  nRamp: SVGElement; nSat: SVGElement; nSpecSat: SVGElement
  nSpecMask: SVGElement; nSpecA: SVGElement
  maxDisp: number
  w: number; h: number
}

let svgRoot: SVGSVGElement | null = null
let defs: SVGDefsElement | null = null
let mo: MutationObserver | null = null
let ro: ResizeObserver | null = null
const units = new Map<HTMLElement, Unit>()
let idSeq = 0
let rebuildT = 0
const pendingRebuild = new Set<HTMLElement>()

function mk(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

function supported(): boolean {
  // backdrop-filter:url(#svg) só funciona em Chromium hoje (limite citado no artigo)
  return typeof window !== 'undefined' && 'chrome' in window
}

function measure(el: HTMLElement): { w: number; h: number; r: number } {
  const w = el.offsetWidth, h = el.offsetHeight   // layout px (ignora transform)
  let r = 0
  const raw = getComputedStyle(el).borderTopLeftRadius
  const v = parseFloat(raw)
  if (!isNaN(v)) r = raw.endsWith('%') ? Math.min(w, h) * v / 100 : v
  r = Math.min(r, Math.min(w, h) / 2)
  return { w, h, r }
}

function buildFilterFor(el: HTMLElement): Unit | null {
  const { w, h, r } = measure(el)
  if (w < 8 || h < 8) return null
  const id = `pw-lg-${++idSeq}`
  const p = params
  const maps = buildMaps(w, h, r, p)

  const filter = mk('filter', {
    id, filterUnits: 'userSpaceOnUse',
    x: -REGION_PAD, y: -REGION_PAD,
    width: w + REGION_PAD * 2, height: h + REGION_PAD * 2,
    'color-interpolation-filters': 'sRGB',
  }) as SVGFilterElement

  // mapa de refração sobre fundo neutro (margens da região não deslocam)
  const flood = mk('feFlood', { 'flood-color': 'rgb(128,128,128)', result: 'neutral' })
  const nMap = mk('feImage', {
    href: maps.dispURL, x: 0, y: 0, width: w, height: h,
    preserveAspectRatio: 'none', result: 'mapimg',
  })
  const merge1 = mk('feMerge', { result: 'map' })
  merge1.append(mk('feMergeNode', { in: 'neutral' }), mk('feMergeNode', { in: 'mapimg' }))

  const nDisp = mk('feDisplacementMap', {
    in: 'SourceGraphic', in2: 'map',
    scale: (2 * maps.maxDisp * p.refraction).toFixed(2),
    xChannelSelector: 'R', yChannelSelector: 'G', result: 'disp',
  })

  // blur progressivo: base no miolo, forte na borda (máscara ramp)
  const nBase = mk('feGaussianBlur', { in: 'disp', stdDeviation: p.blur, result: 'base' })
  const nBig = mk('feGaussianBlur', { in: 'disp', stdDeviation: p.blur + p.progBlur, result: 'big' })
  const nRamp = mk('feImage', {
    href: maps.rampURL, x: -REGION_PAD, y: -REGION_PAD,
    width: w + REGION_PAD * 2, height: h + REGION_PAD * 2,
    preserveAspectRatio: 'none', result: 'rampimg',
  })
  const edge = mk('feComposite', { in: 'big', in2: 'rampimg', operator: 'in', result: 'edgeblur' })
  const merge2 = mk('feMerge', { result: 'mix' })
  merge2.append(mk('feMergeNode', { in: 'base' }), mk('feMergeNode', { in: 'edgeblur' }))

  // acabamento do fundo (pop de cor aprovado no GO Fast)
  const nSat = mk('feColorMatrix', { in: 'mix', type: 'saturate', values: p.satBoost, result: 'satd' })
  const lift = mk('feComponentTransfer', { in: 'satd', result: 'basefinal' })
  lift.append(
    mk('feFuncR', { type: 'linear', slope: 1.06 }),
    mk('feFuncG', { type: 'linear', slope: 1.06 }),
    mk('feFuncB', { type: 'linear', slope: 1.06 }),
  )

  // especular: o brilho herda a COR do fundo desfocado, super-saturada
  const nSpecSat = mk('feColorMatrix', { in: 'big', type: 'saturate', values: p.specSat, result: 'specsat' })
  const specLift = mk('feComponentTransfer', { in: 'specsat', result: 'speclit' })
  specLift.append(
    mk('feFuncR', { type: 'linear', slope: 1.5, intercept: 0.22 }),
    mk('feFuncG', { type: 'linear', slope: 1.5, intercept: 0.22 }),
    mk('feFuncB', { type: 'linear', slope: 1.5, intercept: 0.22 }),
  )
  const nSpecMask = mk('feImage', {
    href: maps.specURL, x: 0, y: 0, width: w, height: h,
    preserveAspectRatio: 'none', result: 'specmask',
  })
  const rim = mk('feComposite', { in: 'speclit', in2: 'specmask', operator: 'in', result: 'rim' })
  const nSpecA = mk('feComponentTransfer', { in: 'rim', result: 'rimA' })
  nSpecA.append(mk('feFuncA', { type: 'linear', slope: p.specOpacity }))
  const blend = mk('feBlend', { in: 'rimA', in2: 'basefinal', mode: 'screen' })

  filter.append(flood, nMap, merge1, nDisp, nBase, nBig, nRamp, edge, merge2,
    nSat, lift, nSpecSat, specLift, nSpecMask, rim, nSpecA, blend)
  defs!.appendChild(filter)

  el.style.setProperty('-webkit-backdrop-filter', `url(#${id})`)
  el.style.setProperty('backdrop-filter', `url(#${id})`)

  return {
    el, filter, nMap, nDisp, nBase, nBig, nRamp, nSat, nSpecSat, nSpecMask, nSpecA,
    maxDisp: maps.maxDisp, w, h,
  }
}

function rebuildUnit(u: Unit) {
  const { w, h, r } = measure(u.el)
  if (w < 8 || h < 8) return
  const maps = buildMaps(w, h, r, params)
  u.w = w; u.h = h; u.maxDisp = maps.maxDisp
  u.filter.setAttribute('x', String(-REGION_PAD))
  u.filter.setAttribute('y', String(-REGION_PAD))
  u.filter.setAttribute('width', String(w + REGION_PAD * 2))
  u.filter.setAttribute('height', String(h + REGION_PAD * 2))
  u.nMap.setAttribute('href', maps.dispURL)
  u.nMap.setAttribute('width', String(w)); u.nMap.setAttribute('height', String(h))
  u.nSpecMask.setAttribute('href', maps.specURL)
  u.nSpecMask.setAttribute('width', String(w)); u.nSpecMask.setAttribute('height', String(h))
  u.nRamp.setAttribute('href', maps.rampURL)
  u.nRamp.setAttribute('width', String(w + REGION_PAD * 2))
  u.nRamp.setAttribute('height', String(h + REGION_PAD * 2))
  u.nDisp.setAttribute('scale', (2 * maps.maxDisp * params.refraction).toFixed(2))
}

/* parâmetros "ao vivo" — só atributos, sem refazer canvas */
function applyLiveParams() {
  document.documentElement.style.setProperty('--pw-glassbg', String(params.bgOpacity))
  units.forEach(u => {
    if (!u) return                       // registrado mas ainda sem layout
    u.nDisp.setAttribute('scale', (2 * u.maxDisp * params.refraction).toFixed(2))
    u.nBase.setAttribute('stdDeviation', String(params.blur))
    u.nBig.setAttribute('stdDeviation', String(params.blur + params.progBlur))
    u.nSat.setAttribute('values', String(params.satBoost))
    u.nSpecSat.setAttribute('values', String(params.specSat))
    const fa = u.nSpecA.firstChild as SVGElement | null
    fa?.setAttribute('slope', String(params.specOpacity))
  })
}

function scheduleRebuildAll() {
  units.forEach((u, el) => { if (u) pendingRebuild.add(el) })
  clearTimeout(rebuildT)
  rebuildT = window.setTimeout(flushRebuilds, 250)
}
function scheduleRebuild(el: HTMLElement) {
  pendingRebuild.add(el)
  clearTimeout(rebuildT)
  rebuildT = window.setTimeout(flushRebuilds, 120)
}
function flushRebuilds() {
  pendingRebuild.forEach(el => {
    const u = units.get(el)
    if (u && el.isConnected) rebuildUnit(u)
  })
  pendingRebuild.clear()
  applyLiveParams()
}

function attach(el: HTMLElement) {
  if (units.has(el)) return
  if (!eligible(el)) return            // tela lite → usa o fallback CSS (blur simples)
  const u = buildFilterFor(el)
  if (u) {
    units.set(el, u)
    ro!.observe(el)
  } else {
    // ainda sem layout (escondido) — observa; o Resize dispara quando aparecer
    units.set(el, null as unknown as Unit)
    ro!.observe(el)
  }
}

function detach(el: HTMLElement) {
  const u = units.get(el)
  if (u) {
    u.filter.remove()
    el.style.removeProperty('-webkit-backdrop-filter')
    el.style.removeProperty('backdrop-filter')
  }
  units.delete(el)
  ro?.unobserve(el)
  pendingRebuild.delete(el)
}

function scan(root: ParentNode) {
  if (root instanceof HTMLElement && root.matches(GLASS_SELECTOR)) attach(root)
  root.querySelectorAll?.(GLASS_SELECTOR).forEach(el => {
    if (el instanceof HTMLElement) attach(el)
  })
}

export function initLiquidGlass() {
  if (!supported()) return
  window.__pwLG?.dispose()

  svgRoot = mk('svg', { width: 0, height: 0, 'aria-hidden': 'true' }) as SVGSVGElement
  svgRoot.style.position = 'absolute'
  svgRoot.style.pointerEvents = 'none'
  defs = mk('defs', {}) as SVGDefsElement
  svgRoot.appendChild(defs)
  document.body.appendChild(svgRoot)

  ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const el = e.target as HTMLElement
      const u = units.get(el)
      if (!u) {
        // ganhou layout agora — cria de verdade
        if (el.offsetWidth >= 8) {
          units.delete(el)
          attach(el)
        }
      } else if (Math.abs(u.w - el.offsetWidth) > 1 || Math.abs(u.h - el.offsetHeight) > 1) {
        scheduleRebuild(el)
      }
    }
  })

  mo = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(n => { if (n instanceof HTMLElement) scan(n) })
      m.removedNodes.forEach(n => {
        if (!(n instanceof HTMLElement)) return
        units.forEach((_, el) => { if (!el.isConnected) detach(el) })
      })
    }
  })
  mo.observe(document.body, { childList: true, subtree: true })

  scan(document.body)
  applyLiveParams()

  window.__pwLG = {
    dispose() {
      mo?.disconnect(); ro?.disconnect()
      units.forEach((_, el) => detach(el))
      units.clear()
      svgRoot?.remove()
      svgRoot = null; defs = null; mo = null; ro = null
      delete window.__pwLG
    },
  }
}

declare global {
  interface Window { __pwLG?: { dispose: () => void }; chrome?: unknown }
}
