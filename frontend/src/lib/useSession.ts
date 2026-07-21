import { useEffect, useState } from 'react'
import { getSessions, getSession, getCompare, type CompareDesc, type Payload, type SessionInfo } from './api'

// Store de módulo com subscribers: todas as instâncias do hook (telas, chrome)
// enxergam a MESMA sessão e re-renderizam juntas quando ela troca.
type State = {
  sessions: SessionInfo[]
  payload: Payload | null
  current: string | null // path do .ibt carregado
  compare: { a: CompareDesc; b: CompareDesc } | null // A/B livres (pods) ou null = padrão
  loading: boolean
  error: string | null
}
let state: State = { sessions: [], payload: null, current: null, compare: null, loading: true, error: null }
const subs = new Set<() => void>()
function set(patch: Partial<State>) { state = { ...state, ...patch }; subs.forEach(f => f()) }

// Escolha do usuário lembrada só nesta aba (sessionStorage): reabrir o app
// volta ao padrão "mais recente utilizável".
const STORE_KEY = 'pw_session'

let booted = false
async function boot() {
  if (booted) return
  booted = true
  try {
    const s = await getSessions()
    set({ sessions: s })
    const saved = (() => { try { return sessionStorage.getItem(STORE_KEY) } catch { return null } })()
    const order = [...(saved ? s.filter(x => x.path === saved) : []), ...s]
    // Sessões VIRTUAIS do Garage61 nunca têm "voltas limpas" — ficam FORA da
    // varredura (senão o boot baixaria todas as voltas do G61 antes de abrir).
    const locais = order.filter(x => !x.path.startsWith('g61:'))
    const virtuais = order.filter(x => x.path.startsWith('g61:'))
    const carregadas = new Map<string, Payload>()
    // Padrão: 1ª sessão LOCAL com >=2 voltas limpas (comparação significativa).
    for (const x of locais) {
      try {
        const p = await getSession(x.path)
        carregadas.set(x.path, p)
        if ((p.contexto.voltasLimpas || 0) >= 2) { set({ payload: p, current: x.path, loading: false }); return }
      } catch { /* tenta a próxima */ }
    }
    // Fallback 1: qualquer local válida (reusa o que já foi carregado acima).
    for (const x of locais) {
      const p = carregadas.get(x.path)
      if (p) { set({ payload: p, current: x.path, loading: false }); return }
    }
    // Fallback 2: 1ª sessão virtual do Garage61 que carregar.
    for (const x of virtuais) {
      try { const p = await getSession(x.path); set({ payload: p, current: x.path, loading: false }); return } catch { /* */ }
    }
    set({ error: 'No session with valid laps yet. Record 2–3 clean laps in iRacing (Alt+L to log telemetry), or add a Garage61 token in secrets.toml to open your Garage61 laps.', loading: false })
  } catch (e: any) { set({ error: e?.message || 'Error listing sessions', loading: false }) }
}

export async function loadSession(path: string) {
  if (state.current === path && state.payload && !state.compare) return
  set({ loading: true, error: null })
  try {
    const p = await getSession(path)
    try { sessionStorage.setItem(STORE_KEY, path) } catch { /* ignore */ }
    set({ payload: p, current: path, compare: null, loading: false })
  } catch (e: any) { set({ error: e?.message || 'Error loading session', loading: false }) }
}

// Comparação livre dos pods A/B: re-analisa o par no backend e troca o payload
// inteiro (delta, setores, coaching…) — todas as telas atualizam juntas.
export async function setCompare(a: CompareDesc, b: CompareDesc) {
  if (!state.current) return
  set({ loading: true, error: null })
  try {
    const p = await getCompare(state.current, a, b)
    set({ payload: p, compare: { a, b }, loading: false })
  } catch (e: any) {
    set({ loading: false, error: null })
    throw e // quem abriu o picker mostra o erro sem derrubar a tela atual
  }
}

// Aplica a escolha de UM pod mantendo o outro lado; desc null = padrão do lado.
// Padrões: A = melhor volta da sessão atual, B = média das limpas.
export async function applyPodPick(side: 'A' | 'B', desc: CompareDesc | null) {
  const cur = state.current
  if (!cur) return
  // Sessão VIRTUAL do Garage61 ("g61:<lapId>"): o padrão dos dois lados é a própria volta.
  const virt = cur.startsWith('g61:')
  const lapId = virt ? cur.slice(4) : ''
  const defA: CompareDesc = virt ? { type: 'g61', lapId } : { type: 'local', path: cur, lap: null }
  const defB: CompareDesc = virt ? { type: 'g61', lapId } : { type: 'media' }
  const a = side === 'A' ? (desc ?? defA) : (state.compare?.a ?? defA)
  const b = side === 'B' ? (desc ?? defB) : (state.compare?.b ?? defB)
  const aDef = virt ? (a.type === 'g61' && a.lapId === lapId)
    : (a.type === 'local' && a.path === cur && a.lap == null)
  const bDef = virt ? (b.type === 'g61' && b.lapId === lapId) : b.type === 'media'
  if (aDef && bDef) { if (state.compare) await resetCompare(); return }
  await setCompare(a, b)
}

// Volta ao padrão da sessão (sua melhor vs média).
export async function resetCompare() {
  if (!state.current || !state.compare) return
  set({ loading: true, error: null })
  try {
    const p = await getSession(state.current)
    set({ payload: p, compare: null, loading: false })
  } catch (e: any) { set({ error: e?.message || 'Error reloading session', loading: false }) }
}

export function useSession() {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force(n => n + 1)
    subs.add(f)
    void boot()
    return () => { subs.delete(f) }
  }, [])
  return {
    sessions: state.sessions, payload: state.payload, current: state.current,
    compare: state.compare, loading: state.loading, error: state.error,
    load: loadSession, setCompare, resetCompare, applyPodPick,
  }
}
