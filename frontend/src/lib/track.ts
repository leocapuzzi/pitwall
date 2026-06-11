// Projeta a geometria real (Lat/Lon já em metros) num viewBox 1000x640 (Y invertido).
// Devolve o path `d` E os pontos projetados `pts`, na MESMA ordem do grid de distância
// (LapDistPct 0..1). Posicionar o carro pelo ÍNDICE de pts (não por getPointAtLength)
// garante posição precisa, já que o espaçamento por arco não é uniforme em distância.
export interface TrackGeom { d: string; pts: { x: number; y: number }[] }
export interface TrackEdges { left: TrackGeom; right: TrackGeom; roadD: string }
export interface TrackPair { track: TrackGeom; racing: TrackGeom; racingB?: TrackGeom; edges?: TrackEdges; unitPerM: number }
type XY = { x: number[]; y: number[] } | null | undefined
type EdgesXY = { left: { x: number[]; y: number[] }; right: { x: number[]; y: number[] } } | null | undefined

// Projeta a PISTA FIXA e a LINHA da sessão no MESMO sistema de coordenadas (escala/
// centro vêm da pista fixa) — assim a linha cai exatamente sobre a pista. Quando há
// BORDAS reais (track_edges, geometria OSM), projeta também e monta o polígono do
// asfalto (roadD) — os limites de escala passam a vir das bordas, p/ a pista caber.
export function projectTrackPair(track: XY, racing: XY, edges?: EdgesXY, racingB?: XY, W = 1000, H = 640, pad = 70): TrackPair {
  const base = (track?.x?.length ? track : racing)
  const bx = (edges?.left?.x?.length ? edges.left.x.concat(edges.right.x) : base?.x) || []
  const by = (edges?.left?.y?.length ? edges.left.y.concat(edges.right.y) : base?.y) || []
  if ((base?.x?.length || 0) < 2) { const e = { d: '', pts: [] }; return { track: e, racing: e, unitPerM: 1 } }
  const minx = Math.min(...bx), maxx = Math.max(...bx), miny = Math.min(...by), maxy = Math.max(...by)
  const s = Math.min((W - 2 * pad) / ((maxx - minx) || 1), (H - 2 * pad) / ((maxy - miny) || 1))
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2
  const X = (x: number) => W / 2 + (x - cx) * s
  const Y = (y: number) => H / 2 - (y - cy) * s
  const mk = (g: XY): TrackGeom => {
    const gx = g?.x || [], gy = g?.y || []
    if (gx.length < 2) return { d: '', pts: [] }
    const pts = gx.map((x, i) => ({ x: X(x), y: Y(gy[i]) }))
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') + ' Z'
    return { d, pts }
  }
  // x/y do payload estão em METROS ⇒ `s` é a escala unidades-do-viewBox por metro
  // (permite desenhar o carro/linha em escala física real)
  const pair: TrackPair = { track: mk(track), racing: mk(racing?.x?.length ? racing : track), unitPerM: s }
  if (racingB?.x?.length) pair.racingB = mk(racingB)
  if (edges?.left?.x?.length && edges?.right?.x?.length) {
    const left = mk(edges.left), right = mk(edges.right)
    const fwd = left.pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')
    const back = [...right.pts].reverse().map(p => 'L' + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')
    pair.edges = { left, right, roadD: fwd + ' ' + back + ' Z' }
  }
  return pair
}

export interface LineSegment { d: string; color: string }
// Colore a linha da sessão pelo DELTA local (média vs melhor): vermelho onde a média
// perde tempo (gradiente positivo), accent onde ganha, neutro no resto. Estático —
// calculado 1x por payload; runs curtos são absorvidos p/ não picotar a linha.
export function deltaSegments(
  pts: { x: number; y: number }[], delta: number[],
  colors = { loss: 'var(--red)', gain: 'var(--accent)', flat: 'rgba(244,247,246,.30)' },
): LineSegment[] {
  const M = pts.length, N = delta.length
  if (M < 2 || N < 8) return []
  const w = Math.max(2, Math.round(N * 0.01))
  const g = new Array<number>(M)
  for (let k = 0; k < M; k++) {
    const i = Math.round(k / (M - 1) * (N - 1))
    const a = Math.max(0, i - w), b = Math.min(N - 1, i + w)
    g[k] = (delta[b] - delta[a]) / (b - a)
  }
  const mean = g.reduce((s, v) => s + v, 0) / M
  const sd = Math.sqrt(g.reduce((s, v) => s + (v - mean) * (v - mean), 0) / M) || 1e-9
  const thr = 0.6 * sd
  const cls = (v: number): keyof typeof colors => (v > thr ? 'loss' : v < -thr ? 'gain' : 'flat')
  // runs por classe; absorve runs muito curtos no anterior
  const runs: { c: keyof typeof colors; a: number; b: number }[] = []
  for (let k = 0; k < M; k++) {
    const c = cls(g[k])
    const last = runs[runs.length - 1]
    if (last && last.c === c) last.b = k
    else runs.push({ c, a: k, b: k })
  }
  const MIN = 6
  const merged: typeof runs = []
  for (const r of runs) {
    const last = merged[merged.length - 1]
    if (last && (r.b - r.a + 1) < MIN) { last.b = r.b }
    else if (last && last.c === r.c) { last.b = r.b }
    else merged.push({ ...r })
  }
  return merged.map(r => {
    const span = pts.slice(r.a, Math.min(M, r.b + 2)) // +1 de overlap p/ emendar
    return { color: colors[r.c], d: span.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') }
  }).filter(s => s.d.includes('L'))
}
