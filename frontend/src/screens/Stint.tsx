import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../components/Icon'
import DriverPod from '../components/DriverPod'
import { useSession } from '../lib/useSession'
import { fmtClock, parseLap } from '../lib/fmt'
import type { Channels, LapRow, Payload } from '../lib/api'

// Stint Overview no padrão GO Fast (prints de referência 2026-06-11):
// header da sessão + pods ao vivo (volta de referência em loop; clique no pod abre o
// popup "Comparison" com a tabela do stint), card principal em vidro com KPIs /
// evolução do tempo / tabela de voltas com setores, e selector de stints à direita.
// Stints são REAIS: separados pelas voltas de pit (out lap abre stint novo).
// Sem mapa nesta tela — o vidro distorce o fundo de gradientes (.pw-pagebg).

const fmtT = (sec: number) => { const m = Math.floor(sec / 60); return String(m).padStart(2, '0') + ':' + (sec - m * 60).toFixed(3).padStart(6, '0') }
const fmtDur = (sec: number) => { const m = Math.floor(sec / 60); return String(m).padStart(2, '0') + ':' + String(Math.round(sec - m * 60)).padStart(2, '0') }
const fmtDelta = (d: number) => (d < 0 ? '−' : '+') + Math.abs(d).toFixed(3).padStart(6, '0')

interface StintStats {
  k: number; laps: LapRow[]
  best: LapRow | null; bestSec: number[]; nSec: number; optimal: number | null
  avg: number | null; sigma: number | null; consist: number | null
  fuelTotal: number | null; fuelPerLap: number | null
}
interface Model { stints: StintStats[]; trackTime: number; totalLaps: number; avgClean: number | null; fuelFim: number | null }

function statsOf(k: number, laps: LapRow[]): StintStats {
  const valid = laps.filter(l => l.valid)
  const clean = laps.filter(l => l.clean)
  const base = clean.length ? clean : valid
  const best = valid.length ? valid.reduce((a, b) => (b.t < a.t ? b : a), valid[0]) : null
  const nSec = Math.max(0, ...valid.map(l => l.s?.length || 0))
  const bestSec = Array.from({ length: nSec }, (_, i) =>
    Math.min(...valid.filter(l => (l.s?.length || 0) > i).map(l => l.s[i])))
  const optimal = nSec ? bestSec.reduce((a, b) => a + b, 0) : null
  const avg = base.length ? base.reduce((a, l) => a + l.t, 0) / base.length : null
  const sigma = avg != null ? Math.sqrt(base.reduce((a, l) => a + (l.t - avg) ** 2, 0) / base.length) : null
  const consist = sigma != null ? Math.max(0, Math.min(100, 100 - sigma * 40)) : null
  const comFuel = laps.filter(l => l.fuel != null && !l.pit)
  const fuelPerLap = comFuel.length ? comFuel.reduce((a, l) => a + (l.fuel || 0), 0) / comFuel.length : null
  const fuelTotal = comFuel.length ? laps.reduce((a, l) => a + (l.fuel || 0), 0) : null
  return { k, laps, best, bestSec, nSec, optimal, avg, sigma, consist, fuelTotal, fuelPerLap }
}

function buildModel(p: Payload): Model | null {
  const laps = (p.laps || []).filter(l => l.t > 0)
  if (!laps.length) return null
  const groups: LapRow[][] = []
  let cur: LapRow[] = []
  for (const l of laps) {
    if (l.pit && cur.length) { groups.push(cur); cur = [] }
    cur.push(l)
  }
  if (cur.length) groups.push(cur)
  const stints = groups.map((g, i) => statsOf(i + 1, g))
  if (!stints.some(s => s.best)) return null
  const clean = laps.filter(l => l.clean)
  return {
    stints,
    trackTime: laps.reduce((a, l) => a + l.t, 0),
    totalLaps: laps.length,
    avgClean: clean.length ? clean.reduce((a, l) => a + l.t, 0) / clean.length : null,
    fuelFim: p.contexto?.fuelFim ?? null,
  }
}

function lapTip(l: LapRow, isBest: boolean) {
  const parts = [l.valid ? 'válida' : 'inválida']
  if (l.clean) parts.push('limpa')
  if (l.pit) parts.push('pit/out lap')
  if (isBest) parts.push('melhor do stint')
  if (l.fuel != null) parts.push(l.fuel.toFixed(2) + ' L')
  return 'Volta ' + l.n + ' · ' + parts.join(' · ')
}

// Tabela de voltas (tela e popup compartilham; o popup vai sem a coluna de fuel;
// a Comparison reusa no picker de voltas)
export function LapTable({ laps, bestN, bestT, bestSec, nSec, withFuel, sel, hover, onSel, onHover }: {
  laps: LapRow[]; bestN?: number; bestT?: number; bestSec: number[]; nSec: number
  withFuel?: boolean
  sel?: number | null; hover?: number | null
  onSel?: (i: number) => void; onHover?: (i: number | null) => void
}) {
  const cols = (withFuel ? '40px 118px 96px 78px 40px' : '46px 130px 104px 44px') + ` repeat(${Math.max(1, nSec)}, minmax(62px, 1fr))`
  return (
    <div className="pw-ltable">
      <div className="pw-lhead" style={{ gridTemplateColumns: cols }}>
        <span>L</span>
        <span className="ic"><Icon n="clock" s={13} sw={2} /></span>
        <span>Delta</span>
        {withFuel && <span className="ic"><Icon n="fuel" s={13} sw={2} /></span>}
        <span className="ic"><Icon n="info" s={13} sw={2} /></span>
        {Array.from({ length: nSec }, (_, i) => <span key={i}>S{i + 1}</span>)}
      </div>
      <div className="pw-lbody">
        {laps.map((l, i) => {
          const isBest = bestN != null && l.n === bestN
          return (
            <button key={l.n} type="button"
              className={'pw-lrow' + (isBest ? ' best' : '') + (sel === i ? ' on' : '') + (hover === i ? ' hov' : '') + (onSel ? '' : ' ro')}
              style={{ gridTemplateColumns: cols }}
              onClick={onSel ? () => onSel(i) : undefined}
              onPointerEnter={onHover ? () => onHover(i) : undefined}
              onPointerLeave={onHover ? () => onHover(null) : undefined}>
              <span className="num ln">{l.n}</span>
              <b className={'num tt' + (isBest ? ' green' : '')}>{fmtT(l.t)}</b>
              {!l.valid
                ? <span className="dd redt" style={{ fontFamily: 'var(--font-ui)', fontWeight: 600 }}>Invalid</span>
                : isBest || bestT == null
                  ? <span className="num dd">00.000</span>
                  : <span className="num dd redt">{fmtDelta(l.t - bestT)}</span>}
              {withFuel && <span className="num fu">{l.fuel != null ? l.fuel.toFixed(2) + ' L' : '—'}</span>}
              <span className="ic ii" title={lapTip(l, isBest)}><Icon n="info" s={14} sw={2} /></span>
              {Array.from({ length: nSec }, (_, si) => {
                const v = l.s?.[si]
                if (v == null) return <span key={si} className="num ss dim">—</span>
                const isBs = bestSec[si] != null && Math.abs(v - bestSec[si]) < 0.0005
                return <b key={si} className={'num ss' + (isBs ? ' purple' : '')}>{v.toFixed(3)}</b>
              })}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const W = 560, H = 200, PADX = 18, PADT = 16, PADB = 24

export default function Stint() {
  const { payload, loading, error } = useSession()
  const m = useMemo(() => (payload ? buildModel(payload) : null), [payload])
  const [stintSelRaw, setStintSel] = useState<number | null>(null)
  const [sel, setSel] = useState<number | null>(null)          // índice em st.laps
  const [hover, setHover] = useState<number | null>(null)
  const [showFuel, setShowFuel] = useState(false)
  const [cmpOpen, setCmpOpen] = useState(false)
  const [cmpMin, setCmpMin] = useState(false)

  // pods ao vivo: a volta de referência roda em loop (imperativo, padrão das telas de mapa)
  const payloadRef = useRef<Payload | null>(payload); payloadRef.current = payload
  const lapSecsRef = useRef(90)
  const podA = useRef<HTMLDivElement>(null), podB = useRef<HTMLDivElement>(null)
  interface PodEls { s: Channels; els: Record<string, HTMLElement | null> }
  const pods = useRef<PodEls[]>([])
  const tR = useRef(0), raf = useRef(0), lastText = useRef(0)

  const renderPods = useCallback((tv: number, force = false) => {
    const p = payloadRef.current; if (!p) return
    const N = p.ref.speed.length; if (!N) return
    const idx = Math.max(0, Math.min(N - 1, Math.round(tv * (N - 1))))
    for (const pod of pods.current) {
      const s = pod.s, e = pod.els
      const st = s.steer[idx] || 0
      if (e.wheel) e.wheel.style.transform = `rotate(${(-st).toFixed(1)}deg)`
      if (e.steerarc) {
        const len = Math.min(38, Math.abs(st) / 144 * 38)
        e.steerarc.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${(100 - len).toFixed(1)}`)
        e.steerarc.setAttribute('transform', st > 0 ? 'translate(32 0) scale(-1 1) rotate(-90 16 16)' : 'rotate(-90 16 16)')
      }
      const thr = Math.round(s.throttle[idx] || 0), brk = Math.round(s.brake[idx] || 0)
      if (e.thrbar) e.thrbar.style.transform = `scaleX(${Math.min(1, thr / 100)})`
      if (e.brkbar) e.brkbar.style.transform = `scaleX(${Math.min(1, brk / 100)})`
    }
    const now = performance.now()
    if (!force && now - lastText.current < 100) return
    lastText.current = now
    for (const pod of pods.current) {
      const s = pod.s, e = pod.els
      const thr = Math.round(s.throttle[idx] || 0), brk = Math.round(s.brake[idx] || 0)
      if (e.thr) e.thr.textContent = thr + '%'
      if (e.brk) e.brk.textContent = brk + '%'
      if (e.spd) e.spd.textContent = String(Math.round(s.speed[idx] || 0))
      if (e.gear) e.gear.textContent = String(Math.round(s.gear[idx] || 0))
      if (e.rpm) e.rpm.textContent = String(Math.round(s.rpm[idx] || 0))
    }
  }, [])

  useLayoutEffect(() => {
    const p = payload
    const podOf = (el: HTMLDivElement | null, s?: Channels): PodEls[] => {
      if (!el || !s) return []
      const q = (k: string) => el.querySelector(`[data-f="${k}"]`) as HTMLElement | null
      return [{ s, els: { thr: q('thr'), thrbar: q('thrbar'), brk: q('brk'), brkbar: q('brkbar'), spd: q('spd'), gear: q('gear'), rpm: q('rpm'), wheel: q('wheel'), steerarc: q('steerarc') } }]
    }
    pods.current = [...podOf(podA.current, p?.ref), ...podOf(podB.current, p?.media)]
    renderPods(tR.current, true)
  })
  useEffect(() => {
    let last = performance.now()
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now
      let nt = tR.current + dt / (lapSecsRef.current || 90); if (nt >= 1) nt -= 1
      tR.current = nt; renderPods(nt)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [renderPods])
  useEffect(() => {
    if (!cmpOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCmpOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cmpOpen])

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Carregando sessão…</div>
  if (error || !payload || !m) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'Sem voltas com tempo nesta sessão'}</div>

  const ctx = payload.contexto
  lapSecsRef.current = parseLap(ctx.suaMelhor)
  const defStint = Math.max(0, m.stints.findIndex(s => s.laps.some(l => l.best)))
  const stintSel = Math.min(stintSelRaw ?? defStint, m.stints.length - 1)
  const st = m.stints[stintSel]
  const bestIdx = st.best ? st.laps.findIndex(l => l.n === st.best!.n) : -1
  const selIdx = sel ?? bestIdx
  const active = hover ?? selIdx
  const bestSession = m.stints.flatMap(s => s.laps).find(l => l.best)
  const voltasRestantes = st.fuelPerLap && m.fuelFim != null && m.fuelFim > 0 ? Math.floor(m.fuelFim / st.fuelPerLap) : null

  // gráfico de evolução (voltas do stint; out laps clipadas no topo do domínio)
  const racing = (st.laps.filter(l => l.clean).length ? st.laps.filter(l => l.clean) : st.laps.filter(l => l.valid))
  const domain = racing.length ? racing : st.laps
  const lo = Math.min(...domain.map(l => l.t)) - 0.25
  const hi = Math.max(...domain.map(l => l.t)) + 0.25
  const x = (i: number) => PADX + (st.laps.length > 1 ? i / (st.laps.length - 1) : 0.5) * (W - PADX * 2)
  const y = (t: number) => { const c = Math.max(lo, Math.min(hi, t)); return PADT + (1 - (c - lo) / ((hi - lo) || 1)) * (H - PADT - PADB) }
  const pts = st.laps.map((l, i) => ({ i, l, cx: x(i), cy: y(l.t), clip: l.t > hi }))
  const linePath = pts.map((p, i) => (i ? 'L' : 'M') + p.cx.toFixed(1) + ',' + p.cy.toFixed(1)).join(' ')
  const areaPath = linePath + ` L${pts[pts.length - 1].cx},${H - PADB} L${pts[0].cx},${H - PADB} Z`
  const purplePath = bestIdx > 0 ? `M${pts[bestIdx - 1].cx.toFixed(1)},${pts[bestIdx - 1].cy.toFixed(1)} L${pts[bestIdx].cx.toFixed(1)},${pts[bestIdx].cy.toFixed(1)}` : null
  const optY = st.optimal != null ? y(st.optimal) : null

  const fuelTxt = st.fuelTotal != null && st.fuelPerLap != null
    ? `${st.fuelTotal.toFixed(2)}L − ${st.fuelPerLap.toFixed(2)}L/volta` : null

  return (
    <div className="tp-wrap pw-stint">
      {/* fundo sutil: dá "matéria" para o vidro distorcer (sem mapa nesta tela) */}
      <div className="pw-pagebg" aria-hidden><i className="g1" /><i className="g2" /><i className="g3" /></div>

      {/* topo: identidade da sessão + pods ao vivo */}
      <div className="pw-stinttop">
        <div className="pw-carinfo">
          <div className="row center gap10">
            <span className="cbadge" style={{ width: 42, height: 42 }}><Icon n="car" s={20} /></span>
            <div>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{ctx.carro}</b>
              <div className="muted" style={{ fontSize: 12 }}>{ctx.pista}</div>
            </div>
          </div>
          <div className="pw-carmeta">
            <span title="Tempo em pista (soma das voltas)"><Icon n="clock" s={12} sw={2} /> {fmtDur(m.trackTime)}</span>
            <span><Icon n="road" s={12} sw={2} /> {m.totalLaps} voltas</span>
            <span><Icon n="telem" s={12} sw={2} /> {ctx.voltasLimpas} limpas</span>
          </div>
        </div>
        <div className="pw-stintpods">
          <DriverPod podRef={podA} on name="L. Capuzzi" time={fmtT(parseLap(ctx.suaMelhor))} sub={`melhor · V${bestSession?.n ?? '—'}`} onOpen={() => { setCmpMin(false); setCmpOpen(true) }} />
          <DriverPod podRef={podB} name={ctx.referencia} time={m.avgClean != null ? fmtT(m.avgClean) : '—'} sub="média" />
        </div>
      </div>

      {/* corpo: rail | card principal | selector de stints */}
      <div className="pw-stintmain">
        <div className="pw-railcol">
          <div className="pw-rail pw-glass2 pw-stintrail">
            <button title="Focar a melhor volta" onClick={() => { if (bestIdx >= 0) setSel(bestIdx) }}><Icon n="flag" s={15} /></button>
            <button title="Abrir na Telemetry" onClick={() => window.dispatchEvent(new CustomEvent('pw:go', { detail: 'telemetry' }))}><Icon n="sliders" s={15} /></button>
            <button title="Combustível" onClick={() => setShowFuel(s => !s)}><Icon n="fuel" s={15} /></button>
          </div>
          {showFuel && (
            <div className="pw-fuelchip pw-glass2 pw-stintfuel">
              <Icon n="fuel" s={13} /> {st.fuelPerLap != null ? <>{st.fuelPerLap.toFixed(2)} L/volta{voltasRestantes != null ? ` · ~${voltasRestantes} voltas restantes` : ''}</> : 'sem dados de combustível'}
            </div>
          )}
        </div>

        <div className="pw-glass2 pw-stintcard">
          <div className="pw-sthead">
            <b className="pw-stttl">Stint {st.k}</b>
            <div className="pw-stmeta">
              <span><Icon n="flag" s={13} sw={2} /> {st.laps.length} voltas</span>
              {fuelTxt && <span><Icon n="fuel" s={13} sw={2} /> {fuelTxt}</span>}
            </div>
          </div>

          {/* KPIs */}
          <div className="pw-kpis">
            <div className="pw-kpi" style={{ ['--c' as string]: 'var(--accent)' }}>
              <span className="kt"><span className="pw-kico"><Icon n="clock" s={18} /></span><span className="kl">Fastest Lap</span></span>
              <b className="kv num">{st.best ? fmtT(st.best.t) : '—'}</b>
              <span className="ks">{st.best ? `volta ${st.best.n}` : 'sem volta válida'}</span>
            </div>
            <div className="pw-kpi" style={{ ['--c' as string]: 'var(--purple)' }}>
              <span className="kt"><span className="pw-kico"><Icon n="clock" s={18} /></span><span className="kl">Optimal Lap</span></span>
              <b className="kv num">{st.optimal != null ? fmtT(st.optimal) : '—'}</b>
              <span className="ks">{st.optimal != null && st.best ? `−${Math.max(0, st.best.t - st.optimal).toFixed(2)}s vs melhor` : 'sem setores'}</span>
            </div>
            <div className="pw-kpi" style={{ ['--c' as string]: 'var(--cyan)' }}>
              <span className="kt"><span className="pw-kico"><Icon n="telem" s={18} /></span><span className="kl">Average (limpas)</span></span>
              <b className="kv num">{st.avg != null ? fmtT(st.avg) : '—'}</b>
              <span className="ks">{st.sigma != null ? `σ ${st.sigma.toFixed(2)}s` : '—'}</span>
            </div>
            <div className="pw-kpi acc" style={{ ['--c' as string]: 'var(--accent)' }}>
              <span className="kt"><span className="pw-kico"><Icon n="fuel" s={18} /></span><span className="kl">Average Fuel Usage</span></span>
              <b className="kv num">{st.fuelPerLap != null ? st.fuelPerLap.toFixed(2) + ' L' : '—'}</b>
              <span className="ks">{st.fuelPerLap == null ? 'sem dados de combustível' : voltasRestantes != null ? `~${voltasRestantes} voltas de tanque` : 'por volta (sem pit)'}</span>
            </div>
          </div>

          {/* evolução do tempo de volta */}
          <div className="pw-stchart">
            <div className="row between center" style={{ marginBottom: 2 }}>
              <span className="lbl">Average Laptime</span>
              <div className="row center" style={{ gap: 12 }}>
                {st.consist != null && <span className="chip" style={{ padding: '3px 10px', fontSize: 11, cursor: 'default' }}>Consistência <b className="num" style={{ marginLeft: 5 }}>{st.consist.toFixed(0)}/100</b></span>}
                {st.optimal != null && <span className="row center gap6" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)' }}><span className="sp-key dash" style={{ borderColor: 'var(--purple)' }}></span>Ótima {fmtClock(st.optimal)}</span>}
              </div>
            </div>
            <div className="sp-plot" onPointerLeave={() => setHover(null)}>
              <span className="pw-ylab">Time</span>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                <defs><linearGradient id="spfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".16" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
                {optY != null && <line x1={PADX} x2={W - PADX} y1={optY} y2={optY} stroke="var(--purple)" strokeWidth="1.3" strokeDasharray="4 4" opacity=".55" vectorEffect="non-scaling-stroke" />}
                <path d={areaPath} fill="url(#spfill)" />
                <path d={linePath} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" shapeRendering="geometricPrecision" />
                {purplePath && <path d={purplePath} fill="none" stroke="var(--purple)" strokeWidth="2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" shapeRendering="geometricPrecision" />}
                {pts.map(p => <rect key={p.i} x={p.cx - W / st.laps.length / 2} y="0" width={W / st.laps.length} height={H} fill="transparent" style={{ cursor: 'pointer' }} onPointerEnter={() => setHover(p.i)} onClick={() => setSel(p.i)} />)}
              </svg>
              {pts[active] && <span className="sp-guide" style={{ left: pts[active].cx / W * 100 + '%' }}></span>}
              {pts.map(p => <span key={p.i} className={'sp-dot' + (!p.l.valid ? ' inv' : '') + (st.best && p.l.n === st.best.n ? ' best' : '') + (active === p.i ? ' on' : '')} style={{ left: p.cx / W * 100 + '%', top: (p.clip ? PADT : p.cy) / H * 100 + '%', opacity: p.clip ? 0.5 : 1 }}></span>)}
              {pts[active] && <span className="sp-tip" style={{ left: Math.min(90, Math.max(10, pts[active].cx / W * 100)) + '%', top: (pts[active].clip ? PADT : pts[active].cy) / H * 100 + '%' }}>{fmtT(pts[active].l.t)}{pts[active].l.pit ? ' · out' : ''}</span>}
              <div className="sp-xaxis">{pts.map(p => <span key={p.i} className={active === p.i ? 'on' : ''} style={{ left: p.cx / W * 100 + '%' }}>{p.l.n}</span>)}</div>
            </div>
          </div>

          {/* tabela de voltas com setores */}
          <LapTable laps={st.laps} bestN={st.best?.n} bestT={st.best?.t} bestSec={st.bestSec} nSec={st.nSec} withFuel
            sel={selIdx} hover={hover} onSel={(i) => setSel(i)} onHover={setHover} />
        </div>

        <div className="pw-stintsel">
          {m.stints.map((s, i) => (
            <button key={s.k} type="button" className={'pw-stintchip pw-glass2' + (i === stintSel ? ' on' : '')}
              onClick={() => { setStintSel(i); setSel(null); setHover(null) }}>
              <b className="stn">Stint {s.k}</b>
              <span className="num purple"><Icon n="clock" s={12} sw={2} /> {s.best ? fmtT(s.best.t) : '—'}</span>
              <span><Icon n="flag" s={12} sw={2} /> {s.laps.length} voltas</span>
              {s.fuelTotal != null && s.fuelPerLap != null && <span><Icon n="fuel" s={12} sw={2} /> {s.fuelTotal.toFixed(2)}L − {s.fuelPerLap.toFixed(2)}L/volta</span>}
            </button>
          ))}
        </div>
      </div>

      {/* popup "Comparison" (aberto pelo pod, como no GO Fast) */}
      {cmpOpen && createPortal(
        <div className="pw-modal" onClick={() => setCmpOpen(false)}>
          <div className="pw-modalcard pw-glass2" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="pw-modalhead">
              <span className="mic"><Icon n="wheel" s={20} /></span>
              <b className="ttl">Comparison 1</b>
              <button className="pw-modalx" onClick={() => setCmpOpen(false)} aria-label="Fechar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="pw-modalcar">
              <span className="cbadge" style={{ width: 38, height: 38 }}><Icon n="car" s={18} /></span>
              <div><b style={{ fontSize: 13.5, fontWeight: 800 }}>{ctx.carro}</b><div className="muted" style={{ fontSize: 12 }}>{ctx.pista}</div></div>
            </div>
            <div className="pw-modalsec">
              <b className="pw-stttl" style={{ fontSize: 14 }}>Stint {st.k}</b>
              <div className="pw-stmeta">
                <span className="purple" style={{ color: 'var(--purple)' }}><Icon n="clock" s={13} sw={2} /> <b className="num">{st.best ? fmtT(st.best.t) : '—'}</b></span>
                {fuelTxt && <span><Icon n="fuel" s={13} sw={2} /> {fuelTxt}</span>}
                <button className="pw-modalmin" onClick={() => setCmpMin(v => !v)} title={cmpMin ? 'Expandir' : 'Recolher'}>{cmpMin ? '+' : '−'}</button>
              </div>
            </div>
            {!cmpMin && (
              <div className="pw-modaltable">
                <LapTable laps={st.laps} bestN={st.best?.n} bestT={st.best?.t} bestSec={st.bestSec} nSec={st.nSec} />
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
