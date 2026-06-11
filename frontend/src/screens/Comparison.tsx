import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import Icon from '../components/Icon'
import SlideSeg from '../components/SlideSeg'
import InteractiveTrack, { type TrackHandle } from '../components/InteractiveTrack'
import { useSession } from '../lib/useSession'
import { projectTrackPair, deltaSegments, type TrackPair, type LineSegment } from '../lib/track'
import { parseLap, fmtClock } from '../lib/fmt'
import type { Payload } from '../lib/api'

// Comparison (screens-comparison/A do handoff, com dados reais): Volta A = MÉDIA das
// limpas vs Volta B = SUA MELHOR (o par que o payload já traz). Mapa com a linha
// colorida por delta + callout/inset, delta acumulado, setores A vs B (clique foca a
// pior curva do setor no mapa) e overlay de canais. Padrão imperativo nos cursores.

const W = 600, H = 100
const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v))
const linePath = (a: number[]) => a.map((v, i) => (i ? 'L' : 'M') + (i / (a.length - 1) * W).toFixed(1) + ',' + ((1 - v) * H).toFixed(1)).join(' ')
const sign = (v: number, dec = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dec)

interface Chan {
  kind: string; name: string; color: string; unit: string
  main: number[]; ghost: number[]; line: string; gline: string; area: string
  fmA: (i: number) => string | number; fmB: (i: number) => string | number
}
interface SecRow { s: string; a: number; b: number; d: number; focusN: number | null }
interface Model {
  pair: TrackPair; segs: LineSegment[]; chans: Chan[]; secRows: SecRow[]
  aSecs: number; bSecs: number; totalD: number
  dLine: string; dArea: string; dNorm: number[]
  topA: number; topB: number; optimal: number | null
  worst: SecRow | null; bestGain: SecRow | null; worstCornerN: number | null
  tRef: number[] | null; tMed: number[] | null; lengthM: number; hasLineB: boolean
}

function buildModel(p: Payload): Model {
  const pair = projectTrackPair(p.track, p.racing_line, p.track_edges, p.racing_line_b)
  const med = p.media, ref = p.ref
  const allS = ref.speed.concat(med.speed)
  const smin = Math.min(...allS), smax = Math.max(...allS)
  const NRM = (a: number[]) => a.map(v => clamp01((v - smin) / ((smax - smin) || 1)))
  const N01 = (a: number[]) => a.map(v => clamp01(v / 100))
  // A = média (linha cheia), B = sua melhor (tracejada/referência)
  const chans: Chan[] = [
    { kind: 'speed', name: 'Speed', color: 'var(--cyan)', unit: ' km/h', main: NRM(med.speed), ghost: NRM(ref.speed), fmA: i => Math.round(med.speed[i]), fmB: i => Math.round(ref.speed[i]), line: '', gline: '', area: '' },
    { kind: 'throttle', name: 'Throttle', color: 'var(--accent)', unit: '%', main: N01(med.throttle), ghost: N01(ref.throttle), fmA: i => Math.round(med.throttle[i]), fmB: i => Math.round(ref.throttle[i]), line: '', gline: '', area: '' },
    { kind: 'brake', name: 'Brake', color: 'var(--red)', unit: '%', main: N01(med.brake), ghost: N01(ref.brake), fmA: i => Math.round(med.brake[i]), fmB: i => Math.round(ref.brake[i]), line: '', gline: '', area: '' },
  ]
  chans.forEach(c => { c.line = linePath(c.main); c.gline = linePath(c.ghost); c.area = c.line + ` L${W},${H} L0,${H} Z` })

  // delta acumulado normalizado (0 no meio)
  const dmax = Math.max(0.05, ...p.delta.map(v => Math.abs(v)))
  const dNorm = p.delta.map(v => clamp01(0.5 - (v / (2 * dmax)) * 0.45 * 2))
  const dLine = linePath(dNorm)
  const dArea = dLine + ` L${W},${H} L0,${H} Z`

  // setores A vs B + pior curva de cada setor (p/ foco no mapa)
  const st = p.sectorTimes || { labels: [], ref: [], media: [], genericos: true }
  const setores = p.setores || []
  const lista = p.analise_curvas || []
  const dtOf = (i: number, name: string) => +(((lista[i]?.name === name ? lista[i] : lista.find(r => r.name === name)) || {}).dt ?? 0)
  const secRows: SecRow[] = st.labels.map((lb, i) => {
    const start = setores[i] ?? 0, end = setores[i + 1] ?? 1
    let focusN: number | null = null, bd = 0
    ;(p.corners || []).forEach((c, ci) => {
      if (c.apex_pct >= start && c.apex_pct < end) {
        const dt = Math.abs(dtOf(ci, c.name))
        if (dt >= bd) { bd = dt; focusN = c.n }
      }
    })
    return { s: lb, a: st.media[i] || 0, b: st.ref[i] || 0, d: +((st.media[i] || 0) - (st.ref[i] || 0)), focusN }
  })
  const worst = secRows.length ? secRows.reduce((a, b) => (b.d > a.d ? b : a)) : null
  const gains = secRows.filter(s => s.d < 0)
  const bestGain = gains.length ? gains.reduce((a, b) => (b.d < a.d ? b : a)) : (secRows.length ? secRows.reduce((a, b) => (b.d < a.d ? b : a)) : null)

  // tempos e stats
  const bSecs = parseLap(p.contexto.suaMelhor)
  const totalD = p.delta.length ? p.delta[p.delta.length - 1] : 0
  const clean = (p.laps || []).filter(l => l.clean)
  const aSecs = clean.length ? clean.reduce((a, l) => a + l.t, 0) / clean.length : bSecs + totalD
  const valid = (p.laps || []).filter(l => l.valid)
  const nSec = Math.max(0, ...valid.map(l => l.s?.length || 0))
  const optimal = nSec ? Array.from({ length: nSec }, (_, i) => Math.min(...valid.filter(l => (l.s?.length || 0) > i).map(l => l.s[i]))).reduce((a, b) => a + b, 0) : null
  const N = p.delta.length
  const tRefArr = p.ref_time?.length === N ? p.ref_time : null
  return {
    pair, segs: deltaSegments(pair.racing.pts, p.delta), chans, secRows,
    aSecs, bSecs, totalD, dLine, dArea, dNorm,
    topA: Math.max(...med.speed), topB: Math.max(...ref.speed), optimal,
    worst, bestGain, worstCornerN: worst?.focusN ?? null,
    tRef: tRefArr, tMed: tRefArr ? tRefArr.map((v, i) => v + (p.delta[i] || 0)) : null,
    lengthM: p.eixoDist?.length ? p.eixoDist[p.eixoDist.length - 1] : 0,
    hasLineB: !!p.racing_line_b?.x?.length,
  }
}

export default function Comparison() {
  const { payload, loading, error } = useSession()
  const model = useMemo(() => (payload ? buildModel(payload) : null), [payload])
  const [playing, setPlaying] = useState(false)
  const [focusSec, setFocusSec] = useState<string | null>(null)
  const [mode, setMode] = useState('Distance')
  const modeRef = useRef(mode); modeRef.current = mode

  const tRef = useRef(0.3), raf = useRef(0)
  const modelRef = useRef<Model | null>(model); modelRef.current = model
  const payloadRef = useRef<Payload | null>(payload); payloadRef.current = payload
  const trackRef = useRef<TrackHandle>(null)
  const stackRef = useRef<HTMLDivElement>(null), dplotRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null), knobRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef<HTMLElement>(null), deltaRef = useRef<HTMLElement>(null), spdRef = useRef<HTMLElement>(null)
  const dValRef = useRef<HTMLElement>(null)
  const barW = useRef(0), lastText = useRef(0)
  const gapRef = useRef<HTMLElement>(null)
  interface RowEls { kind: string; w: number; h: number; main: number[]; cursor: HTMLElement | null; dot: HTMLElement | null; va: HTMLElement | null; vb: HTMLElement | null; fmA: (i: number) => string | number; fmB: (i: number) => string | number }
  const rows = useRef<RowEls[]>([])
  const dEls = useRef<{ w: number; h: number; cursor: HTMLElement | null; dot: HTMLElement | null } | null>(null)
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f
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
    const N = p.delta.length; if (!N) return
    const f = Math.max(0, Math.min(N - 1, tv * (N - 1)))
    const i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), fr = f - i0
    const idx = fr < 0.5 ? i0 : i1
    trackRef.current?.setT(tv, (p.ref.brake[idx] || 0) > 18)
    // fantasma = Volta A (média): Distance alinha no mesmo ponto; Time mostra o gap real
    let gapM: number | null = null
    if (m.tRef && m.tMed) {
      const tau = lerp(m.tRef[i0], m.tRef[i1], fr)
      const dB = invTime(tau, m.tMed)
      gapM = (tv - dB) * m.lengthM
      const tB = modeRef.current === 'Time' ? dB : tv
      if (!m.hasLineB && modeRef.current !== 'Time') trackRef.current?.setT2(null)
      else trackRef.current?.setT2(tB)
    } else trackRef.current?.setT2(m.hasLineB ? tv : null)
    for (const r of rows.current) {
      const x = (tv * r.w).toFixed(2)
      if (r.cursor) r.cursor.style.transform = `translate3d(${x}px,0,0)`
      if (r.dot) { const y = ((1 - lerp(r.main[i0], r.main[i1], fr)) * r.h).toFixed(2); r.dot.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)` }
    }
    const de = dEls.current
    if (de) {
      const x = (tv * de.w).toFixed(2)
      if (de.cursor) de.cursor.style.transform = `translate3d(${x}px,0,0)`
      if (de.dot) { const y = ((1 - lerp(m.dNorm[i0], m.dNorm[i1], fr)) * de.h).toFixed(2); de.dot.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)` }
    }
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${tv.toFixed(5)})`
    if (knobRef.current) knobRef.current.style.transform = `translate3d(${(tv * barW.current).toFixed(2)}px,0,0) translateX(-50%)`
    const now = performance.now()
    if (!force && now - lastText.current < 100) return
    lastText.current = now
    for (const r of rows.current) {
      if (r.va) r.va.textContent = String(r.fmA(idx))
      if (r.vb) r.vb.textContent = String(r.fmB(idx))
    }
    if (clockRef.current) clockRef.current.textContent = fmtClock(tv * m.aSecs)
    const dv = p.delta[idx]
    if (dValRef.current) dValRef.current.textContent = sign(dv, 3)
    if (deltaRef.current) {
      deltaRef.current.textContent = sign(dv, 3)
      const cls = 'num ' + (dv >= 0 ? 'redt' : 'green')
      if (deltaRef.current.className !== cls) deltaRef.current.className = cls
    }
    if (spdRef.current) spdRef.current.textContent = String(Math.round(p.media.speed[idx] || 0))
    if (gapRef.current) gapRef.current.textContent = gapM == null ? '—' : (gapM >= 0 ? '+' : '−') + Math.abs(gapM).toFixed(0)
  }, [])

  // caches de elementos + medidas (pré-paint, a cada render)
  useLayoutEffect(() => {
    const m = model, stack = stackRef.current
    rows.current = (m && stack) ? m.chans.flatMap(c => {
      const row = stack.querySelector(`.cmp-chrow[data-kind="${c.kind}"]`) as HTMLElement | null
      const plot = row?.querySelector('.cmp-chplot') as HTMLElement | null
      if (!row || !plot) return []
      return [{
        kind: c.kind, w: plot.clientWidth, h: plot.clientHeight, main: c.main, fmA: c.fmA, fmB: c.fmB,
        cursor: row.querySelector('[data-cursor]') as HTMLElement | null, dot: row.querySelector('[data-dot]') as HTMLElement | null,
        va: row.querySelector('[data-va]') as HTMLElement | null, vb: row.querySelector('[data-vb]') as HTMLElement | null,
      }]
    }) : []
    const dp = dplotRef.current
    dEls.current = dp ? { w: dp.clientWidth, h: dp.clientHeight, cursor: dp.querySelector('[data-cursor]'), dot: dp.querySelector('[data-dot]') } : null
    if (barRef.current) barW.current = barRef.current.clientWidth
    renderFrame(tRef.current, true)
  })
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const stack = stackRef.current
      for (const r of rows.current) {
        const plot = stack?.querySelector(`.cmp-chrow[data-kind="${r.kind}"] .cmp-chplot`) as HTMLElement | null
        if (plot) { r.w = plot.clientWidth; r.h = plot.clientHeight }
      }
      const dp = dplotRef.current
      if (dp && dEls.current) { dEls.current.w = dp.clientWidth; dEls.current.h = dp.clientHeight }
      if (barRef.current) barW.current = barRef.current.clientWidth
      renderFrame(tRef.current, true)
    })
    if (stackRef.current) ro.observe(stackRef.current)
    if (barRef.current) ro.observe(barRef.current)
    return () => ro.disconnect()
  }, [model, renderFrame])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const loop = (now: number) => { const dt = (now - last) / 1000; last = now; let nt = tRef.current + dt / (modelRef.current?.aSecs || 90); if (nt >= 1) nt -= 1; tRef.current = nt; renderFrame(nt); raf.current = requestAnimationFrame(loop) }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, renderFrame])

  const scrub = useCallback((v: number) => { setPlaying(false); tRef.current = Math.max(0, Math.min(1, v)); renderFrame(tRef.current, true) }, [renderFrame])
  const startDragBar = useCallback((e: RPointerEvent) => {
    const el = barRef.current; if (!el) return
    const set = (cx: number) => { const r = el.getBoundingClientRect(); scrub((cx - r.left) / r.width) }
    set(e.clientX); const mv = (ev: PointerEvent) => set(ev.clientX); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }, [scrub])

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Carregando sessão…</div>
  if (error || !model || !payload) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'Sem dados'}</div>

  const m = model, ctx = payload.contexto
  const t0 = tRef.current
  const focusRow = focusSec ? m.secRows.find(r => r.s === focusSec) : null
  const sectors = (payload.setores || []).filter(s => s > 0.001 && s < 0.999)
  const maxAbsSec = Math.max(0.05, ...m.secRows.map(r => Math.abs(r.d)))

  return (
    <div className="cmp-wrap">
      {/* seletores + delta total */}
      <div className="row gap10" style={{ alignItems: 'stretch' }}>
        <div className="card pad grow"><span className="lbl">Volta A — {ctx.referencia}</span>
          <div className="stat" style={{ marginTop: 4 }}><div className="v sm">{fmtClock(m.aSecs)}</div></div>
          <div className="row center gap8" style={{ marginTop: 6 }}><span className="dot acc"></span><span className="muted" style={{ fontSize: 12 }}>{ctx.pista}</span></div>
        </div>
        <div className="card pad" style={{ flex: 'none', width: 158, textAlign: 'center', display: 'grid', placeItems: 'center', background: m.totalD >= 0 ? 'linear-gradient(150deg,var(--red-soft),var(--surface) 70%)' : 'linear-gradient(150deg,var(--accent-soft),var(--surface) 70%)', borderColor: m.totalD >= 0 ? 'color-mix(in oklch,var(--red) 28%, transparent)' : 'var(--accent-line)' }}>
          <div><span className="lbl">Δ total</span><div className={'v ' + (m.totalD >= 0 ? 'redt' : 'green')} style={{ fontFamily: 'var(--font-display)', fontSize: 30, marginTop: 4 }}>{sign(m.totalD)}</div>
            <span className="dim" style={{ fontSize: 11 }}>{m.totalD >= 0 ? 'A mais lenta' : 'A mais rápida'}</span></div>
        </div>
        <div className="card pad grow"><span className="lbl">Volta B — sua melhor</span>
          <div className="stat" style={{ marginTop: 4 }}><div className="v sm purple">{ctx.suaMelhor}</div></div>
          <div className="row center gap8" style={{ marginTop: 6 }}><span className="dot pur"></span><span className="muted" style={{ fontSize: 12 }}>{ctx.carro}</span></div>
        </div>
      </div>

      {/* mapa grande + delta/setores */}
      <div className="row resp cmp-main" style={{ alignItems: 'stretch', gap: 14 }}>
        <div className="card pad cmp-mapcard" style={{ flex: 1.55, display: 'flex', flexDirection: 'column' }}>
          <div className="row between center">
            <span className="lbl">Onde a volta ganha &amp; perde</span>
            <div className="row" style={{ gap: 14, fontSize: 11.5, fontWeight: 600 }}>
              <span className="row center gap6"><span className="dot acc"></span>A ganha</span>
              <span className="row center gap6"><span className="dot" style={{ background: 'var(--red)' }}></span>A perde</span>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: 12, minHeight: 0 }}>
            <InteractiveTrack ref={trackRef} trackGeom={m.pair.track} racingGeom={m.pair.racing} racingGeomB={m.pair.racingB} racingSegments={m.segs} edges={m.pair.edges} unitPerM={m.pair.unitPerM} follow
              initialT={t0} corners={payload.corners} activeCorner={focusRow?.focusN ?? null}
              focusCorner={focusRow ? focusRow.focusN : null} height={300}>
              {m.worst && (
                <div className="callout" style={{ left: 22, bottom: 22 }}>
                  <span className="pin"></span>
                  <div className="txt"><b className="redt">{m.worst.s} · {sign(m.worst.d)}s perdidos</b>
                    {m.worstCornerN != null && <p>concentrados na T{m.worstCornerN}</p>}</div>
                </div>
              )}
              {m.bestGain && (
                <div className="minimap-inset" style={{ left: 16, top: 14, padding: '9px 13px' }}>
                  <span className="lbl">{m.bestGain.d < 0 ? 'Maior ganho' : 'Menor perda'}</span>
                  <div className={'num ' + (m.bestGain.d < 0 ? 'green' : '')} style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{m.bestGain.s} · {sign(m.bestGain.d)}s</div>
                </div>
              )}
            </InteractiveTrack>
          </div>
          <div className="cmp-mapstats">
            <div><span className="lbl">Vel. máx A</span><b className="num">{Math.round(m.topA)}<i> km/h</i></b></div>
            <div><span className="lbl">Vel. máx B</span><b className="num purple">{Math.round(m.topB)}<i> km/h</i></b></div>
            <div><span className="lbl">Volta ótima</span><b className="num green">{m.optimal != null ? fmtClock(m.optimal) : '—'}</b></div>
          </div>
        </div>

        <div className="col" style={{ flex: 1, gap: 14 }}>
          <div className="card pad">
            <div className="row between center"><span className="lbl">Delta acumulado · A vs B</span>
              <b className="num redt" style={{ fontSize: 15 }} ><span ref={dValRef}>{sign(m.totalD, 3)}</span><i style={{ fontStyle: 'normal', color: 'var(--ink-3)', fontWeight: 500, fontSize: 11 }}> s</i></b></div>
            <div ref={dplotRef} style={{ height: 118, marginTop: 10, position: 'relative' }}>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="tp-svg">
                <defs><linearGradient id="cmpdg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--purple)" stopOpacity=".30" /><stop offset="1" stopColor="var(--purple)" stopOpacity="0" /></linearGradient></defs>
                <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.14)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
                <path d={m.dArea} fill="url(#cmpdg)" />
                <path d={m.dLine} fill="none" stroke="var(--purple)" className="tp-mainline" />
              </svg>
              {sectors.map((s, si) => <span key={si} style={{ position: 'absolute', top: 0, bottom: 0, left: s * 100 + '%', width: 1, background: 'rgba(255,255,255,.14)', pointerEvents: 'none' }} />)}
              <span className="tp-cursor" data-cursor style={{ left: 0, willChange: 'transform' }} />
              <span className="tp-dot" data-dot style={{ left: 0, top: 0, background: 'var(--purple)', willChange: 'transform', transform: 'translate3d(0,0,0) translate(-50%,-50%)' }} />
            </div>
            <div className="row between" style={{ marginTop: 2 }}><span className="dim" style={{ fontSize: 11 }}>Largada / chegada</span><span className="dim" style={{ fontSize: 11 }}>{m.secRows.map(r => r.s).join(' · ')}</span></div>
          </div>
          <div className="card pad grow" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="cmp-srow cmp-shead">
              <span className="cmp-s">Set</span><span className="cmp-a lbl">Volta A</span>
              <span className="lbl" style={{ textAlign: 'center' }}>Ganho ◂ ▸ Perda</span>
              <span className="cmp-b lbl" style={{ textAlign: 'right' }}>Volta B</span><span className="cmp-d lbl" style={{ textAlign: 'right' }}>Δ</span>
            </div>
            {m.secRows.map(r => {
              const loss = r.d > 0, w = Math.min(50, Math.abs(r.d) / maxAbsSec * 50)
              return (
                <button key={r.s} className={'cmp-srow cmp-srowbtn' + (focusSec === r.s ? ' on' : '')} onClick={() => setFocusSec(s => (s === r.s ? null : r.s))}>
                  <span className="cmp-s">{r.s}</span>
                  <span className="num cmp-a">{r.a.toFixed(3)}</span>
                  <div className="dbar"><div className="f" style={loss ? { left: '50%', width: w + '%', background: 'var(--red)' } : { right: '50%', width: w + '%', background: 'var(--accent)' }}></div></div>
                  <span className="num cmp-b purple">{r.b.toFixed(3)}</span>
                  <span className={'num cmp-d ' + (loss ? 'redt' : r.d < 0 ? 'green' : 'dim')}>{sign(r.d)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* overlay de canais A vs B */}
      <div className="card pad cmp-chan" style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minHeight: 188 }} ref={stackRef}>
        <div className="row between center">
          <span className="lbl">Canais · A vs B ao longo da volta</span>
          <div className="row" style={{ gap: 16, fontSize: 11.5, fontWeight: 600 }}>
            <span className="row center gap6"><span className="dot acc"></span>Volta A (média)</span>
            <span className="row center gap6"><span className="leg-dash"></span>Volta B (melhor)</span>
          </div>
        </div>
        <div className="cmp-chan-grid">
          {m.chans.map(c => {
            const N = c.main.length, idx0 = Math.min(N - 1, Math.round(t0 * (N - 1)))
            return (
              <div className="cmp-chrow" key={c.kind} data-kind={c.kind}>
                <div className="cmp-chlbl">
                  <span className="lbl">{c.name}</span>
                  <div className="cmp-chvals">
                    <b className="num" style={{ color: c.color }}><span data-va>{c.fmA(idx0)}</span><i>{c.unit}</i></b>
                    <b className="num purple"><span data-vb>{c.fmB(idx0)}</span><i>{c.unit}</i></b>
                  </div>
                </div>
                <div className="cmp-chplot" style={{ cursor: 'crosshair' }}
                  onPointerDown={(e) => { const el = e.currentTarget as HTMLElement; const r = el.getBoundingClientRect(); scrub((e.clientX - r.left) / r.width) }}
                  onPointerMove={(e) => { if (playing) return; const el = e.currentTarget as HTMLElement; const r = el.getBoundingClientRect(); tRef.current = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); renderFrame(tRef.current, true) }}>
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="tp-svg">
                    <defs><linearGradient id={'cg-' + c.kind} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c.color} stopOpacity=".26" /><stop offset="1" stopColor={c.color} stopOpacity="0" /></linearGradient></defs>
                    <path d={c.area} fill={'url(#cg-' + c.kind + ')'} />
                    <path d={c.gline} className="tp-ghost" />
                    <path d={c.line} fill="none" stroke={c.color} className="tp-mainline" />
                  </svg>
                  {sectors.map((s, si) => <span key={si} style={{ position: 'absolute', top: 0, bottom: 0, left: s * 100 + '%', width: 1, background: 'rgba(255,255,255,.12)', pointerEvents: 'none' }} />)}
                  <span className="tp-cursor" data-cursor style={{ left: 0, willChange: 'transform' }} />
                  <span className="tp-dot" data-dot style={{ left: 0, top: 0, background: c.color, willChange: 'transform', transform: 'translate3d(0,0,0) translate(-50%,-50%)' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* scrubber */}
      <div>
        <div className="tp-scrub card">
          <button className={'tp-play' + (playing ? ' on' : '')} onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg> : <Icon n="play" s={14} fill="currentColor" />}
          </button>
          <b className="num tp-clock" ref={clockRef}>{fmtClock(t0 * m.aSecs)}</b>
          <div className="tp-track-bar" ref={barRef} onPointerDown={startDragBar}>
            <div className="tp-fill" ref={fillRef} style={{ width: '100%', transform: `scaleX(${t0})`, transformOrigin: 'left', willChange: 'transform' }} />
            {sectors.map((s, si) => <span key={si} className="tp-tick" style={{ left: s * 100 + '%' }} />)}
            <span className="tp-knob" ref={knobRef} style={{ left: 0, willChange: 'transform' }} />
          </div>
          <div className="tp-readout">
            <span className="dim">Δ</span> <b className="num" ref={deltaRef}>+0.000</b>
            <span className="dim" style={{ marginLeft: 10 }}>↔</span> <b className="num"><span ref={gapRef}>0</span><i style={{ fontStyle: 'normal', color: 'var(--ink-3)', fontSize: 10 }}> m</i></b>
            <span className="dim" style={{ marginLeft: 10 }}>SPD A</span> <b className="num"><span ref={spdRef}>0</span><i style={{ fontStyle: 'normal', color: 'var(--ink-3)', fontSize: 10 }}> km/h</i></b>
          </div>
          <SlideSeg options={['Time', 'Distance']} value={mode} onChange={setMode} />
        </div>
      </div>
    </div>
  )
}
