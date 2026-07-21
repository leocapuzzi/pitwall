import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { getCalendar, type Calendar, type CalThumb, type CalWeek } from '../lib/api'

// SEASON STRIP (Dashboard): calendário da temporada por série — cards com o
// traçado REAL de cada circuito (silhueta OSM; centerline da config quando a
// pista já foi criada no PitWall), semana atual destacada, countdown p/ a
// próxima corrida e linha do tempo com o marcador "onde estamos" na temporada.
// Dados: /api/calendar (tracks/calendario_2026s3.json). Horários como no
// schedule oficial (sem conversão de fuso — o PDF não declara o fuso).

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-06-20T12:00" já é hora local; data pura ("2026-06-16") seria parseada
// como UTC e voltaria um dia no Brasil — forçamos meia-noite LOCAL.
function dt(s: string): Date { return new Date(s.includes('T') ? s : s + 'T00:00') }
function fmtDia(v: string | Date): string {
  const d = typeof v === 'string' ? dt(v) : v
  return d.getDate() + ' ' + MESES[d.getMonth()]
}
function fmtCorrida(s: string): string {
  const d = dt(s)
  return fmtDia(d) + ' · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

type Status = 'done' | 'live' | 'future'
function weekStatus(w: CalWeek, now: number): Status {
  const ini = dt(w.inicio).getTime()
  if (now >= ini + 7 * 86400000) return 'done'
  if (now >= ini) return 'live'
  return 'future'
}

// Countdown isolado (re-renderiza só ele a cada segundo)
function Countdown({ to, prefix }: { to: string; prefix: string }) {
  const [, force] = useState(0)
  useEffect(() => { const id = setInterval(() => force(v => v + 1), 1000); return () => clearInterval(id) }, [])
  const ms = dt(to).getTime() - Date.now()
  if (ms <= 0) return <b className="pw-seacount num">in progress</b>
  const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000)
  const m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000)
  const txt = d > 0 ? `${d}d ${h}h ${m}min` : `${h}h ${m}min ${s}s`
  return <b className="pw-seacount num">{prefix} {txt}</b>
}

function Thumb({ t, className }: { t: CalThumb | null; className?: string }) {
  if (!t) return (
    <div className={'pw-calthumb miss ' + (className || '')}>
      <Icon n="flag" s={15} />
      <span>layout on your 1st stint</span>
    </div>
  )
  return (
    <div className={'pw-calthumb ' + (className || '')}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {t.paths.map((p, i) => (
          <path key={i} vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" strokeLinejoin="round"
            d={p.x.map((x, j) => (j ? 'L' : 'M') + x + ' ' + p.y[j]).join('')} />
        ))}
      </svg>
    </div>
  )
}

export default function SeasonStrip() {
  const [cal, setCal] = useState<Calendar | null>(null)
  const [err, setErr] = useState('')
  const [serieId, setSerieId] = useState<string>(() => localStorage.getItem('pw_cal_serie') || 'mx5')
  const [aberta, setAberta] = useState<CalWeek | null>(null)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => { getCalendar().then(setCal).catch(e => setErr(String(e.message || e))) }, [])
  useEffect(() => { localStorage.setItem('pw_cal_serie', serieId) }, [serieId])

  const serie = useMemo(() => cal?.series.find(s => s.id === serieId) || cal?.series[0] || null, [cal, serieId])
  const now = Date.now()

  const visao = useMemo(() => {
    if (!serie) return null
    const sts = serie.weeks.map(w => weekStatus(w, now))
    const proxCorrida = serie.weeks.find(w => dt(w.corrida).getTime() > now) || null
    const idxLive = sts.findIndex(s => s === 'live')
    const foco = (idxLive >= 0 ? serie.weeks[idxLive] : proxCorrida) || serie.weeks[serie.weeks.length - 1]
    // progresso 0..1 da temporada (da abertura à última corrida) p/ o marcador
    const t0 = dt(serie.weeks[0].inicio).getTime()
    const t1 = dt(serie.weeks[serie.weeks.length - 1].corrida).getTime()
    const prog = Math.max(0, Math.min(1, (now - t0) / (t1 - t0)))
    const feitas = sts.filter(s => s === 'done').length
    return { sts, proxCorrida, foco, prog, feitas }
  }, [serie, now])

  // wheel vertical -> rolagem horizontal do trilho (preventDefault exige passive:false)
  useEffect(() => {
    const el = railRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault() }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [cal, serieId])

  // abre já com a semana de foco (atual/próxima) centrada
  useEffect(() => {
    if (!visao || !railRef.current) return
    const id = setTimeout(() => {
      const card = railRef.current?.querySelector<HTMLElement>(`[data-w="${visao.foco.w}"]`)
      const rail = railRef.current
      if (card && rail) rail.scrollLeft = card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2
    }, 0)
    return () => clearTimeout(id)
  }, [cal, serieId])  // eslint-disable-line react-hooks/exhaustive-deps

  const desliza = (dir: number) => { railRef.current?.scrollBy({ left: dir * 540, behavior: 'smooth' }) }

  if (err) return null  // calendário ausente não pode quebrar o Dashboard
  if (!cal || !serie || !visao) return <div className="pw-season pw-glass2 pw-sea-skel" aria-hidden />

  const real = (w: CalWeek) => !!(w.thumb && cal.thumbs[w.thumb]?.fonte.startsWith('centerline'))

  return (
    <div className="pw-season pw-glass2">
      <div className="pw-seahead">
        <div className="pw-seatitle">
          <span className="kicker">Season · {cal.season}</span>
          <div className="pw-seatabs" role="tablist">
            {cal.series.map(s => (
              <button key={s.id} role="tab" aria-selected={s.id === serie.id}
                className={'pw-seatab' + (s.id === serie.id ? ' on' : '')}
                onClick={() => setSerieId(s.id)}>
                {s.id === 'mx5' ? 'MX-5 Cup' : 'F1600 Rookie'}
              </button>
            ))}
          </div>
        </div>
        <span className="pw-seasub">{serie.nome} <i>by {serie.by}</i> · {serie.carro}</span>
        <div className="pw-seanext">
          {visao.proxCorrida ? (<>
            <span className="lbl">{visao.feitas ? 'Next race' : 'Season starts'}</span>
            <Countdown to={visao.proxCorrida.corrida} prefix="in" />
          </>) : <span className="lbl">season ended</span>}
        </div>
      </div>

      <div className="pw-searailwrap">
        <button className="pw-seaarrow l" aria-label="Previous weeks" onClick={() => desliza(-1)}><Icon n="chevR" s={14} /></button>
        <div className="pw-searail" ref={railRef}>
          {serie.weeks.map((w, i) => {
            const st = visao.sts[i]
            const isNext = visao.proxCorrida?.w === w.w
            return (
              <button key={w.w} data-w={w.w}
                className={'pw-calcard ' + st + (isNext ? ' next' : '')}
                onClick={() => setAberta(w)}>
                <div className="pw-calhead">
                  <span className="pw-calw num">S{w.w}</span>
                  {st === 'done' && <span className="pw-caldone"><Icon n="flag" s={11} /></span>}
                  {st === 'live' && <span className="pw-callive">THIS WEEK</span>}
                  {real(w) && <span className="pw-calreal" title="Track created in PitWall — real layout">✓</span>}
                </div>
                <Thumb t={w.thumb ? cal.thumbs[w.thumb] : null} />
                <b className="pw-calpista">{w.pista}</b>
                <span className="pw-calcfg">{w.config || '—'}</span>
                <span className="pw-calmeta"><Icon n="clock" s={11} /> {fmtCorrida(w.corrida)} <i>·</i> {w.temp_c}°C</span>
              </button>
            )
          })}
        </div>
        <button className="pw-seaarrow r" aria-label="Next weeks" onClick={() => desliza(1)}><Icon n="chevR" s={14} /></button>
      </div>

      <div className="pw-seatl" aria-hidden>
        <i className="bar"><i className="fill" style={{ width: visao.prog * 100 + '%' }} /></i>
        {serie.weeks.map((w, i) => {
          const p = (i + 0.5) / serie.weeks.length
          return <span key={w.w} className={'tick ' + visao.sts[i]} style={{ left: p * 100 + '%' }}
            onClick={() => { const c = railRef.current?.querySelector<HTMLElement>(`[data-w="${w.w}"]`); const r = railRef.current; if (c && r) r.scrollTo({ left: c.offsetLeft - (r.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' }) }} />
        })}
        <span className="pw-seacar" style={{ left: visao.prog * 100 + '%' }} title="You are here in the season" />
      </div>

      {aberta && (
        <div className="pw-calmodal" onClick={() => setAberta(null)}>
          <div className="pw-calsheet pw-glass2" onClick={e => e.stopPropagation()}>
            <div className="pw-calshead">
              <div>
                <span className="kicker">Week {aberta.w} · {serie.nome}</span>
                <b className="pw-calsh">{aberta.pista}</b>
                <span className="pw-calscfg">{aberta.config || 'single configuration'}</span>
              </div>
              <button className="chip" onClick={() => setAberta(null)} aria-label="Close">✕</button>
            </div>
            <Thumb t={aberta.thumb ? cal.thumbs[aberta.thumb] : null} className="big" />
            <div className="pw-calfacts">
              <div><span className="lbl">Race (1x)</span><b className="num">{fmtCorrida(aberta.corrida)}</b></div>
              <div><span className="lbl">Week</span><b className="num">{fmtDia(aberta.inicio)} → {fmtDia(new Date(dt(aberta.inicio).getTime() + 6 * 86400000))}</b></div>
              <div><span className="lbl">Weather</span><b className="num">{aberta.temp_c}°C · no rain</b></div>
              <div><span className="lbl">Start</span><b className="num">{serie.largada} · {serie.duracao_min} min</b></div>
              <div><span className="lbl">Cadence</span><b>{serie.cadencia}</b></div>
              <div><span className="lbl">License</span><b>{serie.licenca}</b></div>
            </div>
            <div className={'pw-calstatus' + (real(aberta) ? ' ok' : '')}>
              {real(aberta)
                ? <>Track created in PitWall — the layout above is the config's real centerline.</>
                : <>No telemetry for this config yet — run 2+ complete laps and PitWall builds the track (layout, corners and analysis).</>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
