import { useEffect, useState } from 'react'
import { getSessions, getSession, type Payload, type SessionInfo } from './api'

// Store de módulo com subscribers: todas as instâncias do hook (telas, chrome)
// enxergam a MESMA sessão e re-renderizam juntas quando ela troca.
type State = {
  sessions: SessionInfo[]
  payload: Payload | null
  current: string | null // path do .ibt carregado
  loading: boolean
  error: string | null
}
let state: State = { sessions: [], payload: null, current: null, loading: true, error: null }
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
    // Padrão: 1ª sessão com >=2 voltas limpas (comparação significativa).
    for (const x of order) {
      try {
        const p = await getSession(x.path)
        if ((p.contexto.voltasLimpas || 0) >= 2) { set({ payload: p, current: x.path, loading: false }); return }
      } catch { /* tenta a próxima */ }
    }
    // Fallback: qualquer sessão válida.
    for (const x of order) {
      try { const p = await getSession(x.path); set({ payload: p, current: x.path, loading: false }); return } catch { /* */ }
    }
    set({ error: 'Nenhuma sessão com voltas válidas', loading: false })
  } catch (e: any) { set({ error: e?.message || 'Erro ao listar sessões', loading: false }) }
}

export async function loadSession(path: string) {
  if (state.current === path && state.payload) return
  set({ loading: true, error: null })
  try {
    const p = await getSession(path)
    try { sessionStorage.setItem(STORE_KEY, path) } catch { /* ignore */ }
    set({ payload: p, current: path, loading: false })
  } catch (e: any) { set({ error: e?.message || 'Erro ao carregar sessão', loading: false }) }
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
    loading: state.loading, error: state.error, load: loadSession,
  }
}
