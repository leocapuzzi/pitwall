import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { useSession } from '../lib/useSession'
import { fmtClock } from '../lib/fmt'
import type { Insight, Payload } from '../lib/api'

// Race Engineer AI (ai-pro do handoff). O relatório (resumo, skills, oportunidades,
// insight fixado) é 100% REAL — vem de payload.insights + scorecard. O CHAT ainda
// não liga em IA de verdade (coach on hold aguardando o pool do Max): responde de
// forma honesta apontando para os insights, sem fingir inteligência.

interface Opp { rank: number; insight: Insight; title: string; desc: string; gain: string; note: string }
interface Model {
  opps: Opp[]; skills: [string, number, string][]; coastS: number
  potencial: string | null; perda: number; piorSetor: string | null; nVoltas: number
}

const grade = (v: number) => (v >= 0.85 ? 'A' : v >= 0.75 ? 'A−' : v >= 0.65 ? 'B+' : v >= 0.55 ? 'B' : v >= 0.45 ? 'B−' : v >= 0.35 ? 'C' : 'D')

function buildModel(p: Payload): Model {
  const ins = [...(p.insights || [])].sort((a, b) => (b.cost_s || 0) - (a.cost_s || 0))
  const opps: Opp[] = ins.slice(0, 3).map((it, i) => ({
    rank: i + 1, insight: it,
    title: `${it.corner} — ${it.what || it.phase}`,
    desc: it.fix || it.why || '',
    gain: '+' + (it.cost_s || 0).toFixed(2) + 's',
    note: it.phase || (it.flags || []).slice(0, 1).join(''),
  }))
  const s = p.scorecard || {}
  const skills: [string, number, string][] = [
    ['Freada', s.brake_aggression ?? 0, ''],
    ['Trail braking', s.trail_overlap ?? 0, ''],
    ['Uso do grip', s.circle_use ?? 0, ''],
    ['Rotação', Math.min(1, s.rotation_eff ?? 0), ''],
  ].map(([k, v]) => [k as string, Math.round((v as number) * 100), grade(v as number)])
  const st = p.sectorTimes
  let piorSetor: string | null = null
  if (st?.labels?.length) {
    let bi = 0, bd = -1
    st.labels.forEach((_, i) => { const d = (st.media[i] || 0) - (st.ref[i] || 0); if (d > bd) { bd = d; bi = i } })
    piorSetor = st.labels[bi]
  }
  const valid = (p.laps || []).filter(l => l.valid)
  const nSec = Math.max(0, ...valid.map(l => l.s?.length || 0))
  const optimal = nSec ? Array.from({ length: nSec }, (_, i) => Math.min(...valid.filter(l => (l.s?.length || 0) > i).map(l => l.s[i]))).reduce((a, b) => a + b, 0) : null
  const perda = p.delta.length ? p.delta[p.delta.length - 1] : 0
  return { opps, skills, coastS: s.coasting_total_s ?? 0, potencial: optimal != null ? fmtClock(optimal) : null, perda, piorSetor, nVoltas: p.contexto?.voltasLimpas || 0 }
}

interface Msg { role: 'me' | 'eng'; text: string }

export default function AIEngineer() {
  const { payload, loading, error } = useSession()
  const m = useMemo(() => (payload ? buildModel(payload) : null), [payload])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [pin, setPin] = useState<Opp | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timer = useRef(0)

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight }, [msgs, typing])
  useEffect(() => () => clearTimeout(timer.current), [])

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Carregando sessão…</div>
  if (error || !payload || !m) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'Sem dados'}</div>

  const ctx = payload.contexto
  const cur = pin || m.opps[0] || null
  const resumo = `Analisei suas ${m.nVoltas} voltas limpas: a média deixa ${m.perda.toFixed(2).replace('.', ',')}s por volta vs sua melhor` + (m.piorSetor ? `, a maior parte no ${m.piorSetor}.` : '.')

  const send = (text: string) => {
    const q = (text || '').trim(); if (!q || typing) return
    setDraft(''); setMsgs(v => [...v, { role: 'me', text: q }]); setTyping(true)
    timer.current = window.setTimeout(() => {
      setTyping(false)
      setMsgs(v => [...v, {
        role: 'eng',
        text: 'O chat do engenheiro ainda não está ligado na IA — entra em breve. Enquanto isso, o relatório ao lado já é real: veja as oportunidades de ganho e o insight fixado, que vêm da análise desta sessão.',
      }])
    }, 600)
  }
  const pickOpp = (o: Opp) => setPin(o)

  return (
    <div className="ap-page">
      <div className="card ap-hero">
        <span className="ap-hero-av"><img src="/assets/engineer-mascot.png" alt="Race Engineer" /></span>
        <div className="ap-hero-txt">
          <div className="row center gap8"><span className="lbl" style={{ letterSpacing: '.12em' }}>Seu engenheiro de pista</span><span className="chip" style={{ padding: '3px 9px', fontSize: 10.5 }}>chat em breve</span></div>
          <h2 className="ap-hero-name">Race Engineer</h2>
          <p className="ap-hero-tag">“{resumo} Vamos buscar esse tempo.”</p>
        </div>
        <div className="ap-hero-meta">
          <div><span className="lbl">Sessão</span><b className="num">{m.nVoltas} voltas</b></div>
          <div><span className="lbl">Potencial</span><b className="num purple">{m.potencial || '—'}</b></div>
        </div>
      </div>

      <div className="row resp ap-wrap" style={{ alignItems: 'stretch', gap: 16, flex: 1, minHeight: 0 }}>
        {/* relatório real */}
        <div className="col ap-left" style={{ flex: 1.6, minWidth: 0, gap: 14 }}>
          <div className="card pad" style={{ background: 'linear-gradient(120deg,var(--accent-soft),var(--surface) 55%)', borderColor: 'var(--accent-line)' }}>
            <div className="row between center"><span className="lbl">Resumo · pós-sessão</span><span className="muted" style={{ fontSize: 11.5 }}>{ctx.carro} · {ctx.pista}</span></div>
            <div className="h2" style={{ margin: '8px 0', lineHeight: 1.25 }}>Você está <span className="num">{ctx.deltaTotal}</span> do seu potencial{m.piorSetor ? <> — concentrado no <span className="num">{m.piorSetor}</span>.</> : '.'}</div>
            <p className="muted" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.55 }}>
              Tempo morto (sem freio nem acelerador): {m.coastS.toFixed(1)}s por volta.
              As três maiores oportunidades abaixo vêm da análise curva a curva desta sessão.
            </p>
          </div>
          <div className="grid4">
            {m.skills.map(([k, v, g]) => (
              <div key={k} className="card pad stat">
                <div className="row between center"><span className="lbl">{k}</span><span className="grade" style={{ fontSize: 20 }}>{g}</span></div>
                <div className="v" style={{ fontSize: 24, marginTop: 2 }}>{v}<span style={{ fontSize: 12, color: 'var(--ink-3)' }}>/100</span></div>
                <div className="barline" style={{ marginTop: 6 }}><div className="f" style={{ width: v + '%' }}></div></div>
              </div>
            ))}
          </div>
          <div className="card pad" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="row between center"><span className="lbl">Maiores ganhos disponíveis</span><span className="muted" style={{ fontSize: 11 }}>clique para fixar o insight</span></div>
            <div style={{ marginTop: 6 }}>
              {m.opps.map(o => (
                <button key={o.rank} className={'opp ap-opp' + ((cur?.rank === o.rank) ? ' on' : '')} onClick={() => pickOpp(o)}>
                  <span className={'rank' + (o.rank === 1 ? ' r1' : '')}>{o.rank}</span>
                  <div className="grow"><div className="ob">{o.title}</div><div className="od">{o.desc}</div></div>
                  <div className="gain redt">{o.gain}<div className="od" style={{ fontWeight: 500 }}>{o.note}</div></div>
                </button>
              ))}
              {!m.opps.length && <p className="muted" style={{ fontSize: 13 }}>Sem insights nesta sessão.</p>}
            </div>
          </div>
        </div>

        {/* chat honesto + insight fixado */}
        <div className="col ap-right" style={{ flex: 1, minWidth: 0, gap: 14 }}>
          <div className="card chatwrap ap-chat" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="row between center" style={{ marginBottom: 2, flex: 'none' }}>
              <div className="row center gap8"><span className="av mascot" style={{ width: 32, height: 32 }}><img src="/assets/engineer-mascot.png" alt="Engineer" /></span><b style={{ fontSize: 13.5 }}>Chat com o engenheiro</b></div>
              <span className="chip" style={{ padding: '3px 9px', fontSize: 10.5 }}>em breve</span>
            </div>
            <div className="ap-thread" ref={scrollRef}>
              <div className="msg eng"><span className="av mascot"><img src="/assets/engineer-mascot.png" alt="Engineer" /></span>
                <div className="bubble"><b>Engineer</b>{resumo} O chat com IA entra em breve — por enquanto o relatório ao lado já traz a análise completa.</div></div>
              {msgs.map((msg, i) => (
                <div key={i} className={'msg ' + (msg.role === 'me' ? 'me' : 'eng')}>
                  {msg.role === 'eng' && <span className="av mascot"><img src="/assets/engineer-mascot.png" alt="Engineer" /></span>}
                  <div className="bubble">{msg.role === 'eng' && <b>Engineer</b>}{msg.text}</div>
                </div>
              ))}
              {typing && <div className="msg eng"><span className="av mascot"><img src="/assets/engineer-mascot.png" alt="Engineer" /></span><div className="bubble ap-typing"><span></span><span></span><span></span></div></div>}
            </div>
            <form className="chatinput ap-input" onSubmit={(e) => { e.preventDefault(); send(draft) }}>
              <input placeholder="Pergunte sobre a sua volta… (chat liga em breve)" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button type="submit" className="chip solid" style={{ padding: '7px 14px', border: 0, cursor: 'pointer' }}><Icon n="send" s={13} /> Enviar</button>
            </form>
          </div>
          {cur && (
            <div className="card pad" style={{ background: 'linear-gradient(120deg,var(--accent-soft),var(--surface) 60%)', borderColor: 'var(--accent-line)' }} key={cur.rank}>
              <div className="row between center"><span className="lbl">Insight fixado</span><Icon n="pin" s={15} /></div>
              <div className="h3 ap-pinh" style={{ margin: '6px 0 8px' }}>{cur.insight.corner}: {cur.insight.what}</div>
              <p className="muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                <b style={{ color: 'var(--ink-2)' }}>Por quê:</b> {cur.insight.why} <br />
                <b style={{ color: 'var(--ink-2)' }}>Corrigir:</b> {cur.insight.fix} <br />
                <b style={{ color: 'var(--ink-2)' }}>Validar:</b> {cur.insight.validate}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
