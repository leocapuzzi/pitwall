import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import Icon from '../components/Icon'
import SlideSeg from '../components/SlideSeg'
import InteractiveTrack, { type TrackHandle } from '../components/InteractiveTrack'
import MiniTrackMap from '../components/MiniTrackMap'
import { useSession } from '../lib/useSession'
import { projectTrackPair, deltaSegments, type TrackPair, type LineSegment } from '../lib/track'
import { parseLap, fmtClock } from '../lib/fmt'
import { setPendingFocus } from '../lib/bus'
import type { Payload } from '../lib/api'

// Lap Analysis v2 (estilo GO Fast): MAPA EM TELA CHEIA (linha colorida por delta,
// carro, câmera fixa com zoom) + MINIMAPA com curvas-sonar (pulso vermelho = maior
// perda; hover = tempo perdido; clique = abre o trecho na Telemetry) + card
// flutuante de detalhe da curva com navegação ‹ › e o coaching real.

interface CornerRow {
  n: number; name: string; apex: number; d: number; dIn: number; dOut: number
  vmin: number | null; sector: string; coach: string; flags: string[]
}
interface SecBar { id: string; i: number; d: number; start: number; ref: number; media: number }
interface Model {
  pair: TrackPair; segs: LineSegment[]; rows: CornerRow[]; secBars: SecBar[]
  lapSecs: number; totalD: number; genericos: boolean
}

function buildModel(p: Payload): Model {
  const pair = projectTrackPair(p.track, p.racing_line, p.track_edges)
  const setores = p.setores || []
  const st = p.sectorTimes || { labels: [], ref: [], media: [], genericos: true }
  const sectorOf = (apex: number) => {
    let si = 0; setores.forEach((s, i) => { if (s <= apex) si = i })
    return st.labels[si] || `S${si + 1}`
  }
  const rows: CornerRow[] = (p.corners || []).map((c, i) => {
    const lista = p.analise_curvas || []
    const a: Record<string, any> = (lista[i]?.name === c.name ? lista[i] : lista.find(r => r.name === c.name)) || {}
    return {
      n: c.n, name: c.name || `T${c.n}`, apex: c.apex_pct,
      d: +(a.dt ?? 0), dIn: +(a.dt_entry ?? 0), dOut: +(a.dt_exit ?? 0),
      vmin: a.v_min ?? null, sector: sectorOf(c.apex_pct), coach: a.coach || '', flags: a.flags || [],
    }
  })
  const secBars: SecBar[] = st.labels.map((lb, i) => ({
    id: lb, i, d: +((st.media[i] || 0) - (st.ref[i] || 0)),
    start: setores[i] ?? (st.labels.length ? i / st.labels.length : 0),
    ref: st.ref[i] || 0, media: st.media[i] || 0,
  }))
  return {
    pair, segs: deltaSegments(pair.racing.pts, p.delta), rows, secBars,
    lapSecs: parseLap(p.contexto.suaMelhor),
    totalD: p.delta.length ? p.delta[p.delta.length - 1] : 0, genericos: !!st.genericos,
  }
}

const sign = (v: number, dec = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dec)

export default function LapAnalysis() {
  const { payload, loading, error } = useSession()
  const model = useMemo(() => (payload ? buildModel(payload) : null), [payload])
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState('Segments')
  const [active, setActive] = useState<number | null>(null)   // curva (n)
  const [activeSec, setActiveSec] = useState(0)               // setor (índice)
  const [focused, setFocused] = useState<number | null>(null)

  const tRef = useRef(0.3), raf = useRef(0)
  const modelRef = useRef<Model | null>(model); modelRef.current = model
  const payloadRef = useRef<Payload | null>(payload); payloadRef.current = payload
  const trackRef = useRef<TrackHandle>(null)
  const mmDot = useRef<SVGCircleElement | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null), knobRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef<HTMLElement>(null), deltaRef = useRef<HTMLElement>(null), spdRef = useRef<HTMLElement>(null)
  const barW = useRef(0), lastText = useRef(0)
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f

  const renderFrame = useCallback((tv: number, force = false) => {
    const m = modelRef.current, p = payloadRef.current; if (!m || !p) return
    const N = p.delta.length; if (!N) return
    const f = Math.max(0, Math.min(N - 1, tv * (N - 1)))
    const i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), fr = f - i0
    const idx = fr < 0.5 ? i0 : i1
    trackRef.current?.setT(tv, (p.ref.brake[idx] || 0) > 18)
    // ponto do carro no MINIMAPA
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
    const now = performance.now()
    if (!force && now - lastText.current < 100) return
    lastText.current = now
    if (clockRef.current) clockRef.current.textContent = fmtClock(tv * m.lapSecs)
    const dv = lerp(p.delta[i0], p.delta[i1], fr)
    if (deltaRef.current) {
      deltaRef.current.textContent = sign(dv, 3)
      const cls = 'num ' + (dv >= 0 ? 'redt' : 'green')
      if (deltaRef.current.className !== cls) deltaRef.current.className = cls
    }
    if (spdRef.current) spdRef.current.textContent = String(Math.round(p.ref.speed[idx] || 0))
  }, [])

  // default: pior curva selecionada, carro no ápice dela
  useEffect(() => {
    if (model && active == null && model.rows.length) {
      const worst = model.rows.reduce((a, b) => (b.d > a.d ? b : a), model.rows[0])
      setActive(worst.n); tRef.current = worst.apex
    }
  }, [model])

  useLayoutEffect(() => {
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
    const loop = (now: number) => { const dt = (now - last) / 1000; last = now; let nt = tRef.current + dt / (modelRef.current?.lapSecs || 90); if (nt >= 1) nt -= 1; tRef.current = nt; renderFrame(nt); raf.current = requestAnimationFrame(loop) }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, renderFrame])

  const pick = useCallback((n: number | null) => {
    if (n == null) { setFocused(null); return }
    const c = modelRef.current?.rows.find(r => r.n === n); if (!c) return
    setPlaying(false); setActive(n); setFocused(n)
    tRef.current = c.apex; renderFrame(c.apex, true)
  }, [renderFrame])

  // abre o TRECHO da curva na Telemetry (zoom recortado nos gráficos)
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

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Carregando sessão…</div>
  if (error || !model || !payload) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'Sem dados'}</div>

  const m = model, ctx = payload.contexto
  const segView = view === 'Segments'
  const ordered = m.rows
  const curIdx = Math.max(0, ordered.findIndex(r => r.n === active))
  const cur = ordered[curIdx] || ordered[0]
  const curSec = m.secBars[activeSec] || m.secBars[0]
  const sectors = (payload.setores || []).filter(s => s > 0.001 && s < 0.999)
  const t0 = tRef.current

  const stepCorner = (dir: 1 | -1) => {
    if (segView) { const nx = ordered[(curIdx + dir + ordered.length) % ordered.length]; pick(nx.n) }
    else {
      const ni = (activeSec + dir + m.secBars.length) % m.secBars.length
      setActiveSec(ni); setPlaying(false); setFocused(null)
      tRef.current = m.secBars[ni].start; renderFrame(tRef.current, true)
    }
  }
  const replayCorner = () => { if (!cur) return; tRef.current = (cur.apex - 0.045 + 1) % 1; renderFrame(tRef.current, true); setPlaying(true) }

  return (
    <div className="tp-wrap">
      {/* MAPA em tela cheia com overlays flutuantes */}
      <div className="card" style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', padding: 10 }}>
        <InteractiveTrack ref={trackRef} trackGeom={m.pair.track} racingGeom={m.pair.racing}
          racingSegments={m.segs} edges={m.pair.edges} unitPerM={m.pair.unitPerM}
          initialT={t0} corners={payload.corners} hideCorners follow
          activeCorner={segView ? active : null} onPickCorner={pick} focusCorner={focused} height={440}>
          {/* topo-esquerda: toggle + resumo */}
          <div className="row center gap10" style={{ position: 'absolute', left: 14, top: 14, zIndex: 3 }}>
            <SlideSeg options={['Segments', 'Sectors']} value={view} onChange={setView} />
            <span className="chip" style={{ fontSize: 11 }}>{ctx.referencia} · vs melhor <b className="num purple" style={{ marginLeft: 4 }}>{ctx.suaMelhor}</b> · <b className={'num ' + (m.totalD >= 0 ? 'redt' : 'green')} style={{ marginLeft: 4 }}>{sign(m.totalD)}s</b></span>
          </div>

          {/* detalhe flutuante da curva/setor com navegação ‹ › */}
          <div className="pw-lapdetail" key={segView ? 'c' + (cur?.n ?? 0) : 's' + activeSec}>
            <div className="row between center">
              <div className="row center gap8">
                <button className="pw-nav" onClick={() => stepCorner(-1)} aria-label="Anterior"><Icon n="chevL" s={13} /></button>
                <span className="lp-cbadge" style={{ width: 36, height: 36, fontSize: 13 }}>{segView ? `T${cur?.n}` : curSec?.id}</span>
                <button className="pw-nav" onClick={() => stepCorner(1)} aria-label="Próxima"><Icon n="chevR" s={13} /></button>
                <div style={{ marginLeft: 4 }}>
                  <div className="lbl" style={{ marginBottom: 1 }}>{segView ? `${cur?.sector} · detalhe da curva` : 'detalhe do setor'}</div>
                  <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{(segView ? (cur?.d ?? 0) : (curSec?.d ?? 0)) > 0 ? 'Perdendo tempo' : 'Ganhando tempo'}</b>
                </div>
              </div>
              <div className={'num ' + ((segView ? (cur?.d ?? 0) : (curSec?.d ?? 0)) > 0 ? 'redt' : 'green')} style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                {sign(segView ? (cur?.d ?? 0) : (curSec?.d ?? 0))}
              </div>
            </div>
            {segView ? (
              <>
                <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '9px 0 0' }}>
                  {cur?.coach || 'Sem leitura de coaching para esta curva nesta sessão.'}
                </p>
                <div className="row gap8" style={{ marginTop: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
                  <span className="chip" style={{ padding: '3px 9px' }}>vmin <b className="num" style={{ marginLeft: 4 }}>{cur?.vmin != null ? Math.round(cur.vmin) : '—'}</b></span>
                  <span className="chip" style={{ padding: '3px 9px' }}>entrada <b className={'num ' + ((cur?.dIn ?? 0) > 0 ? 'redt' : 'green')} style={{ marginLeft: 4 }}>{sign(cur?.dIn ?? 0)}</b></span>
                  <span className="chip" style={{ padding: '3px 9px' }}>saída <b className={'num ' + ((cur?.dOut ?? 0) > 0 ? 'redt' : 'green')} style={{ marginLeft: 4 }}>{sign(cur?.dOut ?? 0)}</b></span>
                </div>
                <div className="row gap8" style={{ marginTop: 11 }}>
                  <button className="chip" onClick={replayCorner}><Icon n="play" s={11} /> Replay</button>
                  <button className="chip" onClick={() => cur && openSegment(cur.n)}><Icon n="telem" s={12} /> Abrir trecho na Telemetry</button>
                </div>
              </>
            ) : (
              <>
                <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '9px 0 0' }}>
                  {curSec && curSec.d > 0
                    ? 'A média perde para a sua melhor volta neste setor — as curvas dele estão no minimapa (pulsos vermelhos = maiores perdas).'
                    : 'Setor consistente: a média anda junto da sua melhor volta aqui.'}
                </p>
                <div className="row gap8" style={{ marginTop: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
                  <span className="chip" style={{ padding: '3px 9px' }}>melhor <b className="num" style={{ marginLeft: 4 }}>{curSec?.ref.toFixed(3)}</b></span>
                  <span className="chip" style={{ padding: '3px 9px' }}>média <b className="num" style={{ marginLeft: 4 }}>{curSec?.media.toFixed(3)}</b></span>
                  <span className="chip" style={{ padding: '3px 9px' }}>curvas <b className="num" style={{ marginLeft: 4 }}>{m.rows.filter(r => r.sector === curSec?.id).length}</b></span>
                </div>
              </>
            )}
          </div>

          {/* minimapa com curvas-sonar (hover = perda; clique = abre o trecho) */}
          <MiniTrackMap pair={m.pair} active={segView ? active : null}
            corners={m.rows.map(r => ({ n: r.n, apex: r.apex, d: r.d }))}
            onPick={openSegment} carDotRef={el => { mmDot.current = el }}
            title={m.genericos ? 'Setores genéricos' : 'Setores oficiais'} />
        </InteractiveTrack>
      </div>

      {/* scrubber */}
      <div style={{ marginTop: 12 }}>
        <div className="tp-scrub card">
          <button className={'tp-play' + (playing ? ' on' : '')} onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg> : <Icon n="play" s={14} fill="currentColor" />}
          </button>
          <b className="num tp-clock" ref={clockRef}>{fmtClock(t0 * m.lapSecs)}</b>
          <div className="tp-track-bar" ref={barRef} onPointerDown={startDragBar}>
            <div className="tp-fill" ref={fillRef} style={{ width: '100%', transform: `scaleX(${t0})`, transformOrigin: 'left', willChange: 'transform' }} />
            {sectors.map((s, si) => <span key={si} className="tp-tick" style={{ left: s * 100 + '%' }} />)}
            <span className="tp-knob" ref={knobRef} style={{ left: 0, willChange: 'transform' }} />
          </div>
          <div className="tp-readout">
            <span className="dim">Δ</span> <b className="num" ref={deltaRef}>+0.000</b>
            <span className="dim" style={{ marginLeft: 12 }}>SPD</span> <b className="num"><span ref={spdRef}>0</span><i style={{ fontStyle: 'normal', color: 'var(--ink-3)', fontSize: 10 }}> km/h</i></b>
          </div>
        </div>
      </div>
    </div>
  )
}
