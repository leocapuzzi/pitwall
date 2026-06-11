import { useEffect, useState } from 'react'
import Icon from './Icon'
import {
  GLASS_DEFAULTS, getGlassParams, setGlassParam, resetGlassParams,
  onGlassChange, type GlassParams,
} from '../lib/liquidGlass'

type Row = {
  k: keyof GlassParams; label: string
  min: number; max: number; step: number; dec: number; unit?: string
}

/* mesmos parâmetros do exemplo Apple Music do artigo (kube.io) */
const MAIN: Row[] = [
  { k: 'specOpacity', label: 'Specular opacity', min: 0, max: 1, step: 0.01, dec: 2 },
  { k: 'specSat', label: 'Specular saturation', min: 0, max: 12, step: 0.5, dec: 1 },
  { k: 'refraction', label: 'Refraction level', min: 0, max: 2, step: 0.02, dec: 2 },
  { k: 'blur', label: 'Blur level', min: 0, max: 16, step: 0.5, dec: 1, unit: 'px' },
  { k: 'progBlur', label: 'Progressive blur', min: 0, max: 24, step: 0.5, dec: 1, unit: 'px' },
  { k: 'bgOpacity', label: 'Glass bg opacity', min: 0, max: 0.9, step: 0.01, dec: 2 },
]
/* física do vidro (estes reconstroem o displacement map) */
const PHYS: Row[] = [
  { k: 'bezel', label: 'Bezel width', min: 4, max: 40, step: 1, dec: 0, unit: 'px' },
  { k: 'thickness', label: 'Glass thickness', min: 6, max: 60, step: 1, dec: 0, unit: 'px' },
  { k: 'refIndex', label: 'Refractive index', min: 1.1, max: 2.4, step: 0.02, dec: 2 },
  { k: 'lightAngle', label: 'Light angle', min: -180, max: 180, step: 5, dec: 0, unit: '°' },
  { k: 'satBoost', label: 'Backdrop saturation', min: 0, max: 3, step: 0.05, dec: 2 },
]

function Slider({ row, value, i }: { row: Row; value: number; i: number }) {
  const pct = (value - row.min) / (row.max - row.min)
  return (
    <div className="pw-set-row" style={{ '--i': i } as React.CSSProperties}>
      <label>{row.label}</label>
      <span className="val num">{value.toFixed(row.dec)}{row.unit || ''}</span>
      <input
        type="range" min={row.min} max={row.max} step={row.step} value={value}
        style={{ '--p': pct } as React.CSSProperties}
        onChange={e => setGlassParam(row.k, Number(e.target.value))}
      />
    </div>
  )
}

export default function SettingsMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [p, setP] = useState<GlassParams>(getGlassParams())
  useEffect(() => onGlassChange(setP), [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const isDefault = (Object.keys(GLASS_DEFAULTS) as (keyof GlassParams)[])
    .every(k => p[k] === GLASS_DEFAULTS[k])

  return (
    <>
      {open && <div className="pw-set-veil" onClick={onClose} />}
      <div className={'pw-settings pw-glass2' + (open ? ' open' : '')} role="dialog" aria-label="Settings" aria-hidden={!open}>
        <div className="pw-set-head">
          <div>
            <div className="pw-set-title">SETTINGS</div>
            <div className="pw-set-sub">Ajustes do PitWall</div>
          </div>
          <button className="pw-set-x" onClick={onClose} aria-label="Fechar">
            <Icon n="x" s={15} />
          </button>
        </div>

        <div className="pw-set-sec" style={{ '--i': 0 } as React.CSSProperties}>
          <span>LIQUID GLASS</span><i />
        </div>
        {MAIN.map((r, i) => <Slider key={r.k} row={r} value={p[r.k]} i={i + 1} />)}

        <div className="pw-set-sec" style={{ '--i': 7 } as React.CSSProperties}>
          <span>FÍSICA DO VIDRO</span><i />
        </div>
        {PHYS.map((r, i) => <Slider key={r.k} row={r} value={p[r.k]} i={i + 8} />)}

        <div className="pw-set-foot" style={{ '--i': 13 } as React.CSSProperties}>
          <button className="pw-set-reset" disabled={isDefault} onClick={resetGlassParams}>
            Restaurar padrão
          </button>
          <span className="pw-set-note">Tempo real · salvo neste navegador</span>
        </div>
      </div>
    </>
  )
}
