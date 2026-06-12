// Posição/tamanho das rodas no blueprint da aba Tyres (PORSCHE_MARK, viewBox 600×600).
// O usuário calibra ao vivo pelos sliders da própria aba; persiste neste navegador.
// Quando a calibração for aprovada, os valores viram os novos TYRE_DEFAULTS.

export interface TyreLayout {
  yF: number      // centro vertical do eixo dianteiro
  yR: number      // centro vertical do eixo traseiro
  trackF: number  // distância do centro do carro ao centro da roda (dianteira)
  trackR: number  // idem traseira
  w: number       // largura da roda
  h: number       // altura da roda
}

// CALIBRADO PELO USUÁRIO no app (2026-06-12) — não "corrigir" sem novo pedido dele
export const TYRE_DEFAULTS: TyreLayout = { yF: 156, yR: 435, trackF: 93, trackR: 93, w: 70, h: 71 }
export const TYRE_CX = 299 // centro do carro no blueprint (bbox do corpo: x 172..426)

const KEY = 'pw_tyres_v1'

function load(): TyreLayout {
  try { return { ...TYRE_DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) } }
  catch { return { ...TYRE_DEFAULTS } }
}

let cur: TyreLayout = load()
const subs = new Set<(p: TyreLayout) => void>()

export function getTyreLayout(): TyreLayout { return cur }
export function setTyreParam(k: keyof TyreLayout, v: number) {
  cur = { ...cur, [k]: v }
  try { localStorage.setItem(KEY, JSON.stringify(cur)) } catch { /* ignore */ }
  subs.forEach(f => f(cur))
}
export function resetTyreLayout() {
  cur = { ...TYRE_DEFAULTS }
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  subs.forEach(f => f(cur))
}
export function onTyreLayout(f: (p: TyreLayout) => void) {
  subs.add(f)
  return () => { subs.delete(f) }
}
