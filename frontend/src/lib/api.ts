// Cliente da API do PitWall (FastAPI em src/server.py). Tipos frouxos de propósito —
// o payload vem de webdata.build_session_payload; refinamos conforme as telas usarem.

export type View = 'dashboard' | 'stint' | 'telemetry' | 'lap' | 'comparison' | 'ai'

export interface SessionInfo { file: string; path: string; mtime: number }

export interface Channels {
  throttle: number[]; brake: number[]; speed: number[]; rpm: number[]; gear: number[]; steer: number[]
}
// Pneus: temps por banda (outer/middle/inner, já mapeadas pelo lado da roda)
// e pressão (kPa), alinhadas ao grid — inteiros
export interface TyreData { o: number[]; m: number[]; i: number[]; p: number[] }
export interface TyreSet { lf: TyreData; rf: TyreData; lr: TyreData; rr: TyreData }
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
  tyres?: { ref: TyreSet | null; media: TyreSet | null } | null
  corners: Corner[]
  setores: number[]
  sectorTimes: { labels: string[]; ref: number[]; media: number[]; genericos: boolean }
  scorecard: Record<string, number>
  insights: Insight[]
  laps?: LapRow[]
  analise_curvas: Array<Record<string, any>>
}

// Índice leve de voltas de uma sessão (picker da Comparison)
export interface LapsIndex {
  carro: string | null; pista: string; trackId: number | string | null
  arquivo: string; laps: LapRow[]
}
// Uma volta arbitrária, alinhada ao grid padrão (comparável entre sessões)
export interface LapData {
  n: number; t: number; valid: boolean
  trackId: number | string | null; arquivo: string
  ch: Channels
  time: number[]                                  // tempo até cada ponto do grid
  line: { x: number[]; y: number[] } | null      // linha no referencial da pista fixa
  sectors: number[]
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

export async function getLaps(path: string): Promise<LapsIndex> {
  const r = await fetch('/api/laps?path=' + encodeURIComponent(path))
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Falha ao listar voltas')
  return j
}

export async function getLap(path: string, lap: number): Promise<LapData> {
  const r = await fetch('/api/lap?path=' + encodeURIComponent(path) + '&lap=' + lap)
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Falha ao carregar a volta')
  return j
}
