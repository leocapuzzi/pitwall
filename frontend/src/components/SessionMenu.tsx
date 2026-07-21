import { useEffect, useState } from 'react'
import Icon from './Icon'
import { useSession } from '../lib/useSession'
import { getG61Status, type G61Status } from '../lib/api'

// Nome padrão do iRacing: "<carro>_<pista> <YYYY-MM-DD HH-MM-SS>.ibt"
// (a pista e o carro "bonitos" só existem no payload carregado; na lista usamos o nome)
export function parseIbtName(file: string): { car: string; track: string; when: string | null } {
  const m = file.match(/^(.+?)_(.+?) (\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})\.ibt$/i)
  if (!m) return { car: file.replace(/\.ibt$/i, ''), track: '', when: null }
  const [, car, track, Y, Mo, D, h, mi] = m
  return { car, track, when: `${D}/${Mo}/${Y.slice(2)} · ${h}:${mi}` }
}

export default function SessionMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sessions, current, loading, load } = useSession()
  // Saúde do Garage61: se configurado mas falhando, avisar (antes sumia calado).
  const [g61, setG61] = useState<G61Status | null>(null)
  useEffect(() => { if (open) getG61Status().then(setG61).catch(() => setG61(null)) }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {open && <div className="pw-set-veil" onClick={onClose} />}
      <div className={'pw-sessmenu pw-glass2' + (open ? ' open' : '')} role="dialog"
        aria-label="Choose session" aria-hidden={!open}>
        <div className="pw-sess-head" style={{ '--i': 0 } as React.CSSProperties}>
          <div>
            <div className="pw-set-title">SESSIONS</div>
            <div className="pw-set-sub">{sessions.length} recorded · newest first</div>
          </div>
          <button className="pw-set-x" onClick={onClose} aria-label="Close"><Icon n="x" s={15} /></button>
        </div>
        {g61?.available && g61.error && (
          <div style={{ margin: '0 14px 8px', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,90,90,.10)', border: '1px solid rgba(255,90,90,.28)', fontSize: 11, lineHeight: 1.4, color: 'var(--ink-2)' }}>
            <b style={{ color: 'var(--red)' }}>Garage61 unavailable</b> — couldn't list your laps ({g61.error}). Local sessions still work.
          </div>
        )}
        <div className="pw-sess-list">
          {sessions.map((s, i) => {
            const on = s.path === current
            // sessão VIRTUAL do Garage61: path "g61:<lapId>", file "pista|carro|tempo"
            const g61 = s.path.startsWith('g61:')
            const [gTrack, gCar, gTime] = g61 ? s.file.split('|') : []
            const p = g61 ? null : parseIbtName(s.file)
            return (
              <button key={s.path} className={'pw-sess-item' + (on ? ' on' : '')}
                style={{ '--i': Math.min(i, 14) + 1 } as React.CSSProperties}
                disabled={loading && !on}
                onClick={() => { if (!on) void load(s.path); onClose() }}>
                <span className={'pw-sess-dot' + (on ? ' acc' : '')} />
                <span className="pw-sess-main">
                  <b>{g61 ? gTrack : (p!.track || p!.car)}</b>
                  <small>{g61 ? `Garage61 · ${gCar} · ${gTime}` : `${p!.track ? p!.car : 'arquivo de telemetria'}${p!.when ? ` · ${p!.when}` : ''}`}</small>
                </span>
                {on && <span className="pw-sess-now">ATIVA</span>}
              </button>
            )
          })}
          {!sessions.length && (
            <div className="pw-sess-empty">
              No sessions yet. Record 2–3 clean laps in iRacing (Alt+L logs telemetry), or add a Garage61 token in secrets.toml to open your Garage61 laps here.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
