import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import Icon from '../components/Icon'
import SlideSeg from '../components/SlideSeg'
import InteractiveTrack, { type TrackHandle } from '../components/InteractiveTrack'
import { useSession } from '../lib/useSession'
import { projectTrackPair, type TrackPair } from '../lib/track'
import { parseLap, fmtClock } from '../lib/fmt'
import { takePendingFocus } from '../lib/bus'
import type { Payload, Channels } from '../lib/api'

const W = 600, H = 100
const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v))
const linePath = (a: number[]) => a.map((v, i) => (i ? 'L' : 'M') + (i / (a.length - 1) * W).toFixed(1) + ',' + ((1 - v) * H).toFixed(1)).join(' ')
const stepPath = (a: number[]) => { let d = ''; a.forEach((v, i) => { const x0 = i / (a.length - 1) * W, y = (1 - v) * H; d += (i ? `L${x0.toFixed(1)},${y.toFixed(1)}` : `M${x0.toFixed(1)},${y.toFixed(1)}`); if (i < a.length - 1) { const x1 = (i + 1) / (a.length - 1) * W; d += ` L${x1.toFixed(1)},${y.toFixed(1)}` } }); return d }

interface Def {
  kind: string; name: string; color: string; unit: string; step?: boolean
  main: number[]; ghost: number[] | null
  fm: (i: number) => string | number; fg: (i: number) => string | number
  line?: string; gline?: string; area?: string
}
interface Model {
  defs: Def[]; N: number; lapSecs: number; pair: TrackPair
  tRef: number[] | null     // tempo da MELHOR até cada ponto (s)
  tMed: number[] | null     // tempo da MÉDIA até cada ponto (tRef + delta)
  lengthM: number           // comprimento da volta (m)
  hasLineB: boolean
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
    { kind: 'delta', name: 'Delta', color: 'var(--purple)', unit: 's', main: p.delta.map(v => clamp01(0.5 - (v / (2 * dmax)) * 0.9)), ghost: null, fm: i => { const v = p.delta[i]; return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3) }, fg: () => '' },
    { kind: 'speed', name: 'Speed', color: 'var(--cyan)', unit: 'km/h', main: NRM(ref.speed, smin, smax), ghost: NRM(med.speed, smin, smax), fm: i => Math.round(ref.speed[i]), fg: i => Math.round(med.speed[i]) },
    { kind: 'throttle', name: 'Throttle', color: 'var(--accent)', unit: '%', main: N01(ref.throttle), ghost: N01(med.throttle), fm: i => Math.round(ref.throttle[i]), fg: i => Math.round(med.throttle[i]) },
    { kind: 'brake', name: 'Brake', color: 'var(--red)', unit: '%', main: N01(ref.brake), ghost: N01(med.brake), fm: i => Math.round(ref.brake[i]), fg: i => Math.round(med.brake[i]) },
    { kind: 'rpm', name: 'RPM', color: 'var(--amber)', unit: '', main: NRM(ref.rpm, rmin, rmax), ghost: NRM(med.rpm, rmin, rmax), fm: i => (ref.rpm[i] / 1000).toFixed(1) + 'k', fg: i => (med.rpm[i] / 1000).toFixed(1) + 'k' },
    { kind: 'gear', name: 'Gear', color: 'var(--ink)', unit: '', step: true, main: ref.gear.map(v => clamp01(v / maxGear)), ghost: med.gear.map(v => clamp01(v / maxGear)), fm: i => Math.round(ref.gear[i]), fg: i => Math.round(med.gear[i]) },
    { kind: 'steering', name: 'Steering', color: 'var(--ink-2)', unit: '°', main: ref.steer.map(v => clamp01(0.5 + v / (2 * steerMax))), ghost: med.steer.map(v => clamp01(0.5 + v / (2 * steerMax))), fm: i => Math.round(ref.steer[i]), fg: i => Math.round(med.steer[i]) },
  ]
  defs.forEach(d => { const lf = d.step ? stepPath : linePath; d.line = lf(d.main); d.gline = d.ghost ? lf(d.ghost) : ''; d.area = d.line + ' L600,100 L0,100 Z' })
  const tRefArr = p.ref_time?.length === N ? p.ref_time : null
  const tMedArr = tRefArr ? tRefArr.map((v, i) => v + (p.delta[i] || 0)) : null
  return {
    defs, N, lapSecs: parseLap(p.contexto.suaMelhor),
    pair: projectTrackPair(p.track, p.racing_line, p.track_edges, p.racing_line_b),
    tRef: tRefArr, tMed: tMedArr,
    lengthM: p.eixoDist?.length ? p.eixoDist[p.eixoDist.length - 1] : 0,
    hasLineB: !!p.racing_line_b?.x?.length,
  }
}

export default function Telemetry() {
  const { payload, loading, error } = useSession()
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState('Segments')
  const [mode, setMode] = useState('Distance')
  const [zoom, setZoom] = useState({ lo: 0, hi: 1 })
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)

  const model = useMemo(() => (payload ? build(payload) : null), [payload])
  // refs imperativos (a animação não passa pelo render do React)
  const tRef = useRef(0.3), raf = useRef(0), selecting = useRef(false)
  const zoomRef = useRef(zoom); zoomRef.current = zoom
  const modeRef = useRef(mode); modeRef.current = mode
  const modelRef = useRef<Model | null>(model); modelRef.current = model
  const payloadRef = useRef<Payload | null>(payload); payloadRef.current = payload
  const trackRef = useRef<TrackHandle>(null)
  const stackRef = useRef<HTMLDivElement>(null), barRef = useRef<HTMLDivElement>(null)
  const youPod = useRef<HTMLDivElement>(null), refPod = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null), knobRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef<HTMLElement>(null), deltaRef = useRef<HTMLElement>(null)
  const spdRef = useRef<HTMLElement>(null), posRef = useRef<HTMLElement>(null)

  // caches imperativos: elementos resolvidos UMA vez por render (zero querySelector
  // por frame) e tamanhos em px medidos fora do loop (zero leitura de layout por frame)
  interface RowCache {
    kind: string; w: number; h: number; main: number[]; hasGhost: boolean; vis: boolean
    fm: (i: number) => string | number; fg: (i: number) => string | number
    cursor: HTMLElement | null; dot: HTMLElement | null; val: HTMLElement | null; ghost: HTMLElement | null
  }
  interface PodCache { s: Channels; els: Record<string, HTMLElement | null> }
  const rows = useRef<RowCache[]>([])
  const pods = useRef<PodCache[]>([])
  const barW = useRef(0), lastText = useRef(0)
  const gapRef = useRef<HTMLElement>(null)
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f
  // inverte a curva de tempo da média: em que fração da volta ela estava no instante τ
  const invTime = (tau: number, arr: number[]) => {
    const n = arr.length
    if (tau <= arr[0]) return 0
    if (tau >= arr[n - 1]) return 1
    let lo = 0, hi = n - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid] <= tau) lo = mid; else hi = mid }
    return (lo + (tau - arr[lo]) / ((arr[hi] - arr[lo]) || 1)) / (n - 1)
  }

  const renderFrame = useCallback((tv: number, force = false) => {
    const m = modelRef.current, p = payloadRef.current; if (!m || !p) return
    const z = zoomRef.current, span = z.hi - z.lo, N = m.N
    const f = Math.max(0, Math.min(N - 1, tv * (N - 1)))
    const i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), fr = f - i0
    const idx = fr < 0.5 ? i0 : i1
    trackRef.current?.setT(tv, p.ref.brake[idx] > 18)
    // FANTASMA (média): Distance = mesmo ponto da pista (compara linhas);
    // Time = onde a média estava no MESMO instante (gap real na pista)
    let gapM: number | null = null
    if (m.tRef && m.tMed) {
      const tau = lerp(m.tRef[i0], m.tRef[i1], fr)
      const dB = invTime(tau, m.tMed)
      gapM = (tv - dB) * m.lengthM
      const tB = modeRef.current === 'Time' ? dB : tv
      if (!m.hasLineB && modeRef.current !== 'Time') trackRef.current?.setT2(null)
      else trackRef.current?.setT2(tB)
    } else trackRef.current?.setT2(m.hasLineB ? tv : null)
    // —— todo frame: SÓ transform (compositor; sem layout, sem repaint dos gráficos)
    const xf = (tv - z.lo) / span, inView = xf >= 0 && xf <= 1
    for (const r of rows.current) {
      const x = (xf * r.w).toFixed(2)
      if (r.vis !== inView) { r.vis = inView; const d = inView ? '' : 'none'; if (r.cursor) r.cursor.style.display = d; if (r.dot) r.dot.style.display = d }
      if (r.cursor) r.cursor.style.transform = `translate3d(${x}px,0,0)`
      if (r.dot) { const y = ((1 - lerp(r.main[i0], r.main[i1], fr)) * r.h).toFixed(2); r.dot.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)` }
    }
    for (const pod of pods.current) {
      const tb = pod.els.thrbar, bb = pod.els.brkbar
      if (tb) tb.style.transform = `scaleX(${(lerp(pod.s.throttle[i0], pod.s.throttle[i1], fr) / 100).toFixed(4)})`
      if (bb) bb.style.transform = `scaleX(${(lerp(pod.s.brake[i0], pod.s.brake[i1], fr) / 100).toFixed(4)})`
    }
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${tv.toFixed(5)})`
    if (knobRef.current) knobRef.current.style.transform = `translate3d(${(tv * barW.current).toFixed(2)}px,0,0) translateX(-50%)`
    // —— textos mudam DOM/layout: ~10 Hz basta no play (sempre em interação direta)
    const now = performance.now()
    if (!force && now - lastText.current < 100) return
    lastText.current = now
    for (const r of rows.current) {
      if (r.val) r.val.textContent = String(r.fm(idx))
      if (r.ghost) r.ghost.textContent = r.hasGhost ? String(r.fg(idx)) : ''
    }
    const clockTxt = fmtClock(tv * m.lapSecs)
    for (const pod of pods.current) {
      const e = pod.els, s = pod.s
      if (e.thr) e.thr.textContent = Math.round(s.throttle[idx]) + '%'
      if (e.spd) e.spd.textContent = String(Math.round(s.speed[idx]))
      if (e.gear) e.gear.textContent = String(Math.round(s.gear[idx]))
      if (e.rpm) e.rpm.textContent = String(Math.round(s.rpm[idx]))
      if (e.time) e.time.textContent = clockTxt
    }
    if (clockRef.current) clockRef.current.textContent = clockTxt
    const dv = p.delta[idx]
    if (deltaRef.current) {
      deltaRef.current.textContent = (dv >= 0 ? '+' : '−') + Math.abs(dv).toFixed(3)
      const cls = 'num ' + (dv >= 0 ? 'redt' : 'green')
      if (deltaRef.current.className !== cls) deltaRef.current.className = cls
    }
    if (spdRef.current) spdRef.current.textContent = String(Math.round(p.ref.speed[idx]))
    if (posRef.current) posRef.current.textContent = Math.round(tv * 100) + '%'
    if (gapRef.current) gapRef.current.textContent = gapM == null ? '—' : (gapM >= 0 ? '+' : '−') + Math.abs(gapM).toFixed(0)
  }, [])

  // (re)constrói os caches e mede tamanhos após CADA render; roda antes do paint
  // (useLayoutEffect) pra ressincronizar o DOM imperativo sem flash
  useLayoutEffect(() => {
    const m = model, stack = stackRef.current
    rows.current = (m && stack) ? m.defs.flatMap(d => {
      const row = stack.querySelector(`.tp-chan[data-kind="${d.kind}"]`) as HTMLElement | null
      const plot = row?.querySelector('.tp-plot') as HTMLElement | null
      if (!row || !plot) return []
      return [{
        kind: d.kind, w: plot.clientWidth, h: plot.clientHeight, main: d.main, hasGhost: !!d.ghost, vis: true, fm: d.fm, fg: d.fg,
        cursor: row.querySelector('[data-cursor]') as HTMLElement | null, dot: row.querySelector('[data-dot]') as HTMLElement | null,
        val: row.querySelector('[data-val]') as HTMLElement | null, ghost: row.querySelector('[data-ghost]') as HTMLElement | null,
      }]
    }) : []
    const podOf = (el: HTMLDivElement | null, s?: Channels): PodCache[] => {
      if (!el || !s) return []
      const q = (f: string) => el.querySelector(`[data-f="${f}"]`) as HTMLElement | null
      return [{ s, els: { thr: q('thr'), thrbar: q('thrbar'), brkbar: q('brkbar'), spd: q('spd'), gear: q('gear'), rpm: q('rpm'), time: q('time') } }]
    }
    pods.current = [...podOf(youPod.current, payload?.ref), ...podOf(refPod.current, payload?.media)]
    if (barRef.current) barW.current = barRef.current.clientWidth
    renderFrame(tRef.current, true)
  })

  // re-mede em resize (enquanto toca não há re-render que atualize os caches)
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const stack = stackRef.current
      for (const r of rows.current) {
        const plot = stack?.querySelector(`.tp-chan[data-kind="${r.kind}"] .tp-plot`) as HTMLElement | null
        if (plot) { r.w = plot.clientWidth; r.h = plot.clientHeight }
      }
      if (barRef.current) barW.current = barRef.current.clientWidth
      renderFrame(tRef.current, true)
    })
    if (stackRef.current) ro.observe(stackRef.current)
    if (barRef.current) ro.observe(barRef.current)
    return () => ro.disconnect()
  }, [model, renderFrame])

  // playback em TEMPO REAL, imperativo (sem setState por frame)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const loop = (now: number) => { const dt = (now - last) / 1000; last = now; let nt = tRef.current + dt / (modelRef.current?.lapSecs || 90); if (nt >= 1) nt -= 1; tRef.current = nt; renderFrame(nt); raf.current = requestAnimationFrame(loop) }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, renderFrame])

  // trecho pendente vindo de outra tela (ex.: clique no minimapa da Lap Analysis)
  useEffect(() => {
    if (!model) return
    const fcs = takePendingFocus()
    if (fcs) { setPlaying(false); setZoom({ lo: fcs.lo, hi: fcs.hi }); tRef.current = fcs.t; renderFrame(fcs.t, true) }
  }, [model, renderFrame])

  // zoom com a roda sobre o stack
  useEffect(() => {
    const el = stackRef.current; if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); const r = el.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
      setZoom(z => { const sp = z.hi - z.lo; const center = z.lo + f * sp; const ns = Math.max(0.06, Math.min(1, sp * (e.deltaY < 0 ? 1 / 1.25 : 1.25))); let lo = center - ns * f, hi = lo + ns; if (lo < 0) { lo = 0; hi = ns } if (hi > 1) { hi = 1; lo = 1 - ns } return { lo, hi } })
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

  // arrastar sobre um gráfico recorta (zoom); clique simples posiciona o cursor
  const startSelect = useCallback((e: RPointerEvent) => {
    const el = e.currentTarget as HTMLElement; const z = zoomRef.current, sp = z.hi - z.lo
    const frac = (cx: number) => { const r = el.getBoundingClientRect(); return z.lo + Math.max(0, Math.min(1, (cx - r.left) / r.width)) * sp }
    const a = frac(e.clientX); let b = a, moved = false; selecting.current = true; setSel({ a, b })
    const mv = (ev: PointerEvent) => { b = frac(ev.clientX); if (Math.abs(b - a) > 0.004) moved = true; setSel({ a, b }) }
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); selecting.current = false; setSel(null)
      if (moved && Math.abs(b - a) > 0.012) { setZoom({ lo: Math.min(a, b), hi: Math.max(a, b) }); setPlaying(false) }
      else { setPlaying(false); tRef.current = a; renderFrame(a, true) }
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }, [renderFrame])
  const hover = useCallback((e: RPointerEvent) => {
    if (selecting.current || playing) return
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect(), z = zoomRef.current
    tRef.current = z.lo + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (z.hi - z.lo); renderFrame(tRef.current, true)
  }, [playing, renderFrame])

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Carregando sessão…</div>
  if (error || !model || !payload) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'Sem dados'}</div>

  const { defs, pair } = model
  const t0 = tRef.current, idx0 = Math.min(model.N - 1, Math.round(t0 * (model.N - 1)))
  const ctx = payload.contexto
  const sectors = (payload.setores || []).filter(s => s > 0.001 && s < 0.999)
  const span = zoom.hi - zoom.lo
  const zoomed = zoom.lo > 0.001 || zoom.hi < 0.999

  const Pod = ({ podRef, you, name, danger, s }: { podRef: React.RefObject<HTMLDivElement | null>; you?: boolean; name: string; danger?: boolean; s: Channels }) => (
    <div className={'dpod' + (you ? ' you' : '')} ref={podRef}>
      <span className="cbadge" style={{ width: 40, height: 40 }}><Icon n="wheel" s={19} /></span>
      <div className="grow">
        <div className="dpod-top"><b style={you ? { color: 'var(--accent)' } : undefined}>{name}</b>
          <div className="dpod-meta"><span className="num"><Icon n="clock" s={12} sw={2} /> <span data-f="time">{fmtClock(t0 * model.lapSecs)}</span></span></div></div>
        <div className="dpod-bars">
          <span className="num thr" data-f="thr">{Math.round(s.throttle[idx0])}%</span>
          <div className="tbbar"><i className="t" data-f="thrbar" style={{ transform: `scaleX(${Math.min(1, s.throttle[idx0] / 100)})`, transformOrigin: 'left', willChange: 'transform' }} /></div>
          <div className="tbbar"><i className="b" data-f="brkbar" style={{ transform: `scaleX(${Math.min(1, s.brake[idx0] / 100)})`, transformOrigin: 'left', willChange: 'transform', background: danger ? 'var(--red)' : undefined }} /></div>
          <span className="num spd"><span data-f="spd">{Math.round(s.speed[idx0])}</span><i> km/h</i></span>
          <span className="num gr">|H| <span data-f="gear">{Math.round(s.gear[idx0])}</span></span>
          <span className="num rp">RPM <span data-f="rpm">{Math.round(s.rpm[idx0])}</span></span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="tp-wrap">
      <div className="row resp" style={{ gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div className="card pad" style={{ flex: '1 1 280px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="cbadge" style={{ width: 46, height: 46 }}><Icon n="car" s={22} /></span>
          <div className="grow">
            <div className="sesshead"><div><div className="ttl">{ctx.carro} <span className="mini"><Icon n="ext" s={13} /></span></div>
              <div className="sub">{ctx.pista}</div></div></div>
            <div className="cond" style={{ marginTop: 8 }}>
              <span><Icon n="clock" s={13} sw={2} /> <b className="num">{ctx.voltasLimpas} limpas</b></span>
              <span><Icon n="telem" s={13} sw={2} /> <b className="num">{ctx.voltasValidas} válidas</b></span>
            </div>
          </div>
        </div>
        <Pod podRef={youPod} you name="Sua melhor" s={payload.ref} />
        <Pod podRef={refPod} name={ctx.referencia} s={payload.media} danger />
      </div>

      <div className="row tp-main" style={{ gap: 14, alignItems: 'stretch', marginTop: 14, flex: 1, minHeight: 0 }}>
        <div className="col" style={{ flex: '1.02', gap: 0 }}>
          <div className="row between center">
            <SlideSeg options={['Segments', 'Sectors']} value={view} onChange={setView} />
            <span className="muted" style={{ fontSize: 12 }}><b className="num">Melhor {ctx.suaMelhor}</b> · vs <b className="num purple">{ctx.referencia}</b></span>
          </div>
          <InteractiveTrack ref={trackRef} trackGeom={pair.track} racingGeom={pair.racing} racingGeomB={pair.racingB} edges={pair.edges} unitPerM={pair.unitPerM} follow initialT={t0} corners={payload.corners} />
          <div className="card pad tp-seg" style={{ marginTop: 12 }}>
            <div className="tp-poslabel"><span className="dim">Posição na volta</span><b className="num" ref={posRef}>{Math.round(t0 * 100)}%</b></div>
          </div>
        </div>

        <div className="card pad tp-channels" style={{ flex: '0.98', display: 'flex', flexDirection: 'column' }}>
          <div className="row between center" style={{ marginBottom: 6 }}>
            <div className="utabs" style={{ border: 0, gap: 18 }}><button className="on">Telemetry</button><button>Tyres</button></div>
            <div className="row center gap8" style={{ color: 'var(--ink-3)' }}>
              {zoomed && <button className="chip" style={{ padding: '3px 9px' }} onClick={() => setZoom({ lo: 0, hi: 1 })}><Icon n="refresh" s={11} /> Reset zoom</button>}
              <span className="tp-leg"><span className="dot acc" />Melhor</span>
              <span className="tp-leg"><span className="tp-dash" />Média</span>
            </div>
          </div>
          <div className="tp-stack" ref={stackRef}>
            {defs.map((d, i) => (
              <div className="tp-chan" key={d.kind} style={{ animationDelay: (0.04 * i + 0.05) + 's' }} data-kind={d.kind}>
                <div className="tp-chan-head">
                  <span className="lbl">{d.name}</span>
                  <span className="tp-ref num" data-ghost>{d.ghost ? d.fg(idx0) : ''}</span>
                  <span className="tp-val num" style={{ color: d.color }}><span data-val>{d.fm(idx0)}</span><i>{d.unit}</i></span>
                </div>
                <div className="tp-plot" style={{ cursor: 'crosshair' }} onPointerDown={startSelect} onPointerMove={hover}>
                  <svg viewBox={`${(zoom.lo * W).toFixed(1)} 0 ${(span * W).toFixed(1)} ${H}`} preserveAspectRatio="none" className="tp-svg">
                    <defs><linearGradient id={'tpg-' + d.kind} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={d.color} stopOpacity=".34" /><stop offset="1" stopColor={d.color} stopOpacity="0" /></linearGradient></defs>
                    {d.kind !== 'gear' && <path d={d.area} fill={`url(#tpg-${d.kind})`} />}
                    {d.gline && <path d={d.gline} className="tp-ghost" />}
                    <path d={d.line} fill="none" stroke={d.color} className="tp-mainline" />
                  </svg>
                  {sectors.map((s, si) => { const lp = ((s - zoom.lo) / span) * 100; return (lp >= 0 && lp <= 100) ? <span key={si} style={{ position: 'absolute', top: 0, bottom: 0, left: lp + '%', width: 1, background: 'rgba(255,255,255,.16)', pointerEvents: 'none' }} /> : null })}
                  {sel && (() => { const la = Math.min(sel.a, sel.b), lb = Math.max(sel.a, sel.b); const l = ((la - zoom.lo) / span) * 100, w = ((lb - la) / span) * 100; return <span style={{ position: 'absolute', top: 0, bottom: 0, left: l + '%', width: w + '%', background: 'var(--accent-soft)', borderLeft: '1px solid var(--accent)', borderRight: '1px solid var(--accent)', pointerEvents: 'none' }} /> })()}
                  <span className="tp-cursor" data-cursor style={{ left: 0, willChange: 'transform' }} />
                  {d.kind !== 'gear' && <span className="tp-dot" data-dot style={{ left: 0, top: 0, background: d.color, willChange: 'transform', transform: 'translate3d(0,0,0) translate(-50%,-50%)' }} />}
                </div>
              </div>
            ))}
          </div>
          <div className="tp-zoomnote">Arraste sobre um gráfico para recortar · roda do mouse para zoom · clique para posicionar</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="tp-scrub card">
          <button className={'tp-play' + (playing ? ' on' : '')} onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg> : <Icon n="play" s={14} fill="currentColor" />}
          </button>
          <b className="num tp-clock" ref={clockRef}>{fmtClock(t0 * model.lapSecs)}</b>
          <div className="tp-track-bar" ref={barRef} onPointerDown={startDragBar}>
            <div className="tp-fill" ref={fillRef} style={{ width: '100%', transform: `scaleX(${t0})`, transformOrigin: 'left', willChange: 'transform' }} />
            {sectors.map((s, si) => <span key={si} className="tp-tick" style={{ left: s * 100 + '%' }} />)}
            <span className="tp-knob" ref={knobRef} style={{ left: 0, willChange: 'transform' }} />
          </div>
          <div className="tp-readout">
            <span className="dim">Δ</span> <b className="num" ref={deltaRef}>+0.000</b>
            <span className="dim" style={{ marginLeft: 10 }}>↔</span> <b className="num"><span ref={gapRef}>0</span><i style={{ fontStyle: 'normal', color: 'var(--ink-3)', fontSize: 10 }}> m</i></b>
            <span className="dim" style={{ marginLeft: 10 }}>SPD</span> <b className="num"><span ref={spdRef}>0</span><i style={{ fontStyle: 'normal', color: 'var(--ink-3)', fontSize: 10 }}> km/h</i></b>
          </div>
          <SlideSeg options={['Time', 'Distance']} value={mode} onChange={setMode} />
        </div>
      </div>
    </div>
  )
}
