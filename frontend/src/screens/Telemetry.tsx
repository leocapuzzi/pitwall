import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PointerEvent as RPointerEvent } from 'react'
import Icon from '../components/Icon'
import SlideSeg from '../components/SlideSeg'
import DriverPod from '../components/DriverPod'
import InteractiveTrack, { type TrackHandle } from '../components/InteractiveTrack'
import MiniTrackMap from '../components/MiniTrackMap'
import { useSession } from '../lib/useSession'
import { getTyreLayout, setTyreParam, resetTyreLayout, onTyreLayout, TYRE_DEFAULTS, TYRE_CX, type TyreLayout } from '../lib/tyreLayout'
import { getChannelPrefs, moveChannel, toggleChannel, resetChannelPrefs, onChannelPrefs, CHANNEL_ORDER } from '../lib/channelPrefs'
import { projectTrackPair, type TrackPair } from '../lib/track'
import { parseLap, fmtClock } from '../lib/fmt'
import { takePendingFocus } from '../lib/bus'
import type { Payload, Channels } from '../lib/api'

// Telemetry fullmap (réplica do Race Engineer do GO Fast): mapa = fundo da tela
// (câmera no carro, fantasma da média), pods ao vivo, rail, navegador de segmentos,
// minimapa + slider na área do mapa, e o PAINEL de canais em vidro à direita com
// bolhas de valor no cursor, eixos, zoom por seleção/roda e o player embutido.
// Os gráficos são RE-AMOSTRADOS por janela de zoom (nada de esticar viewBox — sem
// serrilhado/tracejado distorcido).

const W = 600, H = 100
const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v))
const sign = (v: number, dec = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dec)

interface Def {
  kind: string; name: string; color: string; unit: string; step?: boolean
  main: number[]; ghost: number[] | null
  fm: (i: number) => string | number; fg: (i: number) => string | number
  axis: [string, string, string]
}
interface SegCorner { n: number; apex: number; d: number }
interface Model {
  defs: Def[]; N: number; lapSecs: number; mediaSecs: number; totalD: number; pair: TrackPair
  tRef: number[] | null; tMed: number[] | null; lengthM: number; hasLineB: boolean
  segCorners: SegCorner[]
}

function build(p: Payload): Model {
  const ref = p.ref, med = p.media
  const N = ref.speed.length
  const allS = ref.speed.concat(med.speed)
  const smin = Math.min(...allS), smax = Math.max(...allS)
  const rmin = Math.min(...ref.rpm, ...med.rpm), rmax = Math.max(...ref.rpm, ...med.rpm)
  const steerMax = Math.max(10, ...ref.steer.map(Math.abs), ...med.steer.map(Math.abs))
  const maxGear = Math.max(2, ...ref.gear, ...med.gear)
  const dmax = Math.max(0.05, ...p.delta.map(v => Math.abs(v)))
  const N01 = (a: number[]) => a.map(v => clamp01(v / 100))
  const NRM = (a: number[], mn: number, mx: number) => a.map(v => clamp01((v - mn) / ((mx - mn) || 1)))
  const defs: Def[] = [
    { kind: 'delta', name: 'DELTA', color: 'var(--purple)', unit: 's', main: p.delta.map(v => clamp01(0.5 - (v / (2 * dmax)) * 0.9)), ghost: null, fm: i => { const v = p.delta[i]; return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3) }, fg: () => '', axis: ['+' + dmax.toFixed(2), '0.00', '−' + dmax.toFixed(2)] },
    { kind: 'speed', name: 'SPEED', color: 'var(--cyan)', unit: 'km/h', main: NRM(ref.speed, smin, smax), ghost: NRM(med.speed, smin, smax), fm: i => Math.round(ref.speed[i]), fg: i => Math.round(med.speed[i]), axis: [String(Math.round(smax)), String(Math.round((smax + smin) / 2)), String(Math.round(smin))] },
    { kind: 'throttle', name: 'THROTTLE', color: 'var(--accent)', unit: '%', main: N01(ref.throttle), ghost: N01(med.throttle), fm: i => Math.round(ref.throttle[i]), fg: i => Math.round(med.throttle[i]), axis: ['100', '50', '0'] },
    { kind: 'brake', name: 'BRAKE', color: 'var(--red)', unit: '%', main: N01(ref.brake), ghost: N01(med.brake), fm: i => Math.round(ref.brake[i]), fg: i => Math.round(med.brake[i]), axis: ['100', '50', '0'] },
    { kind: 'rpm', name: 'RPM', color: 'var(--amber)', unit: '', main: NRM(ref.rpm, rmin, rmax), ghost: NRM(med.rpm, rmin, rmax), fm: i => (ref.rpm[i] / 1000).toFixed(1) + 'k', fg: i => (med.rpm[i] / 1000).toFixed(1) + 'k', axis: [(rmax / 1000).toFixed(1) + 'k', ((rmax + rmin) / 2000).toFixed(1) + 'k', (rmin / 1000).toFixed(1) + 'k'] },
    { kind: 'gear', name: 'GEAR', color: 'var(--ink)', unit: '', step: true, main: ref.gear.map(v => clamp01(v / maxGear)), ghost: med.gear.map(v => clamp01(v / maxGear)), fm: i => Math.round(ref.gear[i]), fg: i => Math.round(med.gear[i]), axis: [String(maxGear), '', '0'] },
    { kind: 'steering', name: 'STEERING', color: 'var(--ink-2)', unit: '°', main: ref.steer.map(v => clamp01(0.5 + v / (2 * steerMax))), ghost: med.steer.map(v => clamp01(0.5 + v / (2 * steerMax))), fm: i => Math.round(ref.steer[i]), fg: i => Math.round(med.steer[i]), axis: ['+' + Math.round(steerMax), '0', '−' + Math.round(steerMax)] },
  ]
  const lista = p.analise_curvas || []
  const segCorners: SegCorner[] = (p.corners || []).map((c, i) => {
    const a: Record<string, any> = (lista[i]?.name === c.name ? lista[i] : lista.find(r => r.name === c.name)) || {}
    return { n: c.n, apex: c.apex_pct, d: +(a.dt ?? 0) }
  })
  const totalD = N ? p.delta[N - 1] : 0
  const lapSecs = parseLap(p.contexto.suaMelhor)
  const tRefArr = p.ref_time?.length === N ? p.ref_time : null
  return {
    defs, N, lapSecs, mediaSecs: lapSecs + totalD, totalD,
    pair: projectTrackPair(p.track, p.racing_line, p.track_edges, p.racing_line_b),
    tRef: tRefArr, tMed: tRefArr ? tRefArr.map((v, i) => v + (p.delta[i] || 0)) : null,
    lengthM: p.eixoDist?.length ? p.eixoDist[p.eixoDist.length - 1] : 0,
    hasLineB: !!p.racing_line_b?.x?.length,
    segCorners,
  }
}

export default function Telemetry() {
  const { payload, loading, error } = useSession()
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState('Segments')
  const [mode, setMode] = useState('Time')
  const [camB, setCamB] = useState(false) // lock da câmera: false = sua volta, true = comparação
  const [zoom, setZoom] = useState({ lo: 0, hi: 1 })
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)
  const [segIdx, setSegIdx] = useState<number | null>(null)
  const [showFuel, setShowFuel] = useState(false)

  const model = useMemo(() => (payload ? build(payload) : null), [payload])
  // aba do painel: canais ou pneus (diagrama ao vivo)
  const [panel, setPanel] = useState<'tel' | 'tyres'>('tel')
  // posição das rodas no blueprint: calibrável ao vivo pelo usuário (lib/tyreLayout)
  const [tyLay, setTyLay] = useState(getTyreLayout())
  useEffect(() => onTyreLayout(setTyLay), [])
  const [tyCal, setTyCal] = useState(false)
  // ordem/visibilidade dos canais (painel "Canais"; persistem no navegador)
  const [chPrefs, setChPrefsState] = useState(getChannelPrefs())
  useEffect(() => onChannelPrefs(setChPrefsState), [])
  const [chCfg, setChCfg] = useState(false)
  // tempo médio das voltas limpas (título do carro "Média" no diagrama Tyres)
  const mediaSecs = useMemo(() => {
    const clean = (payload?.laps || []).filter(l => l.clean)
    return clean.length ? clean.reduce((a, l) => a + l.t, 0) / clean.length : null
  }, [payload])
  // refs imperativos (a animação não passa pelo render do React)
  const tRef = useRef(0), raf = useRef(0), selecting = useRef(false)
  const zoomRef = useRef(zoom); zoomRef.current = zoom
  const modeRef = useRef(mode); modeRef.current = mode
  const modelRef = useRef<Model | null>(model); modelRef.current = model
  const payloadRef = useRef<Payload | null>(payload); payloadRef.current = payload
  const trackRef = useRef<TrackHandle>(null)
  const stackRef = useRef<HTMLDivElement>(null), barRef = useRef<HTMLDivElement>(null)
  const podA = useRef<HTMLDivElement>(null), podB = useRef<HTMLDivElement>(null)
  const mmDot = useRef<SVGCircleElement | null>(null)
  const fillRef = useRef<HTMLDivElement>(null), knobRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef<HTMLElement>(null), deltaRef = useRef<HTMLElement>(null), gapRef = useRef<HTMLElement>(null)
  const barW = useRef(0), lastText = useRef(0)

  interface RowCache {
    kind: string; w: number; h: number; main: number[]; ghost: number[] | null; hasGhost: boolean; vis: boolean
    fm: (i: number) => string | number; fg: (i: number) => string | number
    cursor: HTMLElement | null; bub: HTMLElement | null; bubg: HTMLElement | null
    val: HTMLElement | null; ghostEl: HTMLElement | null
  }
  interface PodEls { s: Channels; els: Record<string, HTMLElement | null> }
  interface TyreEls {
    src: 'ref' | 'media'
    k: 'lf' | 'rf' | 'lr' | 'rr'
    bands: Array<{ b: 'o' | 'm' | 'i'; val: HTMLElement | null; fill: HTMLElement | null }>
    press: HTMLElement | null
  }
  const rows = useRef<RowCache[]>([])
  const pods = useRef<PodEls[]>([])
  const tyEls = useRef<TyreEls[]>([])
  const tyRef = useRef<HTMLDivElement>(null)
  // rampa térmica p/ a banda do pneu: 40°C azul → ~85°C verde → 130°C+ vermelho
  const tempBg = (c: number | null | undefined): string => {
    if (c == null || !isFinite(c)) return 'rgba(255,255,255,.04)'
    const t = Math.max(0, Math.min(1, (c - 40) / 90))
    return `hsla(${(210 - 210 * t).toFixed(0)},75%,42%,.62)`
  }
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f
  const invTime = (tau: number, arr: number[]) => {
    const n = arr.length
    if (tau <= arr[0]) return 0
    if (tau >= arr[n - 1]) return 1
    let lo = 0, hi = n - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid] <= tau) lo = mid; else hi = mid }
    return (lo + (tau - arr[lo]) / ((arr[hi] - arr[lo]) || 1)) / (n - 1)
  }
  // valor do array (ex.: tempo da volta) na fração de distância t, interpolado
  const sampleAt = (arr: number[], t: number) => {
    const f = Math.max(0, Math.min(arr.length - 1, t * (arr.length - 1)))
    const i = Math.floor(f), j = Math.min(arr.length - 1, i + 1)
    return arr[i] + (arr[j] - arr[i]) * (f - i)
  }

  const renderFrame = useCallback((tv: number, force = false) => {
    const m = modelRef.current, p = payloadRef.current; if (!m || !p) return
    const z = zoomRef.current, span = z.hi - z.lo, N = m.N
    const f = Math.max(0, Math.min(N - 1, tv * (N - 1)))
    const i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), fr = f - i0
    const idx = fr < 0.5 ? i0 : i1
    trackRef.current?.setT(tv, p.ref.brake[idx] > 18)
    // FANTASMA (média): Distance = mesmo ponto; Time = mesmo instante (gap real)
    let gapM: number | null = null
    if (m.tRef && m.tMed) {
      const tau = lerp(m.tRef[i0], m.tRef[i1], fr)
      const dB = invTime(tau, m.tMed)
      gapM = (tv - dB) * m.lengthM
      trackRef.current?.setT2(modeRef.current === 'Time' ? dB : tv)
    } else trackRef.current?.setT2(m.hasLineB ? tv : null)
    // ponto do carro no minimapa
    const dot = mmDot.current
    if (dot) {
      const pts = m.pair.racing.pts, n = pts.length
      if (n > 1) {
        const ff = (((tv % 1) + 1) % 1) * (n - 1), ii = Math.floor(ff), ffr = ff - ii, ii1 = Math.min(n - 1, ii + 1)
        dot.setAttribute('cx', (pts[ii].x + (pts[ii1].x - pts[ii].x) * ffr).toFixed(1))
        dot.setAttribute('cy', (pts[ii].y + (pts[ii1].y - pts[ii].y) * ffr).toFixed(1))
      }
    }
    // —— todo frame: SÓ transform (cursor + bolhas de valor)
    const xf = (tv - z.lo) / span, inView = xf >= 0 && xf <= 1
    for (const r of rows.current) {
      const x = xf * r.w
      if (r.vis !== inView) { r.vis = inView; const d = inView ? '' : 'none'; if (r.cursor) r.cursor.style.display = d; if (r.bub) r.bub.style.display = d; if (r.bubg) r.bubg.style.display = d }
      if (!inView) continue
      if (r.cursor) r.cursor.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`
      if (r.bub) { const y = (1 - lerp(r.main[i0], r.main[i1], fr)) * r.h; r.bub.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(10px,-50%)` }
      if (r.bubg && r.ghost) { const yg = (1 - lerp(r.ghost[i0], r.ghost[i1], fr)) * r.h; r.bubg.style.transform = `translate3d(${x.toFixed(2)}px,${yg.toFixed(2)}px,0) translate(10px,-50%)` }
    }
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${tv.toFixed(5)})`
    if (knobRef.current) knobRef.current.style.transform = `translate3d(${(tv * barW.current).toFixed(2)}px,0,0) translateX(-50%)`
    // volante + anel + BARRAS dos pods: todo frame (transform barato — fluidez do card)
    for (const pod of pods.current) {
      const s = pod.s, st = s.steer[idx] || 0
      const w = pod.els.wheel
      if (w) w.style.transform = `rotate(${(-st).toFixed(1)}deg)`
      const arc = pod.els.steerarc
      if (arc) {
        const len = Math.min(38, Math.abs(st) / 144 * 38)
        arc.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${(100 - len).toFixed(1)}`)
        arc.setAttribute('transform', st > 0 ? 'translate(32 0) scale(-1 1) rotate(-90 16 16)' : 'rotate(-90 16 16)')
      }
      const thr = lerp(s.throttle[i0] || 0, s.throttle[i1] || 0, fr), brk = lerp(s.brake[i0] || 0, s.brake[i1] || 0, fr)
      if (pod.els.thrbar) pod.els.thrbar.style.transform = `scaleX(${Math.min(1, thr / 100).toFixed(3)})`
      if (pod.els.brkbar) pod.els.brkbar.style.transform = `scaleX(${Math.min(1, brk / 100).toFixed(3)})`
    }
    // —— textos a ~15 Hz
    const now = performance.now()
    if (!force && now - lastText.current < 66) return
    lastText.current = now
    for (const r of rows.current) {
      if (r.val) r.val.textContent = String(r.fm(idx))
      if (r.ghostEl) r.ghostEl.textContent = r.hasGhost ? String(r.fg(idx)) : ''
    }
    for (const pod of pods.current) {
      const e = pod.els, s = pod.s
      if (e.thr) e.thr.textContent = Math.round(s.throttle[idx] || 0) + '%'
      if (e.brk) e.brk.textContent = Math.round(s.brake[idx] || 0) + '%'
      if (e.spd) e.spd.textContent = String(Math.round(s.speed[idx] || 0))
      if (e.gear) e.gear.textContent = String(Math.round(s.gear[idx] || 0))
      if (e.rpm) e.rpm.textContent = String(Math.round(s.rpm[idx] || 0))
    }
    // pneus ao vivo (aba Tyres): os DOIS carros (melhor e média) ao mesmo tempo
    if (tyEls.current.length && p.tyres) {
      for (const we of tyEls.current) {
        const w = p.tyres[we.src]?.[we.k]; if (!w) continue
        for (const bd of we.bands) {
          const v = w[bd.b]?.[idx]
          if (bd.val) bd.val.textContent = v != null && isFinite(v) ? String(Math.round(v)) : '—'
          if (bd.fill) bd.fill.style.fill = tempBg(v) // rect SVG do blueprint
        }
        const pv = w.p?.[idx]
        if (we.press) we.press.textContent = pv != null && isFinite(pv) ? String(Math.round(pv)) : '—'
      }
    }
    if (clockRef.current) clockRef.current.textContent = fmtClock(m.tRef ? sampleAt(m.tRef, tv) : tv * m.lapSecs)
    const dv = lerp(p.delta[i0], p.delta[i1], fr)
    if (deltaRef.current) {
      deltaRef.current.textContent = sign(dv, 3)
      const cls = 'num ' + (dv >= 0 ? 'redt' : 'green')
      if (deltaRef.current.className !== cls) deltaRef.current.className = cls
    }
    if (gapRef.current) gapRef.current.textContent = gapM == null ? '—' : (gapM >= 0 ? '+' : '−') + Math.abs(gapM).toFixed(0) + ' m'
  }, [])

  // (re)constrói caches e mede após CADA render (pré-paint)
  useLayoutEffect(() => {
    const m = model, stack = stackRef.current
    rows.current = (m && stack) ? viewDefs.flatMap(d => {
      const row = stack.querySelector(`.pw-ch[data-kind="${d.kind}"]`) as HTMLElement | null
      if (!row) return []
      return [{
        kind: d.kind, w: row.clientWidth, h: row.clientHeight, main: d.main, ghost: d.ghost, hasGhost: !!d.ghost, vis: true, fm: d.fm, fg: d.fg,
        cursor: row.querySelector('[data-cursor]') as HTMLElement | null,
        bub: row.querySelector('[data-bub]') as HTMLElement | null,
        bubg: row.querySelector('[data-bubg]') as HTMLElement | null,
        val: row.querySelector('[data-val]') as HTMLElement | null,
        ghostEl: row.querySelector('[data-ghost]') as HTMLElement | null,
      }]
    }) : []
    const p = payload
    const podOf = (el: HTMLDivElement | null, s?: Channels): PodEls[] => {
      if (!el || !s) return []
      const q = (k: string) => el.querySelector(`[data-f="${k}"]`) as HTMLElement | null
      return [{ s, els: { thr: q('thr'), thrbar: q('thrbar'), brk: q('brk'), brkbar: q('brkbar'), spd: q('spd'), gear: q('gear'), rpm: q('rpm'), wheel: q('wheel'), steerarc: q('steerarc') } }]
    }
    pods.current = [...podOf(podA.current, p?.ref), ...podOf(podB.current, p?.media)]
    // cache dos elementos do diagrama de pneus (quando a aba Tyres está montada)
    const tyRoot = tyRef.current
    tyEls.current = tyRoot ? (['ref', 'media'] as const).flatMap(src =>
      (['lf', 'rf', 'lr', 'rr'] as const).map(k => ({
        src, k,
        bands: (['o', 'm', 'i'] as const).map(b => ({
          b,
          val: tyRoot.querySelector(`[data-ty="${src}-${k}-${b}"]`) as HTMLElement | null,
          fill: tyRoot.querySelector(`[data-tyb="${src}-${k}-${b}"]`) as HTMLElement | null,
        })),
        press: tyRoot.querySelector(`[data-typ="${src}-${k}"]`) as HTMLElement | null,
      }))) : []
    if (barRef.current) barW.current = barRef.current.clientWidth
    renderFrame(tRef.current, true)
  })
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const stack = stackRef.current
      for (const r of rows.current) {
        const row = stack?.querySelector(`.pw-ch[data-kind="${r.kind}"]`) as HTMLElement | null
        if (row) { r.w = row.clientWidth; r.h = row.clientHeight }
      }
      if (barRef.current) barW.current = barRef.current.clientWidth
      renderFrame(tRef.current, true)
    })
    if (stackRef.current) ro.observe(stackRef.current)
    if (barRef.current) ro.observe(barRef.current)
    return () => ro.disconnect()
  }, [model, renderFrame])

  // playback em TEMPO REAL, imperativo
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now
      const mm = modelRef.current
      let nt: number
      if (mm?.tRef && mm.tRef.length > 1) {
        // avança em TEMPO real da volta e converte p/ distância (o carro freia de
        // verdade nas curvas — antes andava na velocidade média, linear em distância)
        const total = mm.tRef[mm.tRef.length - 1]
        let tau = sampleAt(mm.tRef, tRef.current) + dt
        if (tau >= total) tau -= total
        nt = invTime(tau, mm.tRef)
      } else { nt = tRef.current + dt / (mm?.lapSecs || 90); if (nt >= 1) nt -= 1 }
      tRef.current = nt; renderFrame(nt); raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, renderFrame])

  // trecho pendente vindo de outra tela (clique no minimapa da Lap)
  useEffect(() => {
    if (!model) return
    const fcs = takePendingFocus()
    if (fcs) { setPlaying(false); setZoom({ lo: fcs.lo, hi: fcs.hi }); tRef.current = fcs.t; renderFrame(fcs.t, true) }
  }, [model, renderFrame])

  // zoom com a roda sobre a pilha de canais
  useEffect(() => {
    const el = stackRef.current; if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); const r = el.getBoundingClientRect(); const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
      setZoom(zz => { const sp = zz.hi - zz.lo; const center = zz.lo + fx * sp; const ns = Math.max(0.06, Math.min(1, sp * (e.deltaY < 0 ? 1 / 1.25 : 1.25))); let lo = center - ns * fx, hi = lo + ns; if (lo < 0) { lo = 0; hi = ns } if (hi > 1) { hi = 1; lo = 1 - ns } return { lo, hi } })
    }
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel)
  }, [model])

  const scrub = useCallback((v: number) => { setPlaying(false); tRef.current = Math.max(0, Math.min(1, v)); renderFrame(tRef.current, true) }, [renderFrame])
  const startDragBar = useCallback((e: RPointerEvent) => {
    const el = barRef.current; if (!el) return
    const set = (cx: number) => { const r = el.getBoundingClientRect(); scrub((cx - r.left) / r.width) }
    set(e.clientX); const mv = (ev: PointerEvent) => set(ev.clientX); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }, [scrub])

  // arrastar sobre um canal recorta (zoom); clique simples posiciona o cursor
  const startSelect = useCallback((e: RPointerEvent) => {
    const el = e.currentTarget as HTMLElement; const z = zoomRef.current, sp = z.hi - z.lo
    const frac = (cx: number) => { const r = el.getBoundingClientRect(); return z.lo + Math.max(0, Math.min(1, (cx - r.left) / r.width)) * sp }
    const a = frac(e.clientX); let b = a, moved = false; selecting.current = true; setSel({ a, b })
    const mv = (ev: PointerEvent) => { b = frac(ev.clientX); if (Math.abs(b - a) > 0.004) moved = true; setSel({ a, b }) }
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); selecting.current = false; setSel(null)
      if (moved && Math.abs(b - a) > 0.012) { setZoom({ lo: Math.min(a, b), hi: Math.max(a, b) }); setPlaying(false); setSegIdx(null) }
      else { setPlaying(false); tRef.current = a; renderFrame(a, true) }
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }, [renderFrame])
  const hover = useCallback((e: RPointerEvent) => {
    if (selecting.current || playing) return
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect(), z = zoomRef.current
    tRef.current = z.lo + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (z.hi - z.lo); renderFrame(tRef.current, true)
  }, [playing, renderFrame])

  // navegador de segmentos (‹ All/Tn/Sn ›): recorta os gráficos no trecho
  const segList = useMemo(() => {
    if (!model || !payload) return []
    if (view === 'Segments') return model.segCorners.map(c => ({ label: 'T' + c.n, lo: Math.max(0, c.apex - 0.05), hi: Math.min(1, c.apex + 0.045), t: c.apex, d: c.d }))
    const st = payload.sectorTimes, sets = payload.setores || []
    return (st?.labels || []).map((lb, i) => ({ label: lb, lo: sets[i] ?? 0, hi: sets[i + 1] ?? 1, t: sets[i] ?? 0, d: (st.media[i] || 0) - (st.ref[i] || 0) }))
  }, [model, payload, view])
  const applySeg = useCallback((ni: number | null) => {
    setSegIdx(ni); setPlaying(false)
    if (ni == null) { setZoom({ lo: 0, hi: 1 }); return }
    const s = segList[ni]; if (!s) return
    setZoom({ lo: s.lo, hi: s.hi }); tRef.current = s.t; renderFrame(s.t, true)
  }, [segList, renderFrame])
  const stepSeg = (dir: 1 | -1) => {
    const n = segList.length; if (!n) return
    let ni: number | null
    if (segIdx == null) ni = dir > 0 ? 0 : n - 1
    else { const x = segIdx + dir; ni = x < 0 || x >= n ? null : x }
    applySeg(ni)
  }

  // canais VISÍVEIS na ordem das preferências do usuário (painel "Canais")
  const viewDefs = useMemo(() => {
    if (!model) return []
    const pos = (k: string) => { const i = chPrefs.order.indexOf(k); return i < 0 ? 999 : i }
    return model.defs.filter(d => !chPrefs.hidden.includes(d.kind)).sort((a, b) => pos(a.kind) - pos(b.kind))
  }, [model, chPrefs])

  // janela de zoom: paths RE-AMOSTRADOS (viewBox fixo ⇒ sem distorção/serrilhado)
  const charts = useMemo(() => {
    if (!model) return []
    const { lo, hi } = zoom, span = hi - lo, N = model.N
    const a0 = Math.max(0, Math.floor(lo * (N - 1)) - 1), a1 = Math.min(N - 1, Math.ceil(hi * (N - 1)) + 1)
    const X = (gi: number) => ((gi / (N - 1)) - lo) / span * W
    const line = (arr: number[]) => { let d = ''; for (let i = a0; i <= a1; i++) d += (i === a0 ? 'M' : 'L') + X(i).toFixed(1) + ',' + ((1 - arr[i]) * H).toFixed(1); return d }
    const step = (arr: number[]) => { let d = ''; for (let i = a0; i <= a1; i++) { const y = ((1 - arr[i]) * H).toFixed(1); d += (i === a0 ? 'M' : 'L') + X(i).toFixed(1) + ',' + y; if (i < a1) d += ' L' + X(i + 1).toFixed(1) + ',' + y } return d }
    return viewDefs.map(d => {
      const fn = d.step ? step : line
      const ln = fn(d.main)
      return { line: ln, gline: d.ghost ? fn(d.ghost) : '', area: ln + ` L${X(a1).toFixed(1)},${H} L${X(a0).toFixed(1)},${H} Z` }
    })
  }, [model, viewDefs, zoom])

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Carregando sessão…</div>
  if (error || !model || !payload) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'Sem dados'}</div>

  const m = model, ctx = payload.contexto
  const t0 = tRef.current
  const sectors = (payload.setores || []).filter(s => s > 0.001 && s < 0.999)
  // marcas verticais dos gráficos/scrubber seguem o toggle: curvas (Segments) ou setores
  const marks = view === 'Segments'
    ? m.segCorners.map(c => c.apex).filter(s => s > 0.001 && s < 0.999)
    : sectors
  const span = zoom.hi - zoom.lo
  const zoomed = zoom.lo > 0.001 || zoom.hi < 0.999
  const seg = segIdx != null ? segList[segIdx] : null
  const fuel = (payload.laps || []).filter(l => l.fuel != null && !l.pit)
  const fuelPorVolta = fuel.length ? fuel.reduce((a, l) => a + (l.fuel || 0), 0) / fuel.length : null
  const replaySeg = () => { tRef.current = seg ? seg.lo : 0; renderFrame(tRef.current, true); setPlaying(true) }

  return createPortal(
    <div className="pw-maplayer pw-tel">
      <InteractiveTrack ref={trackRef} trackGeom={m.pair.track} racingGeom={m.pair.racing} racingGeomB={m.pair.racingB}
        edges={m.pair.edges} unitPerM={m.pair.unitPerM} initialT={t0} corners={payload.corners}
        hideCorners follow followX={0.22} followCar={camB ? 'B' : 'A'} initialZoom={16} zoomSlider height={440}>

        {/* COLUNA ESQUERDA */}
        <div className="pw-leftcol">
          <div className="pw-carinfo">
            <div className="row center gap10">
              <span className="cbadge" style={{ width: 36, height: 36 }}><Icon n="car" s={18} /></span>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 16.5 }}>{ctx.carro}</b>
            </div>
            <div className="pw-carmeta">
              <span>{ctx.pista}</span>
              <span><Icon n="clock" s={12} sw={2} /> {ctx.suaMelhor}</span>
              <span><Icon n="road" s={12} sw={2} /> {ctx.voltasGravadas} voltas</span>
              <span><Icon n="telem" s={12} sw={2} /> {ctx.voltasLimpas} limpas</span>
            </div>
          </div>
          <SlideSeg options={['Segments', 'Sectors']} value={view} onChange={(v) => { setView(v); setSegIdx(null) }} />
          <div className="pw-rail pw-glass2">
            <button title="Voltar à largada" onClick={() => { setPlaying(false); tRef.current = 0; renderFrame(0, true) }}><Icon n="flag" s={15} /></button>
            <button title="Reset zoom dos gráficos" onClick={() => applySeg(null)}><Icon n="sliders" s={15} /></button>
            <button title="Combustível" onClick={() => setShowFuel(s => !s)}><Icon n="fuel" s={15} /></button>
          </div>
          {showFuel && (
            <div className="pw-fuelchip pw-glass2">
              <Icon n="fuel" s={13} /> {fuelPorVolta != null ? <>{fuelPorVolta.toFixed(2)} L/volta{ctx.fuelFim != null ? ` · ~${Math.floor(ctx.fuelFim / fuelPorVolta)} voltas restantes` : ''}</> : 'sem dados de combustível'}
            </div>
          )}
          {/* navegador de segmentos + tempos A/B */}
          <div className="pw-segnav pw-glass2">
            <div className="row center" style={{ gap: 8 }}>
              <button className="pw-nav" onClick={() => stepSeg(-1)} aria-label="Anterior"><Icon n="chevL" s={13} /></button>
              <b className="pw-seglabel">{seg ? seg.label : 'All'}</b>
              <b className={'num ' + ((seg ? seg.d : m.totalD) >= 0 ? 'redt' : 'green')} style={{ fontSize: 12.5 }}>{sign(seg ? seg.d : m.totalD)}</b>
              <button className="pw-nav" onClick={() => stepSeg(1)} aria-label="Próximo" style={{ marginLeft: 'auto' }}><Icon n="chevR" s={13} /></button>
            </div>
            <div className="pw-segrows">
              <div className="row between"><span style={{ color: 'var(--accent)', fontWeight: 600 }}>Sua melhor <Icon n="info" s={11} sw={2} /></span><b className="num">{ctx.suaMelhor}</b></div>
              <div className="row between"><span className="purple" style={{ fontWeight: 600 }}>{ctx.referencia} <Icon n="info" s={11} sw={2} /></span><b className="num purple">{fmtClock(m.mediaSecs)}</b></div>
            </div>
          </div>
        </div>

        {/* PODS ao vivo */}
        <div className="pw-pods">
          <DriverPod podRef={podA} on name="Sua melhor" time={ctx.suaMelhor} sub="ref" />
          <DriverPod podRef={podB} name={ctx.referencia} time={fmtClock(m.mediaSecs)} sub="média" />
        </div>

        {/* minimapa na área visível do mapa */}
        <MiniTrackMap className="pw-minimap pw-mm-tel" pair={m.pair} corners={[]} onPick={() => { }}
          carDotRef={el => { mmDot.current = el }} />

        {/* PAINEL DE CANAIS (vidro, direita) com player embutido */}
        <div className="pw-telpanel pw-glass2">
          <div className="pw-telhead">
            <div className="utabs" style={{ border: 0, gap: 18 }}>
              <button className={panel === 'tel' ? 'on' : ''} onClick={() => setPanel('tel')}>Telemetry</button>
              <button className={panel === 'tyres' ? 'on' : ''} onClick={() => setPanel('tyres')}
                disabled={!payload.tyres?.ref} title={payload.tyres?.ref ? undefined : 'Este carro não grava canais de pneu'}>Tyres</button>
            </div>
            <div className="row center gap8" style={{ color: 'var(--ink-3)' }}>
              {panel === 'tel' && zoomed && <button className="chip" style={{ padding: '3px 9px' }} onClick={() => applySeg(null)}><Icon n="refresh" s={11} /> Reset zoom</button>}
              {panel === 'tel' && (
                <button className={'chip pw-chcfgbtn' + (chCfg ? ' on' : '')} style={{ padding: '3px 9px' }}
                  onClick={() => setChCfg(v => !v)} title="Mostrar/ocultar e reordenar canais">
                  <Icon n="sliders" s={11} /> Canais
                </button>
              )}
              <span className="tp-leg"><span className="dot acc" />Melhor</span>
              <span className="tp-leg"><span className="tp-dash" />Média</span>
            </div>
          </div>
          {chCfg && panel === 'tel' && (
            <div className="pw-chcfg pw-glass2">
              <div className="pw-tycal-head">
                <span>CANAIS</span>
                <button className="pw-set-x" onClick={() => setChCfg(false)} aria-label="Fechar"><Icon n="x" s={13} /></button>
              </div>
              {[...m.defs].sort((a, b) => chPrefs.order.indexOf(a.kind) - chPrefs.order.indexOf(b.kind)).map((d, i, arr) => {
                const hidden = chPrefs.hidden.includes(d.kind)
                const lastVisible = !hidden && arr.length - chPrefs.hidden.length <= 1
                return (
                  <div className={'pw-chcfg-row' + (hidden ? ' off' : '')} key={d.kind}>
                    <button className="mv" onClick={() => moveChannel(d.kind, -1)} disabled={i === 0} aria-label="Subir"><Icon n="chevD" s={11} sw={2.4} /></button>
                    <button className="mv dn" onClick={() => moveChannel(d.kind, 1)} disabled={i === arr.length - 1} aria-label="Descer"><Icon n="chevD" s={11} sw={2.4} /></button>
                    <span className="nm" style={{ color: d.color }}>{d.name}</span>
                    <button className={'pw-switch' + (!hidden ? ' on' : '')} onClick={() => toggleChannel(d.kind)}
                      disabled={lastVisible} title={lastVisible ? 'Pelo menos um canal visível' : (hidden ? 'Mostrar' : 'Ocultar')} aria-label="Visível"><i /></button>
                  </div>
                )
              })}
              <div className="pw-tycal-foot">
                <button className="pw-set-reset" onClick={resetChannelPrefs}
                  disabled={chPrefs.hidden.length === 0 && chPrefs.order.join() === CHANNEL_ORDER.join()}>Padrão</button>
                <span className="pw-set-note">Ordem e visibilidade · salvo neste navegador</span>
              </div>
            </div>
          )}
          {panel === 'tyres' && payload.tyres?.ref ? (
            <div className="pw-tyres2" ref={tyRef}>
              {(['ref', 'media'] as const).map(src => {
                // caixas das rodas derivadas do layout calibrável (lib/tyreLayout)
                const L = tyLay, BW = (L.w - 3) / 3
                const box = (k: 'lf' | 'rf' | 'lr' | 'rr') => ({
                  x: (k[0] === 'l' ? TYRE_CX - (k[1] === 'f' ? L.trackF : L.trackR) : TYRE_CX + (k[1] === 'f' ? L.trackF : L.trackR)) - L.w / 2,
                  y: (k[1] === 'f' ? L.yF : L.yR) - L.h / 2,
                })
                const wheel = (k: 'lf' | 'rf' | 'lr' | 'rr') => {
                  const wb = box(k), left = k[0] === 'l'
                  const order = left ? (['o', 'm', 'i'] as const) : (['i', 'm', 'o'] as const)
                  const px = left ? wb.x - 14 : wb.x + L.w + 14
                  return (
                    <g key={k}>
                      {order.map((b, bi) => {
                        const bx = wb.x + bi * (BW + 1.5)
                        return (
                          <g key={b}>
                            <rect data-tyb={`${src}-${k}-${b}`} x={bx} y={wb.y} width={BW} height={L.h} rx={3}
                              fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.12)" strokeWidth="1">
                              <title>{`${k.toUpperCase()} · banda ${b === 'o' ? 'EXTERNA' : b === 'm' ? 'do MEIO' : 'INTERNA'}`}</title>
                            </rect>
                            <text className="pw-tytemps" x={bx + BW / 2} y={wb.y + L.h / 2 + 4.5} textAnchor="middle">
                              <tspan data-ty={`${src}-${k}-${b}`}>—</tspan>
                            </text>
                          </g>
                        )
                      })}
                      <text className="pw-typress2" x={px} y={wb.y + L.h / 2 + 7} textAnchor={left ? 'end' : 'start'}>
                        <tspan data-typ={`${src}-${k}`}>—</tspan> kPa
                      </text>
                    </g>
                  )
                }
                return payload.tyres?.[src] && (
                  <div className="pw-tycarbox" key={src}>
                    <div className="pw-tytitle">
                      {src === 'ref'
                        ? <><span className="dot acc" />Melhor · <b className="num">{ctx.suaMelhor}</b></>
                        : <><span className="tp-dash" />{ctx.referencia}{mediaSecs != null && <> · <b className="num">{fmtClock(mediaSecs)}</b></>}</>}
                    </div>
                    <svg className="pw-tycarsvg" viewBox="48 10 504 580">
                      <g className="pw-tymark" dangerouslySetInnerHTML={{ __html: String((window as any).PORSCHE_MARK || '') }} />
                      {(['lf', 'rf', 'lr', 'rr'] as const).map(k => wheel(k))}
                    </svg>
                  </div>
                )
              })}
              <div className="pw-tylegend">
                <span>Temperatura (°C) por banda — de fora p/ dentro: <b>EXT · MEIO · INT</b> · pressão (kPa) ao lado</span>
                <button className={'chip pw-tycalbtn' + (tyCal ? ' on' : '')} onClick={() => setTyCal(v => !v)}>
                  <Icon n="gear" s={11} /> Ajustar posição
                </button>
              </div>
              {tyCal && (
                <div className="pw-tycal pw-glass2">
                  <div className="pw-tycal-head">
                    <span>POSIÇÃO DAS RODAS</span>
                    <button className="pw-set-x" onClick={() => setTyCal(false)} aria-label="Fechar"><Icon n="x" s={13} /></button>
                  </div>
                  {([
                    { k: 'yF', label: 'Eixo diant. (alt.)', min: 30, max: 180 },
                    { k: 'yR', label: 'Eixo tras. (alt.)', min: 320, max: 500 },
                    { k: 'trackF', label: 'Bitola diant.', min: 50, max: 150 },
                    { k: 'trackR', label: 'Bitola tras.', min: 50, max: 150 },
                    { k: 'w', label: 'Largura roda', min: 28, max: 86 },
                    { k: 'h', label: 'Altura roda', min: 30, max: 96 },
                  ] as Array<{ k: keyof TyreLayout; label: string; min: number; max: number }>).map(r => (
                    <div className="pw-tycal-row" key={r.k}>
                      <label>{r.label}</label>
                      <span className="num">{tyLay[r.k]}</span>
                      <input type="range" min={r.min} max={r.max} step={1} value={tyLay[r.k]}
                        onChange={e => setTyreParam(r.k, Number(e.target.value))} />
                    </div>
                  ))}
                  <div className="pw-tycal-foot">
                    <button className="pw-set-reset" onClick={resetTyreLayout}
                      disabled={(Object.keys(TYRE_DEFAULTS) as Array<keyof TyreLayout>).every(k => tyLay[k] === TYRE_DEFAULTS[k])}>
                      Padrão
                    </button>
                    <span className="pw-set-note">Quando ficar bom, me avisa — eu fixo como padrão</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
          <div className="pw-chstack" ref={stackRef}>
            {viewDefs.map((d, i) => {
              const ch = charts[i]
              return (
                <div className="pw-ch" key={d.kind} data-kind={d.kind} onPointerDown={startSelect} onPointerMove={hover}>
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="tp-svg" style={{ overflow: 'hidden' }}>
                    <defs><linearGradient id={'tpg-' + d.kind} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={d.color} stopOpacity=".30" /><stop offset="1" stopColor={d.color} stopOpacity="0" /></linearGradient></defs>
                    {d.kind !== 'gear' && <path d={ch.area} fill={`url(#tpg-${d.kind})`} />}
                    {ch.gline && <path d={ch.gline} className="pw-ghostline" />}
                    <path d={ch.line} fill="none" stroke={d.color} className="tp-mainline" />
                  </svg>
                  {marks.map((s, si) => { const lp = ((s - zoom.lo) / span) * 100; return (lp >= 0 && lp <= 100) ? <span key={si} style={{ position: 'absolute', top: 0, bottom: 0, left: lp + '%', width: 1, background: 'rgba(255,255,255,.13)', pointerEvents: 'none' }} /> : null })}
                  {sel && (() => { const la = Math.min(sel.a, sel.b), lb = Math.max(sel.a, sel.b); const l = ((la - zoom.lo) / span) * 100, w2 = ((lb - la) / span) * 100; return <span style={{ position: 'absolute', top: 0, bottom: 0, left: l + '%', width: w2 + '%', background: 'var(--accent-soft)', borderLeft: '1px solid var(--accent)', borderRight: '1px solid var(--accent)', pointerEvents: 'none' }} /> })()}
                  <span className="pw-chlabel">{d.name}</span>
                  <span className="pw-axis"><i>{d.axis[0]}</i><i>{d.axis[1]}</i><i>{d.axis[2]}</i></span>
                  <span className="tp-cursor" data-cursor style={{ left: 0, willChange: 'transform' }} />
                  <span className="pw-bub" data-bub style={{ color: d.color }}><b className="num" data-val>—</b></span>
                  {d.ghost && <span className="pw-bub ghost" data-bubg><b className="num" data-ghost>—</b></span>}
                </div>
              )
            })}
          </div>
          )}
          <div className="pw-telscrub">
            <div className="pw-progress" ref={barRef} onPointerDown={startDragBar}>
              <div className="tp-fill" ref={fillRef} style={{ width: '100%', transform: `scaleX(${t0})`, transformOrigin: 'left', willChange: 'transform' }} />
              {marks.map((s, si) => <span key={si} className="tp-tick" style={{ left: s * 100 + '%' }} />)}
              <span className="tp-knob" ref={knobRef} style={{ left: 0, willChange: 'transform' }} />
            </div>
            <div className="pw-telctrl">
              <button className={'tp-play' + (playing ? ' on' : '')} onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg> : <Icon n="play" s={14} fill="currentColor" />}
              </button>
              <b className="num tp-clock" ref={clockRef}>{fmtClock(t0 * m.lapSecs)}</b>
              <button className="pw-replay" title="Replay do trecho" onClick={replaySeg}><Icon n="refresh" s={13} /></button>
              <div className="pw-delta">
                <span className="dim">Delta:</span> <b className="num redt" ref={deltaRef}>+0.000</b>
                <span className="dim">↔</span> <b className="num" ref={gapRef} style={{ color: 'var(--red)' }}>+0 m</b>
              </div>
              <button className={'pw-switch' + (camB ? ' on' : '')} title="Câmera: alternar entre os dois carros" onClick={() => setCamB(v => !v)} aria-label="Alternar câmera"><i /></button>
              <SlideSeg options={['Time', 'Distance']} value={mode} onChange={setMode} />
            </div>
          </div>
        </div>
      </InteractiveTrack>
    </div>,
    document.body
  )
}
