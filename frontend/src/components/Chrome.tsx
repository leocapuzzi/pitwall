import Icon from './Icon'
import type { View } from '../lib/api'

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'engineer', label: 'Race Engineer' },
]
function topGroup(view: View) { return view === 'dashboard' ? 'dashboard' : 'engineer' }

export function TopNav({ view, go, onSettings, settingsOn }: {
  view: View; go: (v: View) => void; onSettings?: () => void; settingsOn?: boolean
}) {
  const grp = topGroup(view)
  return (
    <header className="topnav">
      <div className="brand">
        <img className="brandmark" src="/assets/ligma-logo.png" alt="LIGMA Racing" />
        <div className="bn">LIGMA<small>RACING · PITWALL</small></div>
      </div>
      <nav className="mainnav">
        {NAV.map(n => (
          <button key={n.id} className={grp === n.id ? 'on' : ''}
            onClick={() => go(n.id === 'dashboard' ? 'dashboard' : 'telemetry')}>
            {n.label}
          </button>
        ))}
      </nav>
      <div className="navr">
        <button className={'iconbtn' + (settingsOn ? ' on' : '')} onClick={onSettings}
          title="Settings" aria-label="Settings"><Icon n="gear" /></button>
        <button className="iconbtn"><Icon n="bell" /><span className="badge"></span></button>
        <button className="iconbtn"><Icon n="info" /></button>
        <div className="userchip">
          <img className="ava" src="/assets/ligma-driver-face.png" alt="L. Capuzzi" />
          <div className="un">L. Capuzzi<small>Driver</small></div>
          <span style={{ color: 'var(--ink-3)' }}><Icon n="chevD" s={14} /></span>
        </div>
      </div>
    </header>
  )
}

const WS: { id: View; label: string }[] = [
  { id: 'stint', label: 'Stint' },
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'lap', label: 'Lap Analysis' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'ai', label: 'AI Engineer' },
]
export function SessionStrip({ view, go, label, onSessions, sessOn }: {
  view: View; go: (v: View) => void; label?: string
  onSessions?: () => void; sessOn?: boolean
}) {
  return (
    <div className="tabstrip">
      <div className="stab idle"><span>Waiting for session</span></div>
      <button className={'stab on pw-sessbtn' + (sessOn ? ' menuon' : '')} onClick={onSessions}
        title="Escolher sessão" aria-label="Escolher sessão" aria-expanded={!!sessOn}>
        <span className="dot acc"></span>
        <span className="pw-sesslabel">{label || 'Sessão'}</span>
        <span className="x pw-sesschev"><Icon n="chevD" s={13} sw={2.2} /></span>
      </button>
      <div className="add" onClick={onSessions} role="button" aria-label="Escolher sessão">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </div>
      <div className="ws-switch">
        {WS.map(w => (
          <button key={w.id} className={view === w.id ? 'on' : ''} onClick={() => go(w.id)}>{w.label}</button>
        ))}
      </div>
    </div>
  )
}

export function StatusBar({ text = 'Waiting for session…' }: { text?: string }) {
  return (
    <footer className="statusbar"><Icon n="telem" s={15} sw={2} /> Race Engineer
      <span className="live"><i></i> {text}</span></footer>
  )
}
