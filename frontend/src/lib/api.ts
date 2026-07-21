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
  source?: string                                 // 'garage61' quando é volta de referência
  driver?: string                                 // piloto (voltas do Garage61)
  car?: string | null
}

// ---- Garage61: voltas de referência (você + colegas de equipe) ----
export interface G61LapRow {
  id: string; driver: string; lapTime: number
  clean: boolean; telemetry: boolean; car: string | null
}
export interface G61LapsIndex {
  track: string | null; car?: string | null
  trackId?: number | string; laps: G61LapRow[]; error?: string
}

export async function getG61Laps(trackId: number | string, carId?: number | string | null): Promise<G61LapsIndex> {
  const q = '/api/g61/laps?trackId=' + encodeURIComponent(String(trackId)) +
    (carId != null ? '&carId=' + encodeURIComponent(String(carId)) : '')
  const r = await fetch(q)
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Failed to list Garage61 laps')
  return j
}

export interface G61Car { carId: number | null; car: string; laps: number }
export async function getG61Cars(trackId: number | string, mine?: boolean): Promise<{ trackId: number; cars: G61Car[] }> {
  const r = await fetch('/api/g61/cars?trackId=' + encodeURIComponent(String(trackId)) + (mine ? '&mine=1' : ''))
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Failed to list Garage61 cars')
  return j
}

export async function getG61MyLaps(trackId: number | string, carId?: number | string | null): Promise<G61LapsIndex> {
  const q = '/api/g61/mylaps?trackId=' + encodeURIComponent(String(trackId)) +
    (carId != null ? '&carId=' + encodeURIComponent(String(carId)) : '')
  const r = await fetch(q)
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Failed to list your Garage61 laps')
  return j
}

// ---- Comparação livre GLOBAL (pods A/B): payload completo re-analisado ----
export type CompareDesc =
  | { type: 'local'; path: string; lap: number | null }
  | { type: 'g61'; lapId: string }
  | { type: 'media' }

export async function getCompare(path: string, a: CompareDesc, b: CompareDesc, maxOff?: number): Promise<Payload> {
  const q = '/api/compare?path=' + encodeURIComponent(path) +
    '&a=' + encodeURIComponent(JSON.stringify(a)) +
    '&b=' + encodeURIComponent(JSON.stringify(b)) +
    (maxOff != null ? '&max_off=' + maxOff : '')
  const r = await fetch(q)
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Failed to build the comparison')
  return j
}

export async function getG61Lap(lapId: string, trackId: number | string | null, sectors?: number[]): Promise<LapData> {
  const q = '/api/g61/lap?lapId=' + encodeURIComponent(lapId) +
    (trackId != null ? '&trackId=' + encodeURIComponent(String(trackId)) : '') +
    (sectors && sectors.length ? '&sectors=' + sectors.join(',') : '')
  const r = await fetch(q)
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Failed to load the Garage61 lap')
  return j
}

export async function getSessions(): Promise<SessionInfo[]> {
  const r = await fetch('/api/sessions')
  if (!r.ok) throw new Error('Failed to list sessions')
  return r.json()
}

// Saúde da integração Garage61 (mostrada na UI quando falha, em vez de sumir calado)
export interface G61Status { available: boolean; error: string | null }
export async function getG61Status(): Promise<G61Status> {
  try {
    const r = await fetch('/api/g61/status')
    if (!r.ok) return { available: false, error: null }
    return r.json()
  } catch { return { available: false, error: null } }
}

export async function getSession(path: string): Promise<Payload> {
  const r = await fetch('/api/session?path=' + encodeURIComponent(path))
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Failed to load session')
  return j
}

export async function getLaps(path: string): Promise<LapsIndex> {
  const r = await fetch('/api/laps?path=' + encodeURIComponent(path))
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Failed to list laps')
  return j
}

export async function getLap(path: string, lap: number): Promise<LapData> {
  const r = await fetch('/api/lap?path=' + encodeURIComponent(path) + '&lap=' + lap)
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'Failed to load the lap')
  return j
}

// ---- Coach de IA (Grok) — chat do AI Engineer ----
export interface ChatStatus { available: boolean; model: string | null }
export async function getChatStatus(): Promise<ChatStatus> {
  const r = await fetch('/api/chat/status')
  if (!r.ok) return { available: false, model: null }
  return r.json()
}

export async function postChat(facts: any, messages: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
  const r = await fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ facts, messages }),
  })
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error || 'AI coach failed')
  return j.text
}

// ---- Engineer voice (KittenTTS, offline) ----
export interface TtsStatus { available: boolean; voice: string | null }
export async function getTtsStatus(): Promise<TtsStatus> {
  const r = await fetch('/api/tts/status')
  if (!r.ok) return { available: false, voice: null }
  return r.json()
}

// Synthesize `text` and return an object URL for an <audio>/Audio element.
export async function ttsUrl(text: string): Promise<string> {
  const r = await fetch('/api/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!r.ok) {
    let msg = 'Voice synthesis failed'
    try { msg = (await r.json()).error || msg } catch { /* non-JSON */ }
    throw new Error(msg)
  }
  return URL.createObjectURL(await r.blob())
}

// ---- Calendário da temporada (tracks/calendario_2026s3.json) ----
export interface CalWeek {
  w: number; inicio: string; corrida: string; pista: string; config: string
  track_id: number; temp_c: number; thumb: string | null
}
export interface CalSeries {
  id: string; nome: string; by: string; carro: string; cadencia: string
  largada: string; duracao_min: number; licenca: string; weeks: CalWeek[]
}
export interface CalThumb { paths: { x: number[]; y: number[] }[]; fonte: string }
export interface Calendar {
  season: string; fonte: string
  series: CalSeries[]; thumbs: Record<string, CalThumb>
}

let _cal: Promise<Calendar> | null = null
export function getCalendar(): Promise<Calendar> {
  if (!_cal) {
    _cal = fetch('/api/calendar').then(async r => {
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || 'Failed to load the calendar')
      return j as Calendar
    })
    _cal.catch(() => { _cal = null })  // permite tentar de novo num erro
  }
  return _cal
}
