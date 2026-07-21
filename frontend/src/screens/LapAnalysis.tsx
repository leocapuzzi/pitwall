import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PointerEvent as RPointerEvent } from 'react'
import Icon from '../components/Icon'
import SlideSeg from '../components/SlideSeg'
import DriverPod from '../components/DriverPod'
import PodPicker from '../components/PodPicker'
import InteractiveTrack, { type TrackHandle } from '../components/InteractiveTrack'
import MiniTrackMap from '../components/MiniTrackMap'
import { useSession } from '../lib/useSession'
import { projectTrackPair, deltaGradientSegments, type TrackPair, type LineSegment } from '../lib/track'
import { parseLap, fmtClock } from '../lib/fmt'
import { setPendingFocus } from '../lib/bus'
import type { Payload, Channels } from '../lib/api'

// Lap Analysis v3 — réplica do Race Engineer do GO Fast com dados reais:
// mapa = fundo da tela inteira (câmera no carro), linha em GRADIENTE pelo delta,
// fantasma da média, bandeirinhas de freada; flutuando em vidro: info do carro,
// mini-ranking de voltas, rail de ações, comparação por setor, 2 pods ao vivo,
// minimapa com sonar (clique abre o trecho na Telemetry), slider de zoom e
// scrubber com Delta central + switch do fantasma + Time/Distance.

interface CornerRow { n: number; apex: number; d: number; dIn: number; dOut: number; vmin: number | null; coach: string }
interface SecRow { id: string; ref: number; media: number }
interface LapTop { n: number; t: number }
interface Model {
  pair: TrackPair; segs: LineSegment[]; rows: CornerRow[]; secRows: SecRow[]
  lapSecs: number; totalD: number
  top2: LapTop[]; fuelPorVolta: number | null
  markers: { x: number; y: number; ang: number }[]
  tRef: number[] | null; tMed: number[] | null; lengthM: number; hasLineB: boolean
}

function buildModel(p: Payload): Model {
  const pair = projectTrackPair(p.track, p.racing_line, p.track_edges, p.racing_line_b)
  const st = p.sectorTimes || { labels: [], ref: [], media: [], genericos: true }
  const lista = p.analise_curvas || []
  const rows: CornerRow[] = (p.corners || []).map((c, i) => {
    const a: Record<string, any> = (lista[i]?.name === c.name ? lista[i] : lista.find(r => r.name === c.name)) || {}
    return {
      n: c.n, apex: c.apex_pct, d: +(a.dt ?? 0), dIn: +(a.dt_entry ?? 0), dOut: +(a.dt_exit ?? 0),
      vmin: a.v_min ?? null, coach: a.coach || '',
    }
  })
  const secRows: SecRow[] = st.labels.map((lb, i) => ({ id: lb, ref: st.ref[i] || 0, media: st.media[i] || 0 }))
  const valid = (p.laps || []).filter(l => l.valid).sort((a, b) => a.t - b.t)
  const comFuel = (p.laps || []).filter(l => l.fuel != null && !l.pit)
  const N = p.delta.length
  // bandeirinhas: início real de cada zona de frenagem da melhor volta
  const markers: { x: number; y: number; ang: number }[] = []
  const pts = pair.racing.pts
  if (pts.length > 4) {
    for (let i = 6; i < N; i++) {
      if ((p.ref.brake[i] || 0) > 25 && (p.ref.brake[i - 4] || 0) < 8) {
        const k = Math.round(i / (N - 1) * (pts.length - 1))
        const a = pts[Math.max(0, k - 2)], b = pts[Math.min(pts.length - 1, k + 2)]
        markers.push({ x: pts[k].x, y: pts[k].y, ang: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI })
        i += 25
      }
    }
  }
  const tRefArr = p.ref_time?.length === N ? p.ref_time : null
  return {
    pair, segs: deltaGradientSegments(pair.racing.pts, p.delta), rows, secRows,
    lapSecs: parseLap(p.contexto.suaMelhor),
    totalD: N ? p.delta[N - 1] : 0,
    top2: valid.slice(0, 2).map(l => ({ n: l.n, t: l.t })),
    fuelPorVolta: comFuel.length ? comFuel.reduce((a, l) => a + (l.fuel || 0), 0) / comFuel.length : null,
    markers,
    tRef: tRefArr, tMed: tRefArr ? tRefArr.map((v, i) => v + (p.delta[i] || 0)) : null,
    lengthM: p.eixoDist?.length ? p.eixoDist[p.eixoDist.length - 1] : 0,
    hasLineB: !!p.racing_line_b?.x?.length,
  }
}

const sign = (v: number, dec = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dec)

export default function LapAnalysis() {
  const { payload, loading, error, sessions, current, applyPodPick } = useSession()
  const [podPick, setPodPick] = useState<'A' | 'B' | null>(null)
  const model = useMemo(() => (payload ? buildModel(payload) : null), [payload])
  const [playing, setPlaying] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const [mode, setMode] = useState('Time')
  const [camB, setCamB] = useState(false) // lock da câmera: false = sua volta, true = comparação
  const [showFuel, setShowFuel] = useState(false)

  const tRef = useRef(0), raf = useRef(0)
  const modelRef = useRef<Model | null>(model); modelRef.current = model
  const payloadRef = useRef<Payload | null>(payload); payloadRef.current = payload
  const modeRef = useRef(mode); modeRef.current = mode
  const trackRef = useRef<TrackHandle>(null)
  const mmDot = useRef<SVGCircleElement | null>(null)
  const podA = useRef<HTMLDivElement>(null), podB = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null), knobRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef<HTMLElement>(null), deltaRef = useRef<HTMLElement>(null), gapRef = useRef<HTMLElement>(null)
  const barW = useRef(0), lastText = useRef(0)
  interface PodEls { s: Channels; els: Record<string, HTMLElement | null> }
  const pods = useRef<PodEls[]>([])
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
    const N = p.delta.length; if (!N) return
    const f = Math.max(0, Math.min(N - 1, tv * (N - 1)))
    const i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), fr = f - i0
    const idx = fr < 0.5 ? i0 : i1
    trackRef.current?.setT(tv, (p.ref.brake[idx] || 0) > 18)
    // fantasma (média) + gap real
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
    const now = performance.now()
    if (!force && now - lastText.current < 66) return
    lastText.current = now
    if (clockRef.current) clockRef.current.textContent = fmtClock(m.tRef ? sampleAt(m.tRef, tv) : tv * m.lapSecs)
    const dv = lerp(p.delta[i0], p.delta[i1], fr)
    if (deltaRef.current) {
      deltaRef.current.textContent = sign(dv, 3)
      const cls = 'num ' + (dv >= 0 ? 'redt' : 'green')
      if (deltaRef.current.className !== cls) deltaRef.current.className = cls
    }
    if (gapRef.current) gapRef.current.textContent = gapM == null ? '—' : (gapM >= 0 ? '+' : '−') + Math.abs(gapM).toFixed(0) + ' m'
    for (const pod of pods.current) {
      const e = pod.els, s = pod.s
      if (e.thr) e.thr.textContent = Math.round(s.throttle[idx] || 0) + '%'
      if (e.brk) e.brk.textContent = Math.round(s.brake[idx] || 0) + '%'
      if (e.spd) e.spd.textContent = String(Math.round(s.speed[idx] || 0))
      if (e.gear) e.gear.textContent = String(Math.round(s.gear[idx] || 0))
      if (e.rpm) e.rpm.textContent = String(Math.round(s.rpm[idx] || 0))
    }
  }, [])

  // pior curva ativa por padrão (card de detalhe) — mas o player fica na LARGADA
  // (t=0); o carro só pula p/ um trecho quando o usuário CLICA (curva/setor/replay).
  useEffect(() => {
    if (model && active == null && model.rows.length) {
      const worst = model.rows.reduce((a, b) => (b.d > a.d ? b : a), model.rows[0])
      setActive(worst.n)
    }
  }, [model])

  // caches (pods/barra) + ressincronização pré-paint
  useLayoutEffect(() => {
    const p = payload
    const podOf = (el: HTMLDivElement | null, s?: Channels): PodEls[] => {
      if (!el || !s) return []
      const q = (k: string) => el.querySelector(`[data-f="${k}"]`) as HTMLElement | null
      return [{ s, els: { thr: q('thr'), thrbar: q('thrbar'), brk: q('brk'), brkbar: q('brkbar'), spd: q('spd'), gear: q('gear'), rpm: q('rpm'), wheel: q('wheel'), steerarc: q('steerarc') } }]
    }
    pods.current = [...podOf(podA.current, p?.ref), ...podOf(podB.current, p?.media)]
    if (barRef.current) barW.current = barRef.current.clientWidth
    renderFrame(tRef.current, true)
  })
  useEffect(() => {
    const ro = new ResizeObserver(() => { if (barRef.current) barW.current = barRef.current.clientWidth; renderFrame(tRef.current, true) })
    if (barRef.current) ro.observe(barRef.current)
    return () => ro.disconnect()
  }, [model, renderFrame])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now
      const mm = modelRef.current
      let nt: number
      if (mm?.tRef && mm.tRef.length > 1) {
        // tempo REAL da volta → distância: o carro freia de verdade nas curvas
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

  const openSegment = useCallback((n: number) => {
    const c = modelRef.current?.rows.find(r => r.n === n); if (!c) return
    setPendingFocus({ lo: Math.max(0, c.apex - 0.05), hi: Math.min(1, c.apex + 0.045), t: c.apex })
    window.dispatchEvent(new CustomEvent('pw:go', { detail: 'telemetry' }))
  }, [])

  const scrub = useCallback((v: number) => {
    setPlaying(false); const t = Math.max(0, Math.min(1, v)); tRef.current = t; renderFrame(t, true)
    const m = modelRef.current; if (!m) return
    let bestN: number | null = null, bd = 1
    m.rows.forEach(c => { const dd = Math.abs(c.apex - t), e = Math.min(dd, 1 - dd); if (e < bd) { bd = e; bestN = c.n } })
    if (bestN != null && bd < 0.06) setActive(bestN)
  }, [renderFrame])
  const startDragBar = useCallback((e: RPointerEvent) => {
    const el = barRef.current; if (!el) return
    const set = (cx: number) => { const r = el.getBoundingClientRect(); scrub((cx - r.left) / r.width) }
    set(e.clientX); const mv = (ev: PointerEvent) => set(ev.clientX); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }, [scrub])

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Loading session…</div>
  if (error || !model || !payload) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'No data'}</div>

  const m = model, ctx = payload.contexto
  const t0 = tRef.current
  const activeRow = m.rows.find(r => r.n === active) || m.rows[0]
  const sectors = (payload.setores || []).filter(s => s > 0.001 && s < 0.999)
  const replaySeg = () => { if (!activeRow) return; tRef.current = (activeRow.apex - 0.045 + 1) % 1; renderFrame(tRef.current, true); setPlaying(true) }

  return createPortal(
    <div className="pw-maplayer">
      <InteractiveTrack ref={trackRef} trackGeom={m.pair.track} racingGeom={m.pair.racing} racingGeomB={m.pair.racingB}
        racingSegments={m.segs} edges={m.pair.edges} unitPerM={m.pair.unitPerM} markers={m.markers}
        initialT={t0} corners={payload.corners} hideCorners follow followCar={camB ? 'B' : 'A'} initialZoom={16} zoomSlider
        activeCorner={active} height={440}>

        {/* COLUNA ESQUERDA em fluxo (sem sobreposições por construção) */}
        <div className="pw-leftcol">
        {/* info do carro (topo-esquerda, sem card) */}
        <div className="pw-carinfo">
          <div className="row center gap10">
            <span className="cbadge" style={{ width: 36, height: 36 }}><Icon n="car" s={18} /></span>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 16.5 }}>{ctx.carro}</b>
          </div>
          <div className="pw-carmeta">
            <span>{ctx.pista}</span>
            <span><Icon n="clock" s={12} sw={2} /> {ctx.suaMelhor}</span>
            <span><Icon n="road" s={12} sw={2} /> {ctx.voltasGravadas} laps</span>
            <span><Icon n="telem" s={12} sw={2} /> {ctx.voltasLimpas} clean</span>
          </div>
        </div>

        {/* mini-ranking: 2 melhores voltas da sessão */}
        {m.top2.length > 0 && (
          <div className="pw-leader pw-glass2">
            {m.top2.map((l, i) => (
              <div key={l.n} className="pw-leadrow">
                <span className="num pos">{i + 1}</span>
                <span className="av"><Icon n="wheel" s={12} /></span>
                <span className="nm">Lap {l.n}</span>
                <b className="num tm">{i === 0 ? fmtClock(l.t) : '+' + (l.t - m.top2[0].t).toFixed(3)}</b>
              </div>
            ))}
          </div>
        )}

        {/* rail de ações (esquerda) */}
        <div className="pw-rail pw-glass2">
          <button title="Back to start" onClick={() => { setPlaying(false); tRef.current = 0; renderFrame(0, true) }}><Icon n="flag" s={15} /></button>
          <button title="Open active section in Telemetry" onClick={() => active != null && openSegment(active)}><Icon n="sliders" s={15} /></button>
          <button title="Fuel" onClick={() => setShowFuel(s => !s)}><Icon n="fuel" s={15} /></button>
        </div>
        {showFuel && (
          <div className="pw-fuelchip pw-glass2">
            <Icon n="fuel" s={13} /> {m.fuelPorVolta != null ? <>{m.fuelPorVolta.toFixed(2)} L/lap{ctx.fuelFim != null ? ` · ~${Math.floor(ctx.fuelFim / m.fuelPorVolta)} laps remaining` : ''}</> : 'no fuel data'}
          </div>
        )}

        {/* comparação por setor (baixo-esquerda) */}
        <div className="pw-seccmp pw-glass2">
          <div className="row between center" style={{ marginBottom: 9 }}>
            <span className="lbl">Sector Comparison</span>
            <button className="pw-nav" title="Open in Telemetry" onClick={() => window.dispatchEvent(new CustomEvent('pw:go', { detail: 'telemetry' }))}><Icon n="ext" s={11} /></button>
          </div>
          <div className="pw-secgrid">
            <span></span>
            <span className="ic green"><Icon n="car" s={15} /></span>
            <span className="ic"><Icon n="car" s={15} /></span>
            {m.secRows.map(r => {
              const best = r.ref <= r.media
              return [
                <span key={r.id + 'l'} className="num sn">{r.id}</span>,
                <b key={r.id + 'a'} className={'num ' + (best ? '' : 'redt')}>{r.ref.toFixed(3)}</b>,
                <b key={r.id + 'b'} className="num purple">{r.media.toFixed(3)}</b>,
              ]
            })}
          </div>
        </div>
        </div>

        {/* pods ao vivo (topo-direita) — clicar abre o picker global A/B */}
        <div className="pw-pods">
          <DriverPod podRef={podA} on name={ctx.refName || 'Your best'} time={ctx.suaMelhor} sub={ctx.refSub || `Lap ${m.top2[0]?.n ?? '—'}`} onOpen={() => setPodPick('A')} openTitle="Pick your lap (local or Garage61)" />
          <DriverPod podRef={podB} name={ctx.referencia} time={fmtClock(m.lapSecs + m.totalD)} sub={ctx.compSub || 'average'} onOpen={() => setPodPick('B')} openTitle="Pick the comparison (average or Garage61)" />
        </div>
        {podPick && (
          <PodPicker side={podPick} payload={payload} sessions={sessions} current={current}
            onApply={d => applyPodPick(podPick, d)} onDefault={() => void applyPodPick(podPick, null)}
            onClose={() => setPodPick(null)} />
        )}

        {/* coluna direita: minimapa + INSIGHT da curva ativa (novo padrão) */}
        <div className="pw-rightcol">
          <MiniTrackMap className="pw-minimap pw-inflow" pair={m.pair} active={active}
            corners={m.rows.map(r => ({ n: r.n, apex: r.apex, d: r.d }))}
            onPick={openSegment} carDotRef={el => { mmDot.current = el }}
            footer={activeRow ? { label: `Segment T${activeRow.n}`, value: sign(activeRow.d), danger: activeRow.d > 0 } : undefined} />
          {activeRow && (
            <div className="pw-insight pw-glass2" key={activeRow.n}>
              <div className="row between center">
                <span className="lbl">Insight · T{activeRow.n}</span>
                <b className={'num ' + (activeRow.d > 0 ? 'redt' : 'green')} style={{ fontSize: 13 }}>{sign(activeRow.d)}s</b>
              </div>
              <p>{activeRow.coach || 'No coaching read for this turn in this session.'}</p>
              <div className="row gap8" style={{ flexWrap: 'wrap', fontSize: 11 }}>
                <span className="chip" style={{ padding: '2px 8px' }}>vmin <b className="num" style={{ marginLeft: 4 }}>{activeRow.vmin != null ? Math.round(activeRow.vmin) : '—'}</b></span>
                <span className="chip" style={{ padding: '2px 8px' }}>entry <b className={'num ' + (activeRow.dIn > 0 ? 'redt' : 'green')} style={{ marginLeft: 4 }}>{sign(activeRow.dIn)}</b></span>
                <span className="chip" style={{ padding: '2px 8px' }}>exit <b className={'num ' + (activeRow.dOut > 0 ? 'redt' : 'green')} style={{ marginLeft: 4 }}>{sign(activeRow.dOut)}</b></span>
              </div>
              <button className="chip" style={{ marginTop: 10 }} onClick={() => openSegment(activeRow.n)}><Icon n="telem" s={12} /> Open section in Telemetry</button>
            </div>
          )}
        </div>

        {/* scrubber (vidro): progresso fino no topo + Delta central + fantasma + modo */}
        <div className="pw-scrubfloat">
          <div className="tp-scrub card pw-scrub2">
            <div className="pw-progress" ref={barRef} onPointerDown={startDragBar}>
              <div className="tp-fill" ref={fillRef} style={{ width: '100%', transform: `scaleX(${t0})`, transformOrigin: 'left', willChange: 'transform' }} />
              {sectors.map((s, si) => <span key={si} className="tp-tick" style={{ left: s * 100 + '%' }} />)}
              <span className="tp-knob" ref={knobRef} style={{ left: 0, willChange: 'transform' }} />
            </div>
            <button className={'tp-play' + (playing ? ' on' : '')} onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg> : <Icon n="play" s={14} fill="currentColor" />}
            </button>
            <b className="num tp-clock" ref={clockRef}>{fmtClock(t0 * m.lapSecs)}</b>
            <button className="pw-replay" title="Replay active segment" onClick={replaySeg}><Icon n="refresh" s={13} /></button>
            <div className="pw-delta">
              <span className="dim">Delta:</span> <b className="num redt" ref={deltaRef}>+0.000</b>
              <span className="dim">↔</span> <b className="num" ref={gapRef} style={{ color: 'var(--red)' }}>+0 m</b>
            </div>
            <button className={'pw-switch' + (camB ? ' on' : '')} title="Camera: toggle between the two cars" onClick={() => setCamB(v => !v)} aria-label="Toggle camera"><i /></button>
            <SlideSeg options={['Time', 'Distance']} value={mode} onChange={setMode} />
          </div>
        </div>
      </InteractiveTrack>
    </div>,
    document.body
  )
}
