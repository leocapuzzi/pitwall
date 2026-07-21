import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PointerEvent as RPointerEvent } from 'react'
import Icon from '../components/Icon'
import SlideSeg from '../components/SlideSeg'
import DriverPod from '../components/DriverPod'
import InteractiveTrack, { type TrackHandle } from '../components/InteractiveTrack'
import { useSession } from '../lib/useSession'
import { parseIbtName } from '../components/SessionMenu'
import { LapTable } from './Stint'
import { projectTrackPair, deltaGradientSegments, type TrackPair, type LineSegment } from '../lib/track'
import { parseLap, fmtClock } from '../lib/fmt'
import { getLaps, getLap, getG61Laps, getG61Lap, type Payload, type Channels, type LapsIndex, type LapData, type SessionInfo, type G61LapsIndex } from '../lib/api'

// Comparison fullmap (padrão GO Fast). Por padrão: A = MÉDIA vs B = SUA MELHOR da
// sessão atual; o picker (fluxo B do design handoff) deixa escolher QUALQUER volta
// p/ cada lado — inclusive de outra sessão da MESMA pista (grid comum do backend).
// Mapa = fundo (linha gradiente por delta + fantasma), pods ao vivo, resumo A/Δ/B +
// setores em vidro à esquerda, painel à direita com delta acumulado + canais A vs B
// e o player embutido.

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
// Um LADO da comparação (A = lenta/linha cheia; B = rápida/referência tracejada)
interface Side {
  label: string; sub?: string; time: number; ch: Channels
  timeArr: number[] | null            // tempo até cada ponto do grid
  line: { x: number[]; y: number[] } | null
  sectors: number[]
}
interface Model {
  pair: TrackPair; segs: LineSegment[]; chans: Chan[]; secRows: SecRow[]
  A: Side; B: Side; totalD: number; delta: number[]
  dLine: string; dArea: string; dNorm: number[]
  tA: number[] | null; tB: number[] | null; lengthM: number; hasLineB: boolean
}

// Lados padrão da sessão: A = média das limpas, B = sua melhor.
function defaultSides(p: Payload): { A: Side; B: Side } {
  const st = p.sectorTimes || { labels: [], ref: [], media: [], genericos: true }
  const bSecs = parseLap(p.contexto.suaMelhor)
  const totalD = p.delta.length ? p.delta[p.delta.length - 1] : 0
  const clean = (p.laps || []).filter(l => l.clean)
  const aSecs = clean.length ? clean.reduce((a, l) => a + l.t, 0) / clean.length : bSecs + totalD
  const N = p.delta.length
  const tB = p.ref_time?.length === N ? p.ref_time : null
  return {
    A: {
      label: p.contexto.referencia || 'Average', time: aSecs, ch: p.media,
      timeArr: tB ? tB.map((v, i) => v + (p.delta[i] || 0)) : null,
      line: p.racing_line_b ?? null, sectors: st.media,
    },
    B: {
      label: 'Your best', time: bSecs, ch: p.ref,
      timeArr: tB, line: p.racing_line, sectors: st.ref,
    },
  }
}

// Volta escolhida no picker -> lado da comparação.
function sideFromLap(d: LapData): Side {
  // Volta de referência do Garage61: rotula pelo piloto (colega de equipe).
  if (d.source === 'garage61') {
    return {
      label: d.driver || 'Reference', sub: 'Garage61', time: d.t, ch: d.ch,
      timeArr: d.time?.length ? d.time : null, line: d.line, sectors: d.sectors || [],
    }
  }
  const pi = parseIbtName(d.arquivo)
  return {
    label: `Lap ${d.n}`, sub: pi.when ?? d.arquivo, time: d.t, ch: d.ch,
    timeArr: d.time?.length ? d.time : null, line: d.line, sectors: d.sectors || [],
  }
}

function buildModel(p: Payload, A: Side, B: Side): Model {
  const pair = projectTrackPair(p.track, B.line ?? p.racing_line, p.track_edges, A.line ?? p.racing_line_b)
  const N = p.delta.length
  // Delta acumulado A−B: dos tempos por ponto quando há (sempre, com payload novo);
  // nos defaults isso reproduz p.delta ao milésimo (tA−tB = delta do backend).
  const delta = (A.timeArr && B.timeArr && A.timeArr.length === N && B.timeArr.length === N)
    ? A.timeArr.map((v, i) => +(v - B.timeArr![i]).toFixed(3))
    : p.delta
  const a = A.ch, b = B.ch
  const allS = b.speed.concat(a.speed)
  const smin = Math.min(...allS), smax = Math.max(...allS)
  const NRM = (arr: number[]) => arr.map(v => clamp01((v - smin) / ((smax - smin) || 1)))
  const N01 = (arr: number[]) => arr.map(v => clamp01(v / 100))
  const chans: Chan[] = [
    { kind: 'speed', name: 'SPEED', color: 'var(--cyan)', unit: ' km/h', main: NRM(a.speed), ghost: NRM(b.speed), fmA: i => Math.round(a.speed[i]), fmB: i => Math.round(b.speed[i]), line: '', gline: '', area: '' },
    { kind: 'throttle', name: 'THROTTLE', color: 'var(--accent)', unit: '%', main: N01(a.throttle), ghost: N01(b.throttle), fmA: i => Math.round(a.throttle[i]), fmB: i => Math.round(b.throttle[i]), line: '', gline: '', area: '' },
    { kind: 'brake', name: 'BRAKE', color: 'var(--red)', unit: '%', main: N01(a.brake), ghost: N01(b.brake), fmA: i => Math.round(a.brake[i]), fmB: i => Math.round(b.brake[i]), line: '', gline: '', area: '' },
  ]
  chans.forEach(c => { c.line = linePath(c.main); c.gline = linePath(c.ghost); c.area = c.line + ` L${W},${H} L0,${H} Z` })

  const dmax = Math.max(0.05, ...delta.map(v => Math.abs(v)))
  const dNorm = delta.map(v => clamp01(0.5 - (v / (2 * dmax)) * 0.45 * 2))
  const dLine = linePath(dNorm)
  const dArea = dLine + ` L${W},${H} L0,${H} Z`

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
    const av = A.sectors[i] || 0, bv = B.sectors[i] || 0
    return { s: lb, a: av, b: bv, d: +(av - bv), focusN }
  })

  const totalD = delta.length ? delta[delta.length - 1] : 0
  return {
    pair, segs: deltaGradientSegments(pair.racing.pts, delta), chans, secRows,
    A, B, totalD, delta, dLine, dArea, dNorm,
    tA: A.timeArr, tB: B.timeArr,
    lengthM: p.eixoDist?.length ? p.eixoDist[p.eixoDist.length - 1] : 0,
    hasLineB: !!(A.line ?? p.racing_line_b)?.x?.length,
  }
}

// ——— PICKER (fluxo B do design handoff): sessão -> tabela de voltas -> Select ———
function LapPicker({ side, payload, sessions, current, onApply, onDefault, onClose }: {
  side: 'A' | 'B'; payload: Payload; sessions: SessionInfo[]; current: string | null
  onApply: (d: LapData) => void; onDefault: () => void; onClose: () => void
}) {
  const ctx = payload.contexto
  // só sessões do MESMO carro+pista (regra do projeto), pelo nome do arquivo
  const me = parseIbtName(ctx.arquivo || '')
  const compat = useMemo(() => sessions.filter(s => {
    const pi = parseIbtName(s.file)
    return pi.track === me.track && pi.car === me.car
  }), [sessions, me.track, me.car])
  const [path, setPath] = useState<string>(current || compat[0]?.path || '')
  const [idx, setIdx] = useState<LapsIndex | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [src, setSrc] = useState<'local' | 'g61'>('local')
  const [g61, setG61] = useState<G61LapsIndex | null>(null)

  useEffect(() => {
    if (src !== 'local' || !path) return
    let cancel = false
    setBusy(true); setErr(null); setIdx(null)
    getLaps(path)
      .then(r => { if (!cancel) setIdx(r) })
      .catch(e => { if (!cancel) setErr(e?.message || 'Failed to list laps') })
      .finally(() => { if (!cancel) setBusy(false) })
    return () => { cancel = true }
  }, [path, src])

  // Voltas de referência do Garage61 (você + colegas), por pista+carro da sessão.
  useEffect(() => {
    if (src !== 'g61' || ctx.trackId == null) return
    let cancel = false
    setBusy(true); setErr(null); setG61(null)
    getG61Laps(ctx.trackId, ctx.carId)
      .then(r => { if (!cancel) setG61(r) })
      .catch(e => { if (!cancel) setErr(e?.message || 'Failed to fetch from Garage61') })
      .finally(() => { if (!cancel) setBusy(false) })
    return () => { cancel = true }
  }, [src, ctx.trackId, ctx.carId])

  const pickG61 = async (row: { id: string }) => {
    setBusy(true); setErr(null)
    try { onApply(await getG61Lap(row.id, ctx.trackId ?? null, payload.setores)) }
    catch (e: any) { setErr(e?.message || 'Failed to load the lap'); setBusy(false) }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const wrongTrack = !!(idx && ctx.trackId != null && idx.trackId != null && String(idx.trackId) !== String(ctx.trackId))
  const bestRow = idx?.laps.filter(l => l.valid).reduce<{ n: number; t: number } | null>((acc, l) => (!acc || l.t < acc.t ? { n: l.n, t: l.t } : acc), null)
  const nSec = idx?.laps.find(l => l.s?.length)?.s.length || (payload.setores?.length || 0)
  const bestSec = Array.from({ length: nSec }, (_, si) => {
    const vals = (idx?.laps || []).filter(l => l.valid && l.s?.[si] != null).map(l => l.s[si])
    return vals.length ? Math.min(...vals) : NaN
  })
  const pick = async (i: number) => {
    const l = idx?.laps[i]; if (!l || wrongTrack) return
    setBusy(true); setErr(null)
    try { onApply(await getLap(path, l.n)) }
    catch (e: any) { setErr(e?.message || 'Failed to load the lap'); setBusy(false) }
  }

  return createPortal(
    <div className="pw-modal" onClick={onClose}>
      <div className="pw-modalcard pw-glass2 pw-pickcard" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="pw-modalhead">
          <span className="mic"><Icon n="telem" s={18} /></span>
          <b className="ttl">Choose lap {side}</b>
          <button className="pw-modalx" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="pw-modalcar">
          <span className="cbadge" style={{ width: 38, height: 38 }}><Icon n="car" s={18} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b style={{ fontSize: 13.5, fontWeight: 800 }}>{idx?.carro || ctx.carro}</b>
            <div className="muted" style={{ fontSize: 12 }}>{(src === 'g61' ? g61?.track : idx?.pista) || ctx.pista}</div>
          </div>
          {src === 'local'
            ? <select className="pw-picksess" value={path} onChange={e => setPath(e.target.value)} aria-label="Session">
                {compat.map(s => {
                  const pi = parseIbtName(s.file)
                  return <option key={s.path} value={s.path}>{(pi.when || s.file) + (s.path === current ? ' · current' : '')}</option>
                })}
              </select>
            : <span className="muted" style={{ fontSize: 12 }}>Best lap per driver</span>}
        </div>
        <div style={{ padding: '0 14px 6px' }}>
          <SlideSeg options={['Local sessions', 'Garage61 (team)']}
            value={src === 'local' ? 'Local sessions' : 'Garage61 (team)'}
            onChange={v => setSrc(v === 'Garage61 (team)' ? 'g61' : 'local')} />
        </div>
        <div className="pw-pickbody">
          {busy && <div className="pw-pickmsg">{src === 'g61' ? 'Fetching from Garage61…' : 'Loading laps…'}</div>}
          {!busy && err && <div className="pw-pickmsg redt">{err}</div>}
          {!busy && !err && src === 'local' && wrongTrack && <div className="pw-pickmsg redt">This session is from ANOTHER track — you can only compare laps from the same track.</div>}
          {!busy && !err && src === 'local' && idx && !wrongTrack && (
            idx.laps.length
              ? <LapTable laps={idx.laps} bestN={bestRow?.n} bestT={bestRow?.t} bestSec={bestSec} nSec={nSec} onSel={pick} />
              : <div className="pw-pickmsg">Session has no laps with a completed time.</div>
          )}
          {!busy && !err && src === 'g61' && g61 && (
            g61.laps.length
              ? <div className="pw-g61list">
                  {g61.laps.map(l => (
                    <button key={l.id} className="pw-g61row" disabled={!l.telemetry} onClick={() => l.telemetry && pickG61(l)}
                      title={l.telemetry ? 'Use this lap' : 'No visible telemetry (driver without Pro)'}>
                      <span className="pw-g61drv">{l.driver}</span>
                      <b className="num">{fmtClock(l.lapTime)}</b>
                      {l.clean ? <span className="pw-g61tag ok">clean</span> : <span className="pw-g61tag">dirty</span>}
                      {!l.telemetry && <span className="pw-g61tag">no telemetry</span>}
                    </button>
                  ))}
                </div>
              : <div className="pw-pickmsg">No reference lap for this car + track on Garage61.</div>
          )}
        </div>
        <div className="pw-pickfoot">
          <button className="pw-set-reset" onClick={onDefault}>
            Use default ({side === 'A' ? 'average of clean laps' : 'your best'})
          </button>
          <span className="pw-set-note">Click a lap to use it as {side}</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function Comparison() {
  const { payload, loading, error, sessions, current } = useSession()
  const [lapA, setLapA] = useState<LapData | null>(null)
  const [lapB, setLapB] = useState<LapData | null>(null)
  const [picker, setPicker] = useState<'A' | 'B' | null>(null)
  const model = useMemo(() => {
    if (!payload) return null
    const d = defaultSides(payload)
    return buildModel(payload, lapA ? sideFromLap(lapA) : d.A, lapB ? sideFromLap(lapB) : d.B)
  }, [payload, lapA, lapB])
  const [playing, setPlaying] = useState(false)
  const [focusSec, setFocusSec] = useState<string | null>(null)
  const [mode, setMode] = useState('Time')
  const [camB, setCamB] = useState(false) // lock da câmera: false = volta B (rápida), true = volta A
  const modeRef = useRef(mode); modeRef.current = mode

  const tRef = useRef(0), raf = useRef(0)
  const modelRef = useRef<Model | null>(model); modelRef.current = model
  const trackRef = useRef<TrackHandle>(null)
  const stackRef = useRef<HTMLDivElement>(null), dplotRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const podA = useRef<HTMLDivElement>(null), podB = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null), knobRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef<HTMLElement>(null), deltaRef = useRef<HTMLElement>(null)
  const dValRef = useRef<HTMLElement>(null)
  const barW = useRef(0), lastText = useRef(0)
  const gapRef = useRef<HTMLElement>(null)
  interface RowEls { kind: string; w: number; h: number; main: number[]; cursor: HTMLElement | null; dot: HTMLElement | null; va: HTMLElement | null; vb: HTMLElement | null; fmA: (i: number) => string | number; fmB: (i: number) => string | number }
  interface PodEls { s: Channels; els: Record<string, HTMLElement | null> }
  const rows = useRef<RowEls[]>([])
  const pods = useRef<PodEls[]>([])
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
  // valor do array (ex.: tempo da volta) na fração de distância t, interpolado
  const sampleAt = (arr: number[], t: number) => {
    const f = Math.max(0, Math.min(arr.length - 1, t * (arr.length - 1)))
    const i = Math.floor(f), j = Math.min(arr.length - 1, i + 1)
    return arr[i] + (arr[j] - arr[i]) * (f - i)
  }

  const renderFrame = useCallback((tv: number, force = false) => {
    const m = modelRef.current; if (!m) return
    const N = m.delta.length; if (!N) return
    const f = Math.max(0, Math.min(N - 1, tv * (N - 1)))
    const i0 = Math.floor(f), i1 = Math.min(N - 1, i0 + 1), fr = f - i0
    const idx = fr < 0.5 ? i0 : i1
    trackRef.current?.setT(tv, (m.B.ch.brake[idx] || 0) > 18)
    let gapM: number | null = null
    if (m.tB && m.tA) {
      const tau = lerp(m.tB[i0], m.tB[i1], fr)
      const dB = invTime(tau, m.tA)
      gapM = (tv - dB) * m.lengthM
      trackRef.current?.setT2(modeRef.current === 'Time' ? dB : tv)
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
    for (const r of rows.current) {
      if (r.va) r.va.textContent = String(r.fmA(idx))
      if (r.vb) r.vb.textContent = String(r.fmB(idx))
    }
    for (const pod of pods.current) {
      const e = pod.els, s = pod.s
      if (e.thr) e.thr.textContent = Math.round(s.throttle[idx] || 0) + '%'
      if (e.brk) e.brk.textContent = Math.round(s.brake[idx] || 0) + '%'
      if (e.spd) e.spd.textContent = String(Math.round(s.speed[idx] || 0))
      if (e.gear) e.gear.textContent = String(Math.round(s.gear[idx] || 0))
      if (e.rpm) e.rpm.textContent = String(Math.round(s.rpm[idx] || 0))
    }
    if (clockRef.current) clockRef.current.textContent = fmtClock(m.tA ? sampleAt(m.tA, tv) : tv * m.A.time)
    const dv = lerp(m.delta[i0], m.delta[i1], fr)
    if (dValRef.current) dValRef.current.textContent = sign(dv, 3)
    if (deltaRef.current) {
      deltaRef.current.textContent = sign(dv, 3)
      const cls = 'num ' + (dv >= 0 ? 'redt' : 'green')
      if (deltaRef.current.className !== cls) deltaRef.current.className = cls
    }
    if (gapRef.current) gapRef.current.textContent = gapM == null ? '—' : (gapM >= 0 ? '+' : '−') + Math.abs(gapM).toFixed(0) + ' m'
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
    const podOf = (el: HTMLDivElement | null, s?: Channels): PodEls[] => {
      if (!el || !s) return []
      const q = (k: string) => el.querySelector(`[data-f="${k}"]`) as HTMLElement | null
      return [{ s, els: { thr: q('thr'), thrbar: q('thrbar'), brk: q('brk'), brkbar: q('brkbar'), spd: q('spd'), gear: q('gear'), rpm: q('rpm'), wheel: q('wheel'), steerarc: q('steerarc') } }]
    }
    pods.current = [...podOf(podA.current, model?.B.ch), ...podOf(podB.current, model?.A.ch)]
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
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now
      const mm = modelRef.current
      let nt: number
      if (mm?.tB && mm.tB.length > 1) {
        // tempo REAL da volta B (o carro principal) → distância: freia nas curvas
        const total = mm.tB[mm.tB.length - 1]
        let tau = sampleAt(mm.tB, tRef.current) + dt
        if (tau >= total) tau -= total
        nt = invTime(tau, mm.tB)
      } else { nt = tRef.current + dt / (mm?.A.time || 90); if (nt >= 1) nt -= 1 }
      tRef.current = nt; renderFrame(nt); raf.current = requestAnimationFrame(loop)
    }
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

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Loading session…</div>
  if (error || !model || !payload) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'No data'}</div>

  const m = model, ctx = payload.contexto
  const t0 = tRef.current
  const focusRow = focusSec ? m.secRows.find(r => r.s === focusSec) : null
  const sectors = (payload.setores || []).filter(s => s > 0.001 && s < 0.999)
  const maxAbsSec = Math.max(0.05, ...m.secRows.map(r => Math.abs(r.d)))

  return createPortal(
    <div className="pw-maplayer pw-tel">
      <InteractiveTrack ref={trackRef} trackGeom={m.pair.track} racingGeom={m.pair.racing} racingGeomB={m.pair.racingB}
        racingSegments={m.segs} edges={m.pair.edges} unitPerM={m.pair.unitPerM}
        initialT={t0} corners={payload.corners} hideCorners follow followX={0.22} followCar={camB ? 'B' : 'A'} initialZoom={16} zoomSlider
        activeCorner={focusRow?.focusN ?? null} focusCorner={focusRow ? focusRow.focusN : null} height={440}>

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
              <span><Icon n="telem" s={12} sw={2} /> {ctx.voltasLimpas} clean</span>
            </div>
          </div>
          {/* resumo A / Δ / B (chevron abre o picker de volta de cada lado) */}
          <div className="pw-segnav pw-glass2">
            <div className="pw-segrows" style={{ marginTop: 0 }}>
              <div className="row between">
                <span className="pw-sidelbl" style={{ color: 'var(--accent)', fontWeight: 600, minWidth: 0 }}>A · {m.A.label}{m.A.sub && <i className="pw-sidewhen">{m.A.sub}</i>}</span>
                <span className="row center gap6" style={{ flex: 'none' }}>
                  <b className="num">{fmtClock(m.A.time)}</b>
                  <button className="pw-sidechg" onClick={() => setPicker('A')} title="Change lap A" aria-label="Change lap A"><Icon n="chevD" s={12} sw={2.4} /></button>
                </span>
              </div>
              <div className="row between">
                <span className="dim" style={{ fontWeight: 600 }}>Δ total</span>
                <span className="row center gap6">
                  {(lapA || lapB) && <button className="pw-sidereset" onClick={() => { setLapA(null); setLapB(null) }} title="Back to default (average vs best)">↺ default</button>}
                  <b className={'num ' + (m.totalD >= 0 ? 'redt' : 'green')}>{sign(m.totalD)}s</b>
                </span>
              </div>
              <div className="row between">
                <span className="purple pw-sidelbl" style={{ fontWeight: 600, minWidth: 0 }}>B · {m.B.label}{m.B.sub && <i className="pw-sidewhen">{m.B.sub}</i>}</span>
                <span className="row center gap6" style={{ flex: 'none' }}>
                  <b className="num purple">{fmtClock(m.B.time)}</b>
                  <button className="pw-sidechg" onClick={() => setPicker('B')} title="Change lap B" aria-label="Change lap B"><Icon n="chevD" s={12} sw={2.4} /></button>
                </span>
              </div>
            </div>
          </div>
          {/* setores A vs B (clique foca a pior curva do setor no mapa) */}
          <div className="pw-seccmp pw-glass2" style={{ marginTop: 'auto', width: 286 }}>
            <div className="row between center" style={{ marginBottom: 6 }}>
              <span className="lbl">Sector Comparison</span>
              <span className="muted" style={{ fontSize: 10.5 }}>click to focus the map</span>
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

        {/* PODS ao vivo */}
        <div className="pw-pods">
          <DriverPod podRef={podA} on name={m.B.label} time={fmtClock(m.B.time)} sub="B" />
          <DriverPod podRef={podB} name={m.A.label} time={fmtClock(m.A.time)} sub="A" />
        </div>

        {/* PAINEL: delta acumulado + canais A vs B + player */}
        <div className="pw-telpanel pw-glass2">
          <div className="pw-telhead">
            <span className="lbl">Cumulative delta · A vs B</span>
            <div className="row center gap8" style={{ color: 'var(--ink-3)', fontSize: 11.5, fontWeight: 600 }}>
              <b className="num redt" style={{ fontSize: 14 }}><span ref={dValRef}>{sign(m.totalD, 3)}</span><i style={{ fontStyle: 'normal', color: 'var(--ink-3)', fontWeight: 500, fontSize: 10.5 }}> s</i></b>
              <span className="row center gap6"><span className="dot acc"></span>A · {m.A.label}</span>
              <span className="row center gap6"><span className="leg-dash"></span>B · {m.B.label}</span>
            </div>
          </div>
          <div ref={dplotRef} style={{ height: 96, position: 'relative', flex: 'none', borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.04)' }}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="tp-svg">
              <defs><linearGradient id="cmpdg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--purple)" stopOpacity=".30" /><stop offset="1" stopColor="var(--purple)" stopOpacity="0" /></linearGradient></defs>
              <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.14)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
              <path d={m.dArea} fill="url(#cmpdg)" />
              <path d={m.dLine} fill="none" stroke="var(--purple)" className="tp-mainline" />
            </svg>
            {sectors.map((s, si) => <span key={si} style={{ position: 'absolute', top: 0, bottom: 0, left: s * 100 + '%', width: 1, background: 'rgba(255,255,255,.14)', pointerEvents: 'none' }} />)}
            <span className="pw-chlabel">DELTA</span>
            <span className="tp-cursor" data-cursor style={{ left: 0, willChange: 'transform' }} />
            <span className="tp-dot" data-dot style={{ left: 0, top: 0, background: 'var(--purple)', willChange: 'transform', transform: 'translate3d(0,0,0) translate(-50%,-50%)' }} />
          </div>
          <div className="pw-chstack" ref={stackRef} style={{ marginTop: 7 }}>
            {m.chans.map(c => {
              const N = c.main.length, idx0 = Math.min(N - 1, Math.round(t0 * (N - 1)))
              return (
                <div className="cmp-chrow pw-ch" key={c.kind} data-kind={c.kind} style={{ display: 'flex', gridTemplateColumns: 'none', padding: 0 }}>
                  <div className="cmp-chplot" style={{ cursor: 'crosshair', flex: 1, position: 'relative' }}
                    onPointerDown={(e) => { const el = e.currentTarget as HTMLElement; const r = el.getBoundingClientRect(); scrub((e.clientX - r.left) / r.width) }}
                    onPointerMove={(e) => { if (playing) return; const el = e.currentTarget as HTMLElement; const r = el.getBoundingClientRect(); tRef.current = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); renderFrame(tRef.current, true) }}>
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="tp-svg">
                      <defs><linearGradient id={'cg-' + c.kind} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c.color} stopOpacity=".26" /><stop offset="1" stopColor={c.color} stopOpacity="0" /></linearGradient></defs>
                      <path d={c.area} fill={'url(#cg-' + c.kind + ')'} />
                      <path d={c.gline} className="pw-ghostline" />
                      <path d={c.line} fill="none" stroke={c.color} className="tp-mainline" />
                    </svg>
                    {sectors.map((s, si) => <span key={si} style={{ position: 'absolute', top: 0, bottom: 0, left: s * 100 + '%', width: 1, background: 'rgba(255,255,255,.12)', pointerEvents: 'none' }} />)}
                    <span className="pw-chlabel">{c.name}</span>
                    <span className="cmp-chvals" style={{ position: 'absolute', right: 8, top: 6 }}>
                      <b className="num" style={{ color: c.color }}><span data-va>{c.fmA(idx0)}</span><i>{c.unit}</i></b>
                      <b className="num purple"><span data-vb>{c.fmB(idx0)}</span><i>{c.unit}</i></b>
                    </span>
                    <span className="tp-cursor" data-cursor style={{ left: 0, willChange: 'transform' }} />
                    <span className="tp-dot" data-dot style={{ left: 0, top: 0, background: c.color, willChange: 'transform', transform: 'translate3d(0,0,0) translate(-50%,-50%)' }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="pw-telscrub">
            <div className="pw-progress" ref={barRef} onPointerDown={startDragBar}>
              <div className="tp-fill" ref={fillRef} style={{ width: '100%', transform: `scaleX(${t0})`, transformOrigin: 'left', willChange: 'transform' }} />
              {sectors.map((s, si) => <span key={si} className="tp-tick" style={{ left: s * 100 + '%' }} />)}
              <span className="tp-knob" ref={knobRef} style={{ left: 0, willChange: 'transform' }} />
            </div>
            <div className="pw-telctrl">
              <button className={'tp-play' + (playing ? ' on' : '')} onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg> : <Icon n="play" s={14} fill="currentColor" />}
              </button>
              <b className="num tp-clock" ref={clockRef}>{fmtClock(t0 * m.A.time)}</b>
              <div className="pw-delta">
                <span className="dim">Delta:</span> <b className="num redt" ref={deltaRef}>+0.000</b>
                <span className="dim">↔</span> <b className="num" ref={gapRef} style={{ color: 'var(--red)' }}>+0 m</b>
              </div>
              <button className={'pw-switch' + (camB ? ' on' : '')} title="Camera: switch between the two cars" onClick={() => setCamB(v => !v)} aria-label="Switch camera"><i /></button>
              <SlideSeg options={['Time', 'Distance']} value={mode} onChange={setMode} />
            </div>
          </div>
        </div>
      </InteractiveTrack>
      {picker && (
        <LapPicker side={picker} payload={payload} sessions={sessions} current={current}
          onApply={d => { (picker === 'A' ? setLapA : setLapB)(d); setPicker(null) }}
          onDefault={() => { (picker === 'A' ? setLapA : setLapB)(null); setPicker(null) }}
          onClose={() => setPicker(null)} />
      )}
    </div>,
    document.body
  )
}
