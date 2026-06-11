import { useMemo } from 'react'
import Icon from '../components/Icon'
import { useSession } from '../lib/useSession'
import { projectTrackPair } from '../lib/track'
import type { Payload, SessionInfo } from '../lib/api'

// Dashboard (screens-dashboard/A do handoff) com o que é REAL localmente:
// hero do piloto, stats da sessão carregada, mini-mapa, donut de voltas e atividade
// da semana (mtime dos .ibt). iRating/licenças/leaderboard dependem da API do
// iRacing (bloqueada) → stub explícito até a API liberar.

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

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

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
    ['Limpas', limpas / total * 100, 'var(--accent)'],
    ['Válidas (sujas)', Math.max(0, validas - limpas) / total * 100, 'var(--cyan)'],
    ['Descartadas', Math.max(0, total - validas) / total * 100, 'var(--ink-3)'],
  ] : []
  return { pair, seg, week: buildWeek(sessions), total, validas, limpas }
}

export default function Dashboard() {
  const { payload, sessions, loading, error } = useSession()
  const m = useMemo(() => (payload ? buildModel(payload, sessions) : null), [payload, sessions])

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Carregando sessão…</div>
  if (error || !payload || !m) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'Sem dados'}</div>

  const ctx = payload.contexto
  const maxCount = Math.max(1, ...m.week.map(d => d.count))

  return (
    <div>
      <div className="row resp" style={{ gap: 20, alignItems: 'stretch' }}>
        {/* hero */}
        <div className="col" style={{ flex: '1.05', gap: 14 }}>
          <div className="hero welcome" style={{ flex: 1, minHeight: 260 }}>
            <div className="wel-top">
              <img className="wel-logo" src="/assets/ligma-wordmark.png" alt="LIGMA Racing" />
              <div className="wel-greet">
                <span className="wel-hi">Bem-vindo de volta</span>
                <span className="wel-name">L. Capuzzi</span>
              </div>
            </div>
            <img className="herocar" src="/assets/hero-driver.png" alt="Driver" style={{ objectPosition: 'center bottom' }} />
            <div className="wel-foot">
              <div className="wel-car">
                <span className="wel-no">64</span>
                <div className="wel-cn"><b>{ctx.carro}</b><span><span className="dot acc" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}></span>{ctx.pista}</span></div>
              </div>
            </div>
          </div>
          <div className="card pad">
            <div className="row between center"><span className="lbl">Atividade da semana</span><span className="chip">{sessions.length} sessões no disco</span></div>
            <div className="bars" style={{ marginTop: 14, height: 92 }}>
              {m.week.map((d, i) => <i key={i} className={i === 6 ? 'on' : ''} style={{ height: Math.max(4, d.count / maxCount * 100) + '%' }}></i>)}
            </div>
            <div className="row between" style={{ marginTop: 8 }}>{m.week.map((d, i) => <span key={i} className="muted" style={{ fontSize: 11, fontWeight: 600, flex: 1, textAlign: 'center' }}>{d.label}</span>)}</div>
          </div>
        </div>

        {/* cards */}
        <div className="col" style={{ flex: '1.15' }}>
          <div className="grid3">
            <div className="card pad stat"><div className="row between center"><span className="lbl">Voltas na sessão</span><span className="ico"><Icon n="road" s={18} /></span></div><div className="v">{m.total}</div><span className="muted" style={{ fontSize: 12 }}>{m.limpas} limpas · {m.validas} válidas</span></div>
            <div className="card pad stat"><div className="row between center"><span className="lbl">Sua melhor</span><span className="ico"><Icon n="clock" s={18} /></span></div><div className="v sm green">{ctx.suaMelhor}</div><span className="muted" style={{ fontSize: 12 }}>{ctx.pista}</span></div>
            <div className="card pad stat"><div className="row between center"><span className="lbl">Delta p/ média</span><span className="ico"><Icon n="spark" s={18} /></span></div><div className="v sm redt">{ctx.deltaTotal}</div><span className="muted" style={{ fontSize: 12 }}>vs {ctx.referencia}</span></div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div className="card pad grow" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="lbl">Última sessão</span>
              <div className="row center gap10" style={{ margin: '10px 0 8px' }}>
                <span className="cbadge"><Icon n="car" s={20} /></span>
                <div><div className="h3">{ctx.carro}</div><span className="muted" style={{ fontSize: 12 }}>{ctx.pista}</span></div>
              </div>
              <div style={{ flex: 1, minHeight: 150, margin: '4px 0', position: 'relative' }}>
                <svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                  {m.pair.edges
                    ? <path d={m.pair.edges.roadD} fill="rgba(244,247,246,.10)" stroke="none" />
                    : <path d={m.pair.track.d} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" />}
                  <path d={m.pair.racing.d} fill="none" stroke="var(--accent)" strokeWidth={m.pair.edges ? 1.6 : 4} strokeLinecap="round" vectorEffect={m.pair.edges ? 'non-scaling-stroke' : undefined} style={{ filter: 'drop-shadow(0 0 6px var(--accent-glow))' }} />
                </svg>
              </div>
              <div className="col gap6" style={{ marginTop: 10 }}>
                <div className="row between"><span className="muted" style={{ fontSize: 12 }}>Melhor volta</span><b className="num">{ctx.suaMelhor}</b></div>
                <div className="row between"><span className="muted" style={{ fontSize: 12 }}>Leaderboard</span><b className="num dim">— <i style={{ fontStyle: 'normal', fontSize: 10 }}>(API iRacing)</i></b></div>
              </div>
            </div>
            <div className="card pad grow" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="lbl">Voltas da sessão</span>
              <div style={{ display: 'grid', placeItems: 'center', margin: '6px 0', flex: 1 }}>
                <SegDonut segments={m.seg} center={String(m.total)} sub="VOLTAS" size={162} />
              </div>
              <div className="col" style={{ gap: 9 }}>
                {m.seg.map(([label, pct, color]) => (
                  <div key={label} className="row between center">
                    <span className="row center gap8"><span className="dot" style={{ background: color }}></span><span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span></span>
                    <b className="num" style={{ fontSize: 13 }}>{Math.round(pct)}%</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* licenças & ratings — aguardando a API do iRacing */}
      <div className="licsec">
        <div className="row between center" style={{ marginBottom: 13 }}>
          <div className="row center gap10">
            <span className="lbl">Licenças &amp; Ratings</span>
            <span className="muted" style={{ fontSize: 12 }}>iRacing · LIGMA Racing #64</span>
          </div>
        </div>
        <div className="card pad" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '22px 24px' }}>
          <span className="cbadge" style={{ width: 44, height: 44 }}><Icon n="spark" s={20} /></span>
          <div>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>iRating, Safety Rating e leaderboard chegam quando a API do iRacing liberar</b>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0', lineHeight: 1.5 }}>
              O login por senha foi desativado pelo iRacing e os novos cadastros OAuth estão pausados.
              Assim que o acesso abrir, estes cards mostram suas 4 categorias com iRating, SR e tendência semanal.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
