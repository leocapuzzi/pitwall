import Icon from './Icon'

// Pod de piloto (padrão GO Fast): coluna do VOLANTE à esquerda (gira com a direção
// real; anel externo cresce p/ o lado da esterçada) + 2 linhas (nome/tempo, barras).
// Os valores são atualizados IMPERATIVAMENTE pela tela via [data-f] (thr/thrbar/brk/
// brkbar/spd/gear/rpm/wheel/steerarc) — este componente é só o markup.
// `onOpen` (opcional) torna o card clicável e mostra a seta de expandir (GO Fast).
export default function DriverPod({ podRef, on, name, time, sub, onOpen, openTitle }: {
  podRef: React.RefObject<HTMLDivElement | null>
  on?: boolean
  name: string
  time: string
  sub: string
  onOpen?: () => void
  openTitle?: string
}) {
  return (
    <div className={'pw-pod pw-glass2' + (on ? ' on' : '') + (onOpen ? ' pw-open' : '')} ref={podRef}
      onClick={onOpen} role={onOpen ? 'button' : undefined} title={onOpen ? (openTitle || 'Abrir a tabela do stint') : undefined}>
      <span className="pw-wheelicon">
        <svg viewBox="0 0 32 32" width="36" height="36">
          <circle cx="16" cy="16" r="14.2" fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="2.2" />
          <circle data-f="steerarc" cx="16" cy="16" r="14.2" fill="none" stroke="currentColor" strokeWidth="2.2" pathLength="100" strokeDasharray="0 100" strokeLinecap="round" transform="rotate(-90 16 16)" />
          <g data-f="wheel" style={{ transformOrigin: '16px 16px' }}>
            <circle cx="16" cy="16" r="9.4" fill="none" stroke="currentColor" strokeWidth="2.1" />
            <path d="M16 6.6v4 M16 16l-6 4.6 M16 16l6 4.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" fill="none" />
            <rect x="14.5" y="5.4" width="3" height="3.8" rx="1.1" fill="currentColor" />
            <circle cx="16" cy="16" r="2.5" fill="currentColor" />
          </g>
        </svg>
      </span>
      <div className="pw-podbody">
        <div className="row center gap8">
          <b className="nm">{name}</b>
          <span className="meta">{sub} · <Icon n="clock" s={11} sw={2} /> <b className="num" style={{ color: 'var(--ink)' }}>{time}</b></span>
          {onOpen && <span className="pw-podexp"><Icon n="ext" s={11} sw={2.2} /></span>}
        </div>
        <div className="row center gap8 pw-bars">
          <span className="num pct" data-f="thr">0%</span>
          <div className="bar"><i className="t" data-f="thrbar" /></div>
          <span className="num pct" data-f="brk">0%</span>
          <div className="bar"><i className="b" data-f="brkbar" /></div>
          <b className="num" data-f="spd" style={{ color: 'var(--ink)', fontSize: 12.5 }}>0</b><i className="un">km/h</i>
          <span className="num">|H| <b data-f="gear" style={{ color: 'var(--ink)' }}>0</b></span>
          <span className="num">RPM <b data-f="rpm" style={{ color: 'var(--ink)' }}>0</b></span>
        </div>
      </div>
    </div>
  )
}
