import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { useSession } from '../lib/useSession'
import { fmtClock } from '../lib/fmt'
import type { LapRow, Payload } from '../lib/api'

// Stint Overview (stint-pro do handoff, com dados reais do payload.laps):
// KPIs do stint, gráfico interativo de evolução de tempo (hover/clique ligados à
// lista de voltas) e quebra por setor da volta selecionada. Interações discretas —
// sem rAF (nada anima por frame aqui).

interface Model {
  laps: LapRow[]            // todas com tempo fechado, em ordem
  racing: LapRow[]          // limpas (base p/ média/σ/domínio do gráfico)
  best: LapRow              // melhor válida
  bestSec: number[]         // melhor tempo por setor (válidas com setores)
  optimal: number | null    // soma dos melhores setores
  avg: number; sigma: number
  fuelPorVolta: number | null; voltasRestantes: number | null
}

function buildModel(p: Payload): Model | null {
  const laps = (p.laps || []).filter(l => l.t > 0)
  if (!laps.length) return null
  const valid = laps.filter(l => l.valid)
  if (!valid.length) return null
  const racing = laps.filter(l => l.clean)
  const base = racing.length ? racing : valid
  const best = valid.reduce((a, b) => (b.t < a.t ? b : a), valid[0])
  const nSec = Math.max(0, ...valid.map(l => l.s?.length || 0))
  const bestSec = Array.from({ length: nSec }, (_, i) =>
    Math.min(...valid.filter(l => (l.s?.length || 0) > i).map(l => l.s[i])))
  const optimal = nSec ? bestSec.reduce((a, b) => a + b, 0) : null
  const avg = base.reduce((a, l) => a + l.t, 0) / base.length
  const sigma = Math.sqrt(base.reduce((a, l) => a + (l.t - avg) ** 2, 0) / base.length)
  const comFuel = laps.filter(l => l.fuel != null && !l.pit)
  const fuelPorVolta = comFuel.length ? comFuel.reduce((a, l) => a + (l.fuel || 0), 0) / comFuel.length : null
  const fuelFim = p.contexto?.fuelFim
  const voltasRestantes = fuelPorVolta && fuelFim != null && fuelFim > 0 ? Math.floor(fuelFim / fuelPorVolta) : null
  return { laps, racing: base, best, bestSec, optimal, avg, sigma, fuelPorVolta, voltasRestantes }
}

const W = 560, H = 210, PADX = 18, PADT = 14, PADB = 26

export default function Stint() {
  const { payload, loading, error } = useSession()
  const m = useMemo(() => (payload ? buildModel(payload) : null), [payload])
  const [sel, setSel] = useState<number | null>(null)        // índice em m.laps
  const [hover, setHover] = useState<number | null>(null)

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Carregando sessão…</div>
  if (error || !payload || !m) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'Sem voltas com tempo nesta sessão'}</div>

  const ctx = payload.contexto
  const selIdx = sel ?? m.laps.findIndex(l => l.best)
  const cur = m.laps[Math.max(0, selIdx)]
  const active = hover ?? Math.max(0, selIdx)

  // domínio do gráfico: voltas de corrida (out laps estouram e são clipadas no topo)
  const lo = Math.min(...m.racing.map(l => l.t)) - 0.25
  const hi = Math.max(...m.racing.map(l => l.t)) + 0.25
  const x = (i: number) => PADX + (m.laps.length > 1 ? i / (m.laps.length - 1) : 0.5) * (W - PADX * 2)
  const y = (t: number) => { const c = Math.max(lo, Math.min(hi, t)); return PADT + (1 - (c - lo) / (hi - lo)) * (H - PADT - PADB) }
  const pts = m.laps.map((l, i) => ({ i, l, cx: x(i), cy: y(l.t), clip: l.t > hi }))
  const linePath = pts.map((p, i) => (i ? 'L' : 'M') + p.cx.toFixed(1) + ',' + p.cy.toFixed(1)).join(' ')
  const areaPath = linePath + ` L${pts[pts.length - 1].cx},${H - PADB} L${pts[0].cx},${H - PADB} Z`
  const bestY = y(m.best.t), optY = m.optimal != null ? y(m.optimal) : null
  const consist = Math.max(0, Math.min(100, 100 - m.sigma * 40))

  const tagOf = (l: LapRow) => (l.pit ? 'out' : l.best ? 'best' : !l.valid ? 'inc' : '+' + (l.t - m.best.t).toFixed(3))

  return (
    <div className="tp-wrap">
      {/* cabeçalho do stint */}
      <div className="row between center">
        <div className="row center gap10">
          <span className="cbadge" style={{ width: 40, height: 40 }}><Icon n="car" s={20} /></span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>Stint · {ctx.carro}</div>
            <span className="muted" style={{ fontSize: 12 }}>{ctx.pista} · {m.laps.length} voltas</span>
          </div>
        </div>
        {m.fuelPorVolta != null && (
          <span className="chip"><Icon n="fuel" s={13} /> {m.fuelPorVolta.toFixed(2)} L/volta{m.voltasRestantes != null ? ` · ~${m.voltasRestantes} voltas restantes` : ''}</span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid4" style={{ marginTop: 14 }}>
        <div className="card pad stat"><span className="lbl">Melhor volta</span><div className="v green sm">{fmtClock(m.best.t)}</div><span className="muted" style={{ fontSize: 11 }}>Volta {m.best.n}</span></div>
        <div className="card pad stat"><span className="lbl">Volta ótima</span>
          {m.optimal != null
            ? <><div className="v purple sm">{fmtClock(m.optimal)}</div><span className="muted" style={{ fontSize: 11 }}>−{Math.max(0, m.best.t - m.optimal).toFixed(2)}s vs melhor</span></>
            : <><div className="v sm">—</div><span className="muted" style={{ fontSize: 11 }}>sem setores nesta sessão</span></>}
        </div>
        <div className="card pad stat"><span className="lbl">Média (limpas)</span><div className="v sm">{fmtClock(m.avg)}</div><span className="muted" style={{ fontSize: 11 }}>σ {m.sigma.toFixed(2)}s</span></div>
        <div className="card pad stat" style={{ background: 'linear-gradient(120deg,var(--accent-soft),var(--surface) 60%)', borderColor: 'var(--accent-line)' }}>
          <span className="lbl">Consistência</span><div className="v sm">{consist.toFixed(0)}<span style={{ fontSize: 14, color: 'var(--ink-3)' }}>/100</span></div>
          <span className="muted" style={{ fontSize: 11 }}>{consist >= 80 ? 'agrupamento forte' : consist >= 55 ? 'variação moderada' : 'voltas irregulares'}</span>
        </div>
      </div>

      <div className="row tp-main" style={{ gap: 14, alignItems: 'stretch', marginTop: 12, flex: 'none', height: 240 }}>
        {/* gráfico interativo */}
        <div className="card pad sp-chartcard" style={{ flex: 1.5, display: 'flex', flexDirection: 'column' }}>
          <div className="row between center"><span className="lbl">Evolução do tempo de volta</span>
            <div className="row" style={{ gap: 14, fontSize: 11.5, fontWeight: 600 }}>
              <span className="row center gap6"><span className="sp-key" style={{ background: 'var(--accent)' }}></span>Tempo</span>
              {m.optimal != null && <span className="row center gap6"><span className="sp-key dash" style={{ borderColor: 'var(--purple)' }}></span>Ótima</span>}
            </div>
          </div>
          <div className="sp-plot" style={{ position: 'relative', flex: 1, minHeight: 130, marginTop: 10 }} onPointerLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
              <defs><linearGradient id="spfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".22" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
              {optY != null && <line x1={PADX} x2={W - PADX} y1={optY} y2={optY} stroke="var(--purple)" strokeWidth="1.4" strokeDasharray="4 4" opacity=".75" vectorEffect="non-scaling-stroke" />}
              <line x1={PADX} x2={W - PADX} y1={bestY} y2={bestY} stroke="var(--accent)" strokeWidth="1" strokeDasharray="2 5" opacity=".4" vectorEffect="non-scaling-stroke" />
              <path d={areaPath} fill="url(#spfill)" />
              <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" shapeRendering="geometricPrecision" />
              {pts.map(p => <rect key={p.i} x={p.cx - W / m.laps.length / 2} y="0" width={W / m.laps.length} height={H} fill="transparent" style={{ cursor: 'pointer' }} onPointerEnter={() => setHover(p.i)} onClick={() => setSel(p.i)} />)}
            </svg>
            {pts[active] && <span className="sp-guide" style={{ left: pts[active].cx / W * 100 + '%' }}></span>}
            {pts.map(p => <span key={p.i} className={'sp-dot' + (p.l.best ? ' best' : '') + (active === p.i ? ' on' : '')} style={{ left: p.cx / W * 100 + '%', top: (p.clip ? PADT : p.cy) / H * 100 + '%', opacity: p.clip ? 0.45 : 1 }}></span>)}
            {pts[active] && <span className="sp-tip" style={{ left: Math.min(90, Math.max(10, pts[active].cx / W * 100)) + '%', top: (pts[active].clip ? PADT : pts[active].cy) / H * 100 + '%' }}>{fmtClock(pts[active].l.t)}{pts[active].l.pit ? ' · out' : ''}</span>}
            <div className="sp-xaxis">{pts.map(p => <span key={p.i} className={active === p.i ? 'on' : ''} style={{ left: p.cx / W * 100 + '%' }}>{p.l.n}</span>)}</div>
          </div>
          <div className="row between" style={{ marginTop: 4 }}>
            <span className="dim" style={{ fontSize: 11 }}>Número da volta</span>
            {m.optimal != null && <span className="dim" style={{ fontSize: 11 }}>Ótima {fmtClock(m.optimal)}</span>}
          </div>
        </div>

        {/* lista de voltas */}
        <div className="col" style={{ flex: 1, gap: 14, minWidth: 0 }}>
          <div className="card sp-listcard" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 4px 4px', minHeight: 0 }}>
            <span className="lbl" style={{ marginLeft: 14, marginBottom: 6 }}>Todas as voltas</span>
            <div className="sp-list" style={{ overflowY: 'auto', minHeight: 0 }}>
              {m.laps.map((l, i) => (
                <button key={l.n} className={'sp-row' + (selIdx === i ? ' on' : '') + (hover === i ? ' hov' : '')}
                  onClick={() => setSel(i)} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                  <span className="num lead">{l.n}</span>
                  <span className={'num ' + (l.best ? 'green' : '')}>{fmtClock(l.t)}</span>
                  <span className={'num ' + (l.best ? '' : 'redt')} style={{ fontSize: 11.5 }}>{tagOf(l)}</span>
                  {l.best && <span className="sp-flag">★</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* setores da volta selecionada */}
      <div className="card pad sp-secband" style={{ marginTop: 12, paddingTop: 14, paddingBottom: 14 }} key={cur.n}>
        <div className="row between center" style={{ marginBottom: 10 }}>
          <div className="row center gap10">
            <span className="lp-cbadge" style={{ background: cur.best ? 'var(--accent)' : 'var(--surface-3)', color: cur.best ? '#0a0d0a' : 'var(--ink)' }}>L{cur.n}</span>
            <div><div className="lbl">Setores da volta</div><b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{fmtClock(cur.t)}</b></div>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            {cur.s?.length ? <>verde = melhor setor da sessão{m.optimal != null && <> · ótima {fmtClock(m.optimal)}</>}</> : 'sem setores para esta volta'}
          </span>
        </div>
        {cur.s?.length > 0 && (
          <div className="sp-sectors">
            {cur.s.map((v, i) => {
              const bs = m.bestSec[i] ?? v
              const isBest = Math.abs(v - bs) < 0.001, loss = v - bs
              return (
                <div key={i} className="sp-sec">
                  <span className="lbl">S{i + 1}</span>
                  <b className={'num ' + (isBest ? 'green' : '')} style={{ fontSize: 17 }}>{v.toFixed(3)}</b>
                  <div className="sp-secbar"><i style={{ width: Math.min(100, loss / 0.5 * 100) + '%' }}></i></div>
                  <span className={'num ' + (isBest ? 'green' : 'redt')} style={{ fontSize: 12 }}>{isBest ? 'melhor' : '+' + loss.toFixed(3)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
