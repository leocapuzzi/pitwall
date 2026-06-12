// Preferências dos canais do painel da Telemetry: ordem e visibilidade.
// Persistem neste navegador (localStorage); o painel "Canais" da tela edita.

export interface ChannelPrefs { order: string[]; hidden: string[] }

export const CHANNEL_ORDER = ['delta', 'speed', 'throttle', 'brake', 'rpm', 'gear', 'steering']
const KEY = 'pw_channels_v1'

function load(): ChannelPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<ChannelPrefs>
    const order = [
      ...(saved.order || []).filter(k => CHANNEL_ORDER.includes(k)),
      ...CHANNEL_ORDER.filter(k => !(saved.order || []).includes(k)), // canais novos entram no fim
    ]
    return { order, hidden: (saved.hidden || []).filter(k => CHANNEL_ORDER.includes(k)) }
  } catch { return { order: [...CHANNEL_ORDER], hidden: [] } }
}

let cur: ChannelPrefs = load()
const subs = new Set<(p: ChannelPrefs) => void>()
function save(next: ChannelPrefs) {
  cur = next
  try { localStorage.setItem(KEY, JSON.stringify(cur)) } catch { /* ignore */ }
  subs.forEach(f => f(cur))
}

export function getChannelPrefs(): ChannelPrefs { return cur }
export function moveChannel(kind: string, dir: 1 | -1) {
  const o = [...cur.order]
  const i = o.indexOf(kind), j = i + dir
  if (i < 0 || j < 0 || j >= o.length) return
  ;[o[i], o[j]] = [o[j], o[i]]
  save({ ...cur, order: o })
}
export function toggleChannel(kind: string) {
  const hidden = cur.hidden.includes(kind) ? cur.hidden.filter(k => k !== kind) : [...cur.hidden, kind]
  if (hidden.length >= cur.order.length) return // nunca esconder o último canal
  save({ ...cur, hidden })
}
export function resetChannelPrefs() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  save({ order: [...CHANNEL_ORDER], hidden: [] })
}
export function onChannelPrefs(f: (p: ChannelPrefs) => void) {
  subs.add(f)
  return () => { subs.delete(f) }
}
