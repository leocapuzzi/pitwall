import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import SlideSeg from './SlideSeg'
import { parseIbtName } from './SessionMenu'
import { fmtClock } from '../lib/fmt'
import {
  getLaps, getG61Laps, getG61MyLaps, getG61Cars,
  type CompareDesc, type G61Car, type G61LapsIndex, type LapsIndex, type Payload, type SessionInfo,
} from '../lib/api'

// Picker GLOBAL dos pods A/B (fluxo combinado com o Leo):
//   A ("Sua melhor") -> MINHAS voltas: sessões locais (mesma pista+carro) ou minhas voltas do Garage61
//   B ("Média")      -> média da sessão (se houver voltas limpas) ou volta do Garage61 (equipe)
// Aplicar troca o payload INTEIRO via /api/compare (delta, setores, coaching, tudo).
export default function PodPicker({ side, payload, sessions, current, onApply, onDefault, onClose }: {
  side: 'A' | 'B'
  payload: Payload
  sessions: SessionInfo[]
  current: string | null
  onApply: (d: CompareDesc) => Promise<void>
  onDefault: () => void
  onClose: () => void
}) {
  const ctx = payload.contexto
  const isA = side === 'A'
  // sessão base VIRTUAL (Garage61): sem média/sessões locais casadas por nome
  const virtBase = String(current || '').startsWith('g61:')
  // só sessões locais do MESMO carro+pista (regra do projeto), pelo nome do arquivo
  const me = parseIbtName(ctx.arquivo || '')
  const compat = useMemo(() => sessions.filter(s => {
    if (s.path.startsWith('g61:')) return false
    const pi = parseIbtName(s.file)
    return !virtBase && pi.track === me.track && pi.car === me.car
  }), [sessions, me.track, me.car, virtBase])

  const [src, setSrc] = useState<'local' | 'g61'>(isA && !virtBase ? 'local' : 'g61')
  const [path, setPath] = useState<string>(current || compat[0]?.path || '')
  const [idx, setIdx] = useState<LapsIndex | null>(null)
  const [g61, setG61] = useState<G61LapsIndex | null>(null)
  const [cars, setCars] = useState<G61Car[] | null>(null)
  const [carSel, setCarSel] = useState<number | null>(ctx.carId ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // carros com voltas nesta pista (Garage61) — o picker deixa TROCAR o carro
  useEffect(() => {
    if (src !== 'g61' || ctx.trackId == null) return
    let cancel = false
    getG61Cars(ctx.trackId, isA)
      .then(r => {
        if (cancel) return
        // o carro da SESSÃO sempre aparece (a amostra da API é só a atividade recente)
        let lista = r.cars
        if (ctx.carId != null && !lista.some(c => String(c.carId) === String(ctx.carId)))
          lista = [{ carId: ctx.carId, car: ctx.carro || 'Carro da sessão', laps: 0 }, ...lista]
        setCars(lista)
        if (lista.length && !lista.some(c => c.carId != null && String(c.carId) === String(carSel ?? '')))
          setCarSel(lista[0].carId)
      })
      .catch(() => { if (!cancel) setCars([]) })
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isA, src, ctx.trackId])

  // voltas locais da sessão escolhida (lado A)
  useEffect(() => {
    if (!isA || src !== 'local' || !path) return
    let cancel = false
    setBusy(true); setErr(null); setIdx(null)
    getLaps(path)
      .then(r => { if (!cancel) setIdx(r) })
      .catch(e => { if (!cancel) setErr(e?.message || 'Falha ao listar voltas') })
      .finally(() => { if (!cancel) setBusy(false) })
    return () => { cancel = true }
  }, [isA, path, src])

  // Garage61: minhas voltas (A) ou melhor por piloto (B), do carro SELECIONADO
  useEffect(() => {
    if (src !== 'g61' || ctx.trackId == null) return
    let cancel = false
    setBusy(true); setErr(null); setG61(null)
    const fetcher = isA ? getG61MyLaps : getG61Laps
    fetcher(ctx.trackId, carSel)
      .then(r => { if (!cancel) setG61(r) })
      .catch(e => { if (!cancel) setErr(e?.message || 'Falha ao buscar no Garage61') })
      .finally(() => { if (!cancel) setBusy(false) })
    return () => { cancel = true }
  }, [isA, src, ctx.trackId, carSel])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = async (d: CompareDesc) => {
    setBusy(true); setErr(null)
    try { await onApply(d); onClose() }
    catch (e: any) { setErr(e?.message || 'Falha ao montar a comparação'); setBusy(false) }
  }

  const wrongTrack = !!(idx && ctx.trackId != null && idx.trackId != null && String(idx.trackId) !== String(ctx.trackId))
  const temMedia = (ctx.voltasLimpas || 0) > 0

  return createPortal(
    <div className="pw-modal" onClick={onClose}>
      <div className="pw-modalcard pw-glass2 pw-pickcard" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="pw-modalhead">
          <span className="mic"><Icon n="telem" s={18} /></span>
          <b className="ttl">{isA ? 'Sua volta (lado A)' : 'Comparar com (lado B)'}</b>
          <button className="pw-modalx" onClick={onClose} aria-label="Fechar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="pw-modalcar">
          <span className="cbadge" style={{ width: 38, height: 38 }}><Icon n="car" s={18} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b style={{ fontSize: 13.5, fontWeight: 800 }}>{ctx.carro}</b>
            <div className="muted" style={{ fontSize: 12 }}>{(src === 'g61' ? g61?.track : idx?.pista) || ctx.pista}</div>
          </div>
          {isA && src === 'local' && (
            <select className="pw-picksess" value={path} onChange={e => setPath(e.target.value)} aria-label="Sessão">
              {compat.map(s => {
                const pi = parseIbtName(s.file)
                return <option key={s.path} value={s.path}>{(pi.when || s.file) + (s.path === current ? ' · atual' : '')}</option>
              })}
            </select>
          )}
          {src === 'g61' && (
            cars && cars.length
              ? <select className="pw-picksess" value={carSel ?? ''} aria-label="Carro"
                  onChange={e => setCarSel(e.target.value === '' ? null : Number(e.target.value))}>
                  {cars.map(c => (
                    <option key={String(c.carId)} value={c.carId ?? ''}>
                      {c.car}{isA && c.laps > 0 ? ` · ${c.laps} volta${c.laps > 1 ? 's' : ''}` : ''}
                    </option>
                  ))}
                </select>
              : <span className="muted" style={{ fontSize: 12 }}>{isA ? 'Suas voltas no Garage61' : 'Melhor volta por piloto'}</span>
          )}
        </div>
        {isA && !virtBase && (
          <div style={{ padding: '0 14px 6px' }}>
            <SlideSeg options={['Sessões locais', 'Garage61 (minhas)']}
              value={src === 'local' ? 'Sessões locais' : 'Garage61 (minhas)'}
              onChange={v => setSrc(v === 'Garage61 (minhas)' ? 'g61' : 'local')} />
          </div>
        )}
        <div className="pw-pickbody">
          {/* lado B: a média da sessão fica fixa no topo (sessões locais) */}
          {!isA && !virtBase && !busy && (
            <div className="pw-g61list" style={{ marginBottom: 6 }}>
              <button className="pw-g61row" disabled={!temMedia}
                onClick={() => temMedia && apply({ type: 'media' })}
                title={temMedia ? 'Média das voltas limpas da sessão' : 'A sessão não tem voltas limpas'}>
                <span className="pw-g61drv">Minha média</span>
                <b className="num">{temMedia ? `${ctx.voltasLimpas} limpas` : '—'}</b>
                <span className={'pw-g61tag' + (temMedia ? ' ok' : '')}>{temMedia ? 'padrão' : 'sem limpas'}</span>
              </button>
            </div>
          )}
          {busy && <div className="pw-pickmsg">{src === 'g61' ? 'Buscando no Garage61…' : 'Carregando…'}</div>}
          {!busy && err && <div className="pw-pickmsg redt">{err}</div>}
          {!busy && !err && isA && src === 'local' && wrongTrack &&
            <div className="pw-pickmsg redt">Esta sessão é de OUTRA pista — só dá para comparar voltas da mesma pista.</div>}
          {!busy && !err && isA && src === 'local' && idx && !wrongTrack && (
            idx.laps.length
              ? <div className="pw-g61list">
                  {idx.laps.map(l => (
                    <button key={l.n} className="pw-g61row" onClick={() => apply({ type: 'local', path, lap: l.n })}
                      title="Usar esta volta como A">
                      <span className="pw-g61drv">Volta {l.n}</span>
                      <b className="num">{fmtClock(l.t)}</b>
                      {l.best && <span className="pw-g61tag ok">melhor</span>}
                      {l.clean && !l.best && <span className="pw-g61tag ok">limpa</span>}
                      {!l.valid && <span className="pw-g61tag">inválida</span>}
                      {l.pit && <span className="pw-g61tag">pit</span>}
                    </button>
                  ))}
                </div>
              : <div className="pw-pickmsg">Sessão sem voltas com tempo fechado.</div>
          )}
          {!busy && !err && src === 'g61' && g61 && (
            g61.laps.length
              ? <div className="pw-g61list">
                  {g61.laps.map(l => (
                    <button key={l.id} className="pw-g61row" disabled={!l.telemetry}
                      onClick={() => l.telemetry && apply({ type: 'g61', lapId: l.id })}
                      title={l.telemetry ? `Usar esta volta como ${side}` : 'Sem telemetria visível (piloto sem Pro)'}>
                      <span className="pw-g61drv">{l.driver}</span>
                      <b className="num">{fmtClock(l.lapTime)}</b>
                      {l.clean ? <span className="pw-g61tag ok">limpa</span> : <span className="pw-g61tag">suja</span>}
                      {!l.telemetry && <span className="pw-g61tag">sem telemetria</span>}
                    </button>
                  ))}
                </div>
              : <div className="pw-pickmsg">{isA ? 'Você ainda não tem voltas desta pista + carro no Garage61.' : 'Nenhuma volta de referência para este carro + pista no Garage61.'}</div>
          )}
        </div>
        <div className="pw-pickfoot">
          <button className="pw-set-reset" onClick={() => { onDefault(); onClose() }}>
            Usar padrão ({virtBase ? 'a própria volta da sessão' : isA ? 'sua melhor da sessão' : 'média das limpas'})
          </button>
          <span className="pw-set-note">Pneus e combustível só existem em voltas locais (.ibt)</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
