import { useEffect, useState } from 'react'
import { getSessions, getSession, type Payload, type SessionInfo } from './api'

// Cache em memória (módulo) para não re-buscar a cada troca de tela.
let _cache: { sessions: SessionInfo[]; payload: Payload } | null = null

export function useSession() {
  const [sessions, setSessions] = useState<SessionInfo[]>(_cache?.sessions || [])
  const [payload, setPayload] = useState<Payload | null>(_cache?.payload || null)
  const [loading, setLoading] = useState(!_cache)
  const [error, setError] = useState<string | null>(null)

  async function load(path: string) {
    setLoading(true); setError(null)
    try {
      const p = await getSession(path)
      _cache = { sessions: _cache?.sessions || sessions, payload: p }
      setPayload(p)
    } catch (e: any) { setError(e?.message || 'Erro ao carregar sessão') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (_cache) return
    let cancel = false
    ;(async () => {
      try {
        const s = await getSessions()
        if (cancel) return
        setSessions(s)
        // Padrão: 1ª sessão com >=2 voltas limpas (comparação significativa).
        for (const x of s) {
          try {
            const p = await getSession(x.path)
            if ((p.contexto.voltasLimpas || 0) >= 2) { _cache = { sessions: s, payload: p }; if (!cancel) { setPayload(p); setLoading(false) } return }
          } catch { /* tenta a próxima */ }
        }
        // Fallback: qualquer sessão válida.
        for (const x of s) {
          try { const p = await getSession(x.path); _cache = { sessions: s, payload: p }; if (!cancel) { setPayload(p); setLoading(false) } return } catch { /* */ }
        }
        if (!cancel) { setError('Nenhuma sessão com voltas válidas'); setLoading(false) }
      } catch (e: any) { if (!cancel) { setError(e?.message || 'Erro ao listar sessões'); setLoading(false) } }
    })()
    return () => { cancel = true }
  }, [])

  return { sessions, payload, loading, error, load }
}
