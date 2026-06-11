// Cliente da API do PitWall (FastAPI em src/server.py). Tipos frouxos de propósito —
// o payload vem de webdata.build_session_payload; refinamos conforme as telas usarem.

export type View = 'dashboard' | 'stint' | 'telemetry' | 'lap' | 'comparison' | 'ai'

export interface SessionInfo { file: string; path: string; mtime: number }

export interface Channels {
  throttle: number[]; brake: number[]; speed: number[]; rpm: number[]; gear: number[]; steer: number[]
}
export interface Corner { n: number; name: string; apex_pct: number }
export interface LapRow {
  n: number; t: number; valid: boolean; pit: boolean; clean: boolean; best: boolean
  s: number[]; fuel: number | null
}
export interface Insight {
  corner: string; apex_pct: number; phase: string; cost_s: number; cost_weighted: number
  straight_m: number; flags: string[]; what: string; why: string; fix: string; validate: string
}
export interface Payload {
  contexto: Record<string, any>
  eixoDist: number[]
  delta: number[]
  ref: Channels
  media: Channels
  track: { x: number[]; y: number[] }        // pista FIXA do circuito (centerline)
  racing_line: { x: number[]; y: number[] }  // linha da sessão (overlay), mesmo referencial
  track_fixed: boolean
  track_edges?: { left: { x: number[]; y: number[] }; right: { x: number[]; y: number[] } } | null
  track_width_m?: number | null
  racing_line_b?: { x: number[]; y: number[] } | null  // linha da MÉDIA (fantasma)
  ref_time?: number[]                                   // tempo da melhor até cada ponto (s)
  corners: Corner[]
  setores: number[]
  sectorTimes: { labels: string[]; ref: number[]; media: number[]; genericos: boolean }
  scorecard: Record<string, number>
  insights: Insight[]
  laps?: LapRow[]
  analise_curvas: Array<Record<string, any>>
}

export async function getSessions(): Promise<SessionInfo[]> {
  const r = await fetch('/api/sessions')
  if (!r.ok) throw new Error('Falha ao listar sessões')
  return r.json()
}

export async function getSession(path: string): Promise<Payload> {
  const r = await fetch('/api/session?path=' + encodeURIComponent(path))
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Falha ao carregar sessão')
  return j
}
