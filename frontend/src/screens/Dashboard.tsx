import { useMemo } from 'react'
import Icon from '../components/Icon'
import SeasonStrip from '../components/SeasonStrip'
import { useSession } from '../lib/useSession'
import { projectTrackPair } from '../lib/track'
import type { Payload, SessionInfo } from '../lib/api'

// Dashboard no padrão GO Fast (print de referência 2026-06-11): saudação + pills de
// stats, card honesto do iRating (API bloqueada), hero "Performance Tools" com o
// carro da equipe, Última Sessão com o contorno REAL da pista, donut de voltas e
// atividade semanal real (mtime dos .ibt). Tudo dado local — nada inventado.

function SegDonut({ segments, center, sub, size = 162 }: { segments: [string, number, string][]; center: string; sub: string; size?: number }) {
  const cx = size / 2, R = size * 0.441, sw = size * 0.11, C = 2 * Math.PI * R, gap = size * 0.021
  let acc = 0
  return (
    <div className="ring-wrap" style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={sw} />
        {segments.filter(([, pct]) => pct > 0).map(([name, pct, color]) => {
          const len = C * pct / 100, dash = Math.max(0, len - gap), off = -C * acc / 100
          acc += pct
          return <circle key={name} cx={cx} cy={cx} r={R} fill="none" stroke={color} strokeWidth={sw}
            strokeDasharray={dash + ' ' + (C - dash)} strokeDashoffset={off} transform={'rotate(-90 ' + cx + ' ' + cx + ')'}
            style={{ filter: 'drop-shadow(0 0 5px ' + color + ')' }} />
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div><b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size * 0.205, letterSpacing: '-.02em' }}>{center}</b>
          <small style={{ display: 'block', fontSize: size * 0.086, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '.04em' }}>{sub}</small></div>
      </div>
    </div>
  )
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildWeek(sessions: SessionInfo[]) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const days: { label: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    const a = d.getTime() / 1000, b = a + 86400
    days.push({ label: DAY_LABELS[d.getDay()], count: sessions.filter(s => s.mtime >= a && s.mtime < b).length })
  }
  return days
}

function buildModel(p: Payload, sessions: SessionInfo[]) {
  const pair = projectTrackPair(p.track, p.racing_line, p.track_edges)
  const ctx = p.contexto
  const total = ctx.voltasGravadas || 0, validas = ctx.voltasValidas || 0, limpas = ctx.voltasLimpas || 0
  const seg: [string, number, string][] = total ? [
    ['Clean', limpas / total * 100, 'var(--accent)'],
    ['Valid (dirty)', Math.max(0, validas - limpas) / total * 100, 'var(--cyan)'],
    ['Discarded', Math.max(0, total - validas) / total * 100, 'var(--ink-3)'],
  ] : []
  const cut = Date.now() / 1000 - 30 * 86400
  const n30 = sessions.filter(s => s.mtime >= cut).length
  return { pair, seg, week: buildWeek(sessions), total, validas, limpas, n30 }
}

export default function Dashboard() {
  const { payload, sessions, loading, error } = useSession()
  const m = useMemo(() => (payload ? buildModel(payload, sessions) : null), [payload, sessions])

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Loading session…</div>
  if (error || !payload || !m) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'No data'}</div>

  const ctx = payload.contexto
  const maxCount = Math.max(1, ...m.week.map(d => d.count))
  const pctLimpas = m.total ? Math.round(m.limpas / m.total * 100) : 0

  return (
    <div className="tp-wrap pw-dash">
      {/* fundo sutil p/ o vidro (mesma técnica da Stint) */}
      <div className="pw-pagebg" aria-hidden><i className="g1" /><i className="g2" /><i className="g3" /></div>

      {/* topo: saudação + pills + iRating honesto */}
      <div className="pw-dashtop">
        <div className="pw-greet">
          <span className="lbl">Welcome back</span>
          <b className="pw-greet-h">Ready to push?</b>
        </div>
        <div className="pw-statpill pw-glass2">
          <span className="pw-kico" style={{ ['--c' as string]: 'var(--accent)' }}><Icon n="flag" s={17} /></span>
          <div>
            <span className="kl">Laps in session</span>
            <b className="kv num">{m.total}</b>
            <span className="ks">{m.limpas} clean · {m.validas} valid</span>
          </div>
        </div>
        <div className="pw-statpill pw-glass2">
          <span className="pw-kico" style={{ ['--c' as string]: 'var(--accent)' }}><Icon n="clock" s={17} /></span>
          <div>
            <span className="kl">Sessions · 30 days</span>
            <b className="kv num">{m.n30}</b>
            <span className="ks">{sessions.length} on disk</span>
          </div>
        </div>
        <div className="pw-iracing pw-glass2">
          <span className="pw-kico" style={{ ['--c' as string]: 'var(--purple)' }}><Icon n="diamond" s={16} /></span>
          <div>
            <b>iRating &amp; Licenses</b>
            <span>waiting for the iRacing API — OAuth paused; the cards light up when access opens</span>
          </div>
        </div>
      </div>

      {/* calendário da temporada (séries do Leo) */}
      <SeasonStrip />

      {/* corpo: hero | coluna direita */}
      <div className="pw-dashmain">
        <div className="pw-dashhero pw-glass2">
          <div className="pw-heroinfo">
            <span className="kicker">LIGMA Racing · PitWall</span>
            <h1 className="pw-heroh">Performance Tools</h1>
            <p className="pw-herosub">Post-session telemetry and analysis with real iRacing data — open the Race Engineer to break down your last session.</p>
            <button className="chip solid" onClick={() => window.dispatchEvent(new CustomEvent('pw:go', { detail: 'telemetry' }))}>
              Open Race Engineer <Icon n="chevR" s={13} />
            </button>
          </div>
          <img className="pw-herocar" src="/assets/ligma-car.png" alt="LIGMA Racing #64" />
          <div className="pw-herofoot">
            <span className="wel-no">64</span>
            <div className="wel-cn"><b>{ctx.carro}</b><span><span className="dot acc" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}></span>{ctx.pista}</span></div>
          </div>
        </div>

        <div className="pw-dashright">
          <div className="pw-dashrow">
            <div className="pw-dcard pw-glass2" style={{ flex: 1.15 }}>
              <span className="lbl">Last session</span>
              <div className="row center gap10" style={{ margin: '10px 0 2px' }}>
                <span className="cbadge" style={{ width: 38, height: 38 }}><Icon n="car" s={18} /></span>
                <div><b style={{ fontSize: 13.5, fontWeight: 800 }}>{ctx.carro}</b><div className="muted" style={{ fontSize: 11.5 }}>{ctx.pista}</div></div>
              </div>
              <div className="pw-dmap">
                <svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet">
                  <path d={m.pair.track.d} fill="none" stroke="rgba(255,255,255,.62)" strokeWidth={2.4} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="col" style={{ gap: 7 }}>
                <div className="row between center"><span className="pw-drlbl">Best lap</span><b className="num" style={{ fontSize: 12.5 }}>{ctx.suaMelhor}</b></div>
                <div className="row between center"><span className="pw-drlbl">Delta to average</span><b className="num redt" style={{ fontSize: 12.5 }}>{ctx.deltaTotal}</b></div>
                <div className="row between center"><span className="pw-drlbl">Leaderboard</span><b className="num dim" style={{ fontSize: 12.5 }}>— <i>API iRacing</i></b></div>
              </div>
            </div>
            <div className="pw-dcard pw-glass2" style={{ flex: 1 }}>
              <span className="lbl">Session laps</span>
              <div style={{ display: 'grid', placeItems: 'center', flex: 1, margin: '4px 0' }}>
                <SegDonut segments={m.seg} center={pctLimpas + '%'} sub="CLEAN" size={148} />
              </div>
              <div className="col" style={{ gap: 8 }}>
                {m.seg.map(([label, pct, color]) => (
                  <div key={label} className="row between center">
                    <span className="row center gap8"><span className="dot" style={{ background: color }}></span><span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span></span>
                    <b className="num" style={{ fontSize: 12.5 }}>{Math.round(pct)}%</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="pw-dcard pw-glass2 pw-dweek">
            <div className="row between center" style={{ flex: 'none' }}>
              <span className="lbl">My weekly activity</span>
              <span className="chip" style={{ cursor: 'default' }}>last 7 days</span>
            </div>
            <div className="pw-wkbars">
              {m.week.map((d, i) => (
                <div key={i} className={'wk' + (i === 6 ? ' on' : '')} title={`${d.count} ${d.count === 1 ? 'session' : 'sessions'}`}>
                  <div className="slot"><i style={{ height: Math.max(8, d.count / maxCount * 100) + '%' }} /></div>
                  <span>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
