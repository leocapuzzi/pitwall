// Toggle segmentado com indicador deslizante (compartilhado entre as telas).
export default function SlideSeg({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const i = Math.max(0, options.indexOf(value))
  return (
    <div className="sseg accent">
      <span className="sseg-ind" style={{ left: `calc(3px + ${i} * ((100% - 6px)/${options.length}))`, width: `calc((100% - 6px)/${options.length})` }} />
      {options.map(o => <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  )
}
