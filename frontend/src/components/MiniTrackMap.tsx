import { useMemo, useState } from 'react'
import type { TrackPair } from '../lib/track'

// Minimapa flutuante (Lap Analysis, estilo GO Fast): contorno da pista + balões de
// curva. Curvas com MAIOR perda pulsam (sonar vermelho); hover mostra a perda;
// clique dispara onPick (abre o trecho na Telemetry). Posição do carro = ponto claro.
export interface MiniCorner { n: number; apex: number; d: number }

export default function MiniTrackMap({ pair, corners, active, onPick, carDotRef, footer, className }: {
  pair: TrackPair
  corners: MiniCorner[]
  active?: number | null
  onPick: (n: number) => void
  carDotRef?: (el: SVGCircleElement | null) => void
  footer?: { label: string; value: string; danger?: boolean }
  className?: string
}) {
  const [hover, setHover] = useState<(MiniCorner & { x: number; y: number }) | null>(null)
  // sonar nas 3 maiores perdas relevantes (> 0.05s)
  const sonar = useMemo(() => new Set(
    [...corners].filter(c => c.d > 0.05).sort((a, b) => b.d - a.d).slice(0, 3).map(c => c.n)
  ), [corners])
  const pos = useMemo(() => {
    const tp = pair.track.pts, tn = tp.length
    const at = (apex: number) => tp[Math.min(tn - 1, Math.max(0, Math.round(apex * (tn - 1))))] || { x: 0, y: 0 }
    return corners.map(c => ({ ...c, ...at(c.apex) }))
  }, [pair, corners])

  return (
    <div className={className || 'pw-minimap'}>
      <div className="pw-mmstage" style={{ aspectRatio: '1000 / 640' }}>
        <svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {pair.edges
            ? <path d={pair.edges.roadD} fill="rgba(244,247,246,.10)" stroke="none" />
            : <path d={pair.track.d} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
          <path d={pair.racing.d} fill="none" stroke="rgba(255,255,255,.34)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <circle ref={carDotRef} r={4} fill="#fff" style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,.8))' }} />
        </svg>
        {pos.map(c => {
          const lx = c.x / 1000 * 100, ly = c.y / 640 * 100
          return (
            <div key={c.n} className={'pw-mmdot' + (c.d > 0.05 ? ' loss' : '') + (active === c.n ? ' on' : '')}
              style={{ left: lx + '%', top: ly + '%' }}
              onPointerEnter={() => setHover(c)} onPointerLeave={() => setHover(h => (h?.n === c.n ? null : h))}
              onClick={() => onPick(c.n)}>
              {sonar.has(c.n) && <span className="pw-sonar" />}
              {c.n}
            </div>
          )
        })}
        {hover && (
          <div className="pw-mmtip" style={{ left: hover.x / 1000 * 100 + '%', top: hover.y / 640 * 100 + '%' }}>
            T{hover.n} · {hover.d > 0 ? <>perda <b>+{hover.d.toFixed(2)}s</b></> : <>ganho <b style={{ color: 'var(--accent)' }}>−{Math.abs(hover.d).toFixed(2)}s</b></>}
          </div>
        )}
      </div>
      {footer && (
        <div className="row between center" style={{ marginTop: 9 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 13.5 }}>{footer.label}</b>
          <b className={'num ' + (footer.danger ? 'redt' : 'green')} style={{ fontSize: 13 }}>{footer.value}</b>
        </div>
      )}
    </div>
  )
}
