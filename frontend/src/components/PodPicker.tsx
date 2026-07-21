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
          lista = [{ carId: ctx.carId, car: ctx.carro || 'Session car', laps: 0 }, ...lista]
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
      .catch(e => { if (!cancel) setErr(e?.message || 'Failed to list laps') })
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
      .catch(e => { if (!cancel) setErr(e?.message || 'Failed to fetch from Garage61') })
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
    catch (e: any) { setErr(e?.message || 'Failed to build comparison'); setBusy(false) }
  }

  const wrongTrack = !!(idx && ctx.trackId != null && idx.trackId != null && String(idx.trackId) !== String(ctx.trackId))
  const temMedia = (ctx.voltasLimpas || 0) > 0

  return createPortal(
    <div className="pw-modal" onClick={onClose}>
      <div className="pw-modalcard pw-glass2 pw-pickcard" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="pw-modalhead">
          <span className="mic"><Icon n="telem" s={18} /></span>
          <b className="ttl">{isA ? 'Your lap (side A)' : 'Compare against (side B)'}</b>
          <button className="pw-modalx" onClick={onClose} aria-label="Close">
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
            <select className="pw-picksess" value={path} onChange={e => setPath(e.target.value)} aria-label="Session">
              {compat.map(s => {
                const pi = parseIbtName(s.file)
                return <option key={s.path} value={s.path}>{(pi.when || s.file) + (s.path === current ? ' · current' : '')}</option>
              })}
            </select>
          )}
          {src === 'g61' && (
            cars && cars.length
              ? <select className="pw-picksess" value={carSel ?? ''} aria-label="Car"
                  onChange={e => setCarSel(e.target.value === '' ? null : Number(e.target.value))}>
                  {cars.map(c => (
                    <option key={String(c.carId)} value={c.carId ?? ''}>
                      {c.car}{isA && c.laps > 0 ? ` · ${c.laps} lap${c.laps > 1 ? 's' : ''}` : ''}
                    </option>
                  ))}
                </select>
              : <span className="muted" style={{ fontSize: 12 }}>{isA ? 'Your laps on Garage61' : 'Best lap per driver'}</span>
          )}
        </div>
        {isA && !virtBase && (
          <div style={{ padding: '0 14px 6px' }}>
            <SlideSeg options={['Local sessions', 'Garage61 (mine)']}
              value={src === 'local' ? 'Local sessions' : 'Garage61 (mine)'}
              onChange={v => setSrc(v === 'Garage61 (mine)' ? 'g61' : 'local')} />
          </div>
        )}
        <div className="pw-pickbody">
          {/* lado B: a média da sessão fica fixa no topo (sessões locais) */}
          {!isA && !virtBase && !busy && (
            <div className="pw-g61list" style={{ marginBottom: 6 }}>
              <button className="pw-g61row" disabled={!temMedia}
                onClick={() => temMedia && apply({ type: 'media' })}
                title={temMedia ? "Average of the session's clean laps" : 'The session has no clean laps'}>
                <span className="pw-g61drv">My average</span>
                <b className="num">{temMedia ? `${ctx.voltasLimpas} clean` : '—'}</b>
                <span className={'pw-g61tag' + (temMedia ? ' ok' : '')}>{temMedia ? 'default' : 'no clean laps'}</span>
              </button>
            </div>
          )}
          {busy && <div className="pw-pickmsg">{src === 'g61' ? 'Fetching from Garage61…' : 'Loading…'}</div>}
          {!busy && err && <div className="pw-pickmsg redt">{err}</div>}
          {!busy && !err && isA && src === 'local' && wrongTrack &&
            <div className="pw-pickmsg redt">This session is from ANOTHER track — you can only compare laps from the same track.</div>}
          {!busy && !err && isA && src === 'local' && idx && !wrongTrack && (
            idx.laps.length
              ? <div className="pw-g61list">
                  {idx.laps.map(l => (
                    <button key={l.n} className="pw-g61row" onClick={() => apply({ type: 'local', path, lap: l.n })}
                      title="Use this lap as A">
                      <span className="pw-g61drv">Lap {l.n}</span>
                      <b className="num">{fmtClock(l.t)}</b>
                      {l.best && <span className="pw-g61tag ok">best</span>}
                      {l.clean && !l.best && <span className="pw-g61tag ok">clean</span>}
                      {!l.valid && <span className="pw-g61tag">invalid</span>}
                      {l.pit && <span className="pw-g61tag">pit</span>}
                    </button>
                  ))}
                </div>
              : <div className="pw-pickmsg">Session has no laps with a completed time.</div>
          )}
          {!busy && !err && src === 'g61' && g61 && (
            g61.laps.length
              ? <div className="pw-g61list">
                  {g61.laps.map(l => (
                    <button key={l.id} className="pw-g61row" disabled={!l.telemetry}
                      onClick={() => l.telemetry && apply({ type: 'g61', lapId: l.id })}
                      title={l.telemetry ? `Use this lap as ${side}` : 'No visible telemetry (driver without Pro)'}>
                      <span className="pw-g61drv">{l.driver}</span>
                      <b className="num">{fmtClock(l.lapTime)}</b>
                      {l.clean ? <span className="pw-g61tag ok">clean</span> : <span className="pw-g61tag">dirty</span>}
                      {!l.telemetry && <span className="pw-g61tag">no telemetry</span>}
                    </button>
                  ))}
                </div>
              : <div className="pw-pickmsg">{isA ? "You don't have laps for this track + car on Garage61 yet." : 'No reference lap for this car + track on Garage61.'}</div>
          )}
        </div>
        <div className="pw-pickfoot">
          <button className="pw-set-reset" onClick={() => { onDefault(); onClose() }}>
            Use default ({virtBase ? "the session's own lap" : isA ? 'your session best' : 'average of clean laps'})
          </button>
          <span className="pw-set-note">Tyres &amp; fuel only exist in local laps (.ibt)</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
