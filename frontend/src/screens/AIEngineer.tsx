import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { useSession } from '../lib/useSession'
import { fmtClock, parseLap } from '../lib/fmt'
import { setPendingFocus } from '../lib/bus'
import { projectTrackPair, type TrackPair } from '../lib/track'
import type { Insight, Payload } from '../lib/api'

// Race Engineer AI — "central de missão" do engenheiro (coração do produto).
// TUDO real: plano de recuperação (delta da média vs melhor, decomposto nas top-3
// curvas), mapa com pins-sonar nas perdas (clique fixa o insight; deep-link p/ a
// Telemetry via pendingFocus), gauges do scorecard e chat com ANÁLISE LOCAL —
// respostas template sobre o relatório, rotuladas; a IA de verdade entra quando o
// coach ligar (on hold). Animações discretas: typewriter, count-up e gauges 1-shot.

interface Opp {
  rank: number; insight: Insight; title: string; desc: string
  cost: number; apex: number; x: number; y: number
}
interface Skill { k: string; score: number; grade: string; color: string }
interface Model {
  pair: TrackPair; opps: Opp[]; skills: Skill[]
  perda: number; coastS: number; potencial: number | null; bestT: number | null
  piorSetor: string | null; piorSetorD: number; nVoltas: number
  sigma: number | null; consist: number | null; avgClean: number | null
  fuelPorVolta: number | null; voltasRestantes: number | null
  topSum: number; secRows: { s: string; ref: number; media: number }[]
  // replay do raio-X (modo Time, como na Comparison)
  tRef: number[] | null; tMed: number[] | null; lengthM: number; lapSecs: number
}

const grade = (v: number) => (v >= 0.85 ? 'A' : v >= 0.75 ? 'A−' : v >= 0.65 ? 'B+' : v >= 0.55 ? 'B' : v >= 0.45 ? 'B−' : v >= 0.35 ? 'C' : 'D')
const gradeColor = (v: number) => (v >= 0.75 ? 'var(--accent)' : v >= 0.55 ? 'var(--cyan)' : v >= 0.4 ? 'var(--amber)' : 'var(--red)')
const OPP_COLORS = ['var(--red)', 'var(--amber)', 'var(--cyan)']

function buildModel(p: Payload): Model {
  const pair = projectTrackPair(p.track, p.racing_line, p.track_edges, p.racing_line_b)
  const tp = pair.track.pts, tn = tp.length
  const at = (apex: number) => tp[Math.min(tn - 1, Math.max(0, Math.round(apex * (tn - 1))))] || { x: 0, y: 0 }
  const ins = [...(p.insights || [])].sort((a, b) => (b.cost_s || 0) - (a.cost_s || 0))
  const opps: Opp[] = ins.slice(0, 3).map((it, i) => {
    // insights trazem apex_pct em PORCENTAGEM (0–100); corners usam fração (0–1)
    const apex = (it.apex_pct || 0) > 1.5 ? it.apex_pct / 100 : (it.apex_pct || 0)
    return {
      rank: i + 1, insight: it,
      title: `${it.corner} — ${it.what || it.phase}`,
      desc: it.fix || it.why || '',
      cost: it.cost_s || 0, apex, ...at(apex),
    }
  })
  const s = p.scorecard || {}
  const skills: Skill[] = ([['Freada', s.brake_aggression ?? 0], ['Trail braking', s.trail_overlap ?? 0],
    ['Uso do grip', s.circle_use ?? 0], ['Rotação', Math.min(1, s.rotation_eff ?? 0)]] as [string, number][])
    .map(([k, v]) => ({ k, score: Math.round(v * 100), grade: grade(v), color: gradeColor(v) }))
  const st = p.sectorTimes
  let piorSetor: string | null = null, piorSetorD = 0
  const secRows = (st?.labels || []).map((lb, i) => ({ s: lb, ref: st.ref[i] || 0, media: st.media[i] || 0 }))
  secRows.forEach(r => { const d = r.media - r.ref; if (d > piorSetorD) { piorSetorD = d; piorSetor = r.s } })
  const valid = (p.laps || []).filter(l => l.valid)
  const clean = (p.laps || []).filter(l => l.clean)
  const nSec = Math.max(0, ...valid.map(l => l.s?.length || 0))
  const optimal = nSec ? Array.from({ length: nSec }, (_, i) => Math.min(...valid.filter(l => (l.s?.length || 0) > i).map(l => l.s[i]))).reduce((a, b) => a + b, 0) : null
  const best = valid.length ? Math.min(...valid.map(l => l.t)) : null
  const avgClean = clean.length ? clean.reduce((a, l) => a + l.t, 0) / clean.length : null
  const sigma = clean.length && avgClean != null ? Math.sqrt(clean.reduce((a, l) => a + (l.t - avgClean) ** 2, 0) / clean.length) : null
  const consist = sigma != null ? Math.max(0, Math.min(100, 100 - sigma * 40)) : null
  const comFuel = (p.laps || []).filter(l => l.fuel != null && !l.pit)
  const fuelPorVolta = comFuel.length ? comFuel.reduce((a, l) => a + (l.fuel || 0), 0) / comFuel.length : null
  const fuelFim = p.contexto?.fuelFim
  const N = p.delta.length
  const tRef = p.ref_time?.length === N ? p.ref_time : null
  return {
    tRef, tMed: tRef ? tRef.map((v, i) => v + (p.delta[i] || 0)) : null,
    lengthM: p.eixoDist?.length ? p.eixoDist[p.eixoDist.length - 1] : 0,
    lapSecs: parseLap(p.contexto?.suaMelhor),
    pair, opps, skills,
    perda: p.delta.length ? p.delta[p.delta.length - 1] : 0,
    coastS: s.coasting_total_s ?? 0,
    potencial: optimal, bestT: best, piorSetor, piorSetorD,
    nVoltas: p.contexto?.voltasLimpas || 0,
    sigma, consist, avgClean, fuelPorVolta,
    voltasRestantes: fuelPorVolta && fuelFim != null && fuelFim > 0 ? Math.floor(fuelFim / fuelPorVolta) : null,
    topSum: opps.reduce((a, o) => a + o.cost, 0),
    secRows,
  }
}

// Chat de ANÁLISE LOCAL: responde do relatório (templates com dados reais).
// Sem IA — quando não reconhece a pergunta, diz isso com honestidade.
function localAnswer(q: string, m: Model): string | null {
  const s = q.toLowerCase()
  const o = m.opps[0]
  if (/coast|morto|desaceler/.test(s))
    return `Você roda ${m.coastS.toFixed(1)}s por volta em coasting (sem freio nem acelerador). Encurtar a transição freio→acelerador é tempo de graça — mire <1s.`
  if (/combust|fuel|tanque|gasolina|consumo/.test(s))
    return m.fuelPorVolta != null
      ? `Consumo médio: ${m.fuelPorVolta.toFixed(2)} L/volta${m.voltasRestantes != null ? ` — com o combustível que sobrou dá para ~${m.voltasRestantes} voltas` : ''}.`
      : 'Esta sessão não tem dados de combustível por volta.'
  if (/consist|regular|constân/.test(s))
    return m.sigma != null
      ? `Sua consistência está em ${m.consist!.toFixed(0)}/100: σ de ${m.sigma.toFixed(2)}s nas ${m.nVoltas} voltas limpas (média ${m.avgClean != null ? fmtClock(m.avgClean) : '—'} vs melhor ${m.bestT != null ? fmtClock(m.bestT) : '—'}). ${m.consist! >= 80 ? 'Agrupamento forte — dá para atacar o tempo.' : m.consist! >= 55 ? 'Variação moderada: repetir a volta boa vale mais que arriscar a volta perfeita.' : 'Voltas irregulares: estabilize as referências antes de buscar tempo.'}`
      : 'Sem voltas limpas suficientes para medir consistência.'
  if (/potencial|ótima|otima|alvo|optimal/.test(s))
    return m.potencial != null
      ? `Somando seus melhores setores desta sessão, a volta ótima é ${fmtClock(m.potencial)}${m.bestT != null ? ` — ${Math.max(0, m.bestT - m.potencial).toFixed(2)}s abaixo da sua melhor (${fmtClock(m.bestT)})` : ''}. Esse é o alvo realista.`
      : 'Sem setores nesta sessão para calcular a volta ótima.'
  if (/setor/.test(s))
    return m.piorSetor
      ? `O setor que mais custa é o ${m.piorSetor}: a média perde ${m.piorSetorD.toFixed(2)}s para a sua melhor ali. ${o ? `Dentro dele, o ponto crítico é ${o.insight.corner} (${o.insight.phase}).` : ''}`
      : 'Sem tempos de setor nesta sessão.'
  if (/onde|perd|perc|ganh|oportun|curva|tempo/.test(s) && o)
    return `Sua maior oportunidade é ${o.insight.corner}: ${o.insight.what} — custa +${o.cost.toFixed(2)}s por volta vs sua melhor. Correção: ${o.insight.fix}${m.opps[1] ? ` Depois vêm ${m.opps[1].insight.corner} (+${m.opps[1].cost.toFixed(2)}s)${m.opps[2] ? ` e ${m.opps[2].insight.corner} (+${m.opps[2].cost.toFixed(2)}s)` : ''}.` : ''}`
  return null
}

interface Msg { role: 'me' | 'eng'; text: string; local?: boolean }

const SUGGESTS = ['Onde perco mais tempo?', 'Como está minha consistência?', 'Qual meu potencial?', 'E o combustível?']

// geometria + timing do replay da curva fixada
interface XrayGeom {
  rank: number; lo: number; hi: number; dur: number; apexPct: number
  dIn: number | null; dOut: number | null; vmin: number | null
  charts: { k: string; color: string; main: string; ghost: string }[]
  roadD: string; segA: string; segB: string | null; roadW: number
  bx: number; by: number; bw: number; bh: number   // bbox base do trecho (viewBox z=1)
  ptsA: { x: number; y: number }[]; ptsB: { x: number; y: number }[] | null
}
const posAt = (pts: { x: number; y: number }[], f: number) => {
  const fi = Math.max(0, Math.min(1, f)) * (pts.length - 1)
  const i = Math.floor(fi), j = Math.min(pts.length - 1, i + 1), fr = fi - i
  return { x: pts[i].x + (pts[j].x - pts[i].x) * fr, y: pts[i].y + (pts[j].y - pts[i].y) * fr }
}
const invTime = (tau: number, arr: number[]) => {
  const n = arr.length
  if (tau <= arr[0]) return 0
  if (tau >= arr[n - 1]) return 1
  let lo = 0, hi = n - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid] <= tau) lo = mid; else hi = mid }
  return (lo + (tau - arr[lo]) / ((arr[hi] - arr[lo]) || 1)) / (n - 1)
}

export default function AIEngineer() {
  const { payload, loading, error } = useSession()
  const m = useMemo(() => (payload ? buildModel(payload) : null), [payload])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [pin, setPin] = useState<number>(0)            // rank-1 da oportunidade fixada
  const [go, setGo] = useState(false)                  // dispara gauges/barras (1 render)
  const [typedDone, setTypedDone] = useState(false)
  const [xplay, setXplay] = useState(true)             // replay da curva (loop)
  const [xz, setXz] = useState(1)                      // zoom do palco (espelho p/ UI)
  const [skillSel, setSkillSel] = useState<number | null>(null)  // gauge expandido
  const scrollRef = useRef<HTMLDivElement>(null)
  const sayRef = useRef<HTMLSpanElement>(null)
  const bigRef = useRef<HTMLElement>(null)
  const timer = useRef(0)
  // replay imperativo (nada de setState por frame)
  const modelRef = useRef<Model | null>(null); modelRef.current = m
  const xplayRef = useRef(true); xplayRef.current = xplay
  const xrayRef = useRef<XrayGeom | null>(null)
  const xT = useRef(0), xRaf = useRef(0), xLastText = useRef(0)
  // dots do replay são camada HTML compositada (FORA do svg): animar elemento
  // dentro do svg repintava o palco inteiro a cada frame, dentro de um painel
  // com backdrop-filter pesado — era o custo permanente que arrastava a tela
  const dotA = useRef<HTMLDivElement>(null), dotB = useRef<HTMLDivElement>(null)
  const dotPx = useRef({ a: 0, b: 0 })
  const xStageSz = useRef({ w: 0, h: 0 })
  const xwrapRef = useRef<HTMLDivElement>(null)
  // zoom/pan do palco: viewBox IMPERATIVO (React não controla o atributo — re-render
  // do chat não pode resetar o enquadramento do usuário)
  const segSvgRef = useRef<SVGSVGElement>(null)
  const zXf = useRef({ z: 1, cx: 0, cy: 0 })
  const xLastRank = useRef(-1)
  const xEls = useRef<{ cursors: Array<{ el: HTMLElement; w: number }>; vas: HTMLElement[]; vbs: HTMLElement[]; gap: HTMLElement | null }>({ cursors: [], vas: [], vbs: [], gap: null })
  const payloadRef = useRef<Payload | null>(null); payloadRef.current = payload

  const resumo = m
    ? `Analisei suas ${m.nVoltas} voltas limpas: a média deixa ${m.perda.toFixed(2)}s por volta na pista vs sua melhor${m.opps[0] ? ` — e ${Math.round(m.topSum / Math.max(0.001, m.perda) * 100)}% disso mora em ${m.opps.length} curvas` : ''}${m.piorSetor ? `, quase tudo no ${m.piorSetor}` : ''}. Vamos buscar esse tempo.`
    : ''

  // typewriter imperativo (sem re-render por tick)
  useEffect(() => {
    const el = sayRef.current
    if (!el || !resumo) return
    setTypedDone(false); el.textContent = ''
    let i = 0
    const id = window.setInterval(() => {
      i += 2
      el.textContent = resumo.slice(0, i)
      if (i >= resumo.length) { clearInterval(id); setTypedDone(true) }
    }, 22)
    return () => clearInterval(id)
  }, [resumo])

  // count-up do delta (1-shot; snap por timeout cobre janela oculta)
  useEffect(() => {
    const el = bigRef.current
    if (!el || !m) return
    const target = m.perda
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - f, 3)
      el.textContent = (target * e).toFixed(2)
      if (f < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const snap = window.setTimeout(() => { cancelAnimationFrame(raf); el.textContent = target.toFixed(2) }, 1100)
    return () => { cancelAnimationFrame(raf); clearTimeout(snap) }
  }, [m])

  // dispara as animações CSS (gauges/barra) num único re-render
  useEffect(() => { const id = window.setTimeout(() => setGo(true), 80); return () => clearTimeout(id) }, [])
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight }, [msgs, typing])
  useEffect(() => () => clearTimeout(timer.current), [])

  // frame do replay: pontos nas linhas (melhor + média via inversão de tempo),
  // cursores dos gráficos e textos a 10 Hz — tudo via refs
  const renderXray = useCallback((nt: number, force = false) => {
    const g = xrayRef.current, p = payloadRef.current, mm = modelRef.current
    if (!g || !p || !mm) return
    const N = p.delta.length; if (!N) return
    const tG = g.lo + nt * (g.hi - g.lo)
    const a = posAt(g.ptsA, tG)
    let dB = tG
    if (mm.tRef && mm.tMed) {
      const fi = tG * (N - 1), i0 = Math.floor(fi), i1 = Math.min(N - 1, i0 + 1), fr = fi - i0
      const tau = mm.tRef[i0] + (mm.tRef[i1] - mm.tRef[i0]) * fr
      dB = invTime(tau, mm.tMed)
    }
    // dots em PX do palco (camada HTML compositada; svg fica 100% estático no replay)
    const sw = xStageSz.current.w, sh = xStageSz.current.h
    if (sw > 0 && sh > 0) {
      const s = zXf.current
      const vw = g.bw / s.z, vh = g.bh / s.z
      const vx = s.cx - vw / 2, vy = s.cy - vh / 2
      const sc = Math.min(sw / vw, sh / vh)
      const ox = (sw - vw * sc) / 2, oy = (sh - vh * sc) / 2
      const base = Math.max(2.2, (g.roadW || 8) * 0.30) * 2 * sc
      const place = (el: HTMLDivElement | null, wx: number, wy: number, d: number, key: 'a' | 'b') => {
        if (!el) return
        if (Math.abs(d - dotPx.current[key]) > 0.5) { dotPx.current[key] = d; el.style.width = d.toFixed(1) + 'px'; el.style.height = d.toFixed(1) + 'px' }
        el.style.visibility = 'visible'
        el.style.transform = `translate3d(${(ox + (wx - vx) * sc - d / 2).toFixed(1)}px,${(oy + (wy - vy) * sc - d / 2).toFixed(1)}px,0)`
      }
      const b = posAt(g.ptsB || g.ptsA, dB)
      place(dotB.current, b.x, b.y, base * 0.92, 'b')
      place(dotA.current, a.x, a.y, base, 'a')
    }
    // transform (compositado), NUNCA style.left — left dispara layout da página
    // inteira a cada frame e era o que deixava a tela toda lenta com o replay
    for (const c of xEls.current.cursors) c.el.style.transform = `translate3d(${(nt * c.w).toFixed(1)}px,0,0)`
    const now = performance.now()
    if (!force && now - xLastText.current < 100) return
    xLastText.current = now
    const ia = Math.round(tG * (N - 1)), ib = Math.round(dB * (N - 1))
    const KEYS = ['speed', 'throttle', 'brake'] as const
    xEls.current.vas.forEach((el, i) => { el.textContent = String(Math.round(p.ref[KEYS[i]][ia] || 0)) })
    xEls.current.vbs.forEach((el, i) => { el.textContent = String(Math.round(p.media[KEYS[i]][ib] || 0)) })
    if (xEls.current.gap) {
      const gm = mm.tRef && mm.tMed && mm.lengthM ? (tG - dB) * mm.lengthM : null
      xEls.current.gap.textContent = gm == null ? '—' : (gm >= 0 ? '+' : '−') + Math.abs(gm).toFixed(1) + ' m'
    }
  }, [])
  useEffect(() => {
    let last = performance.now()
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now
      const g = xrayRef.current
      if (g && xplayRef.current) {
        let nt = xT.current + dt / g.dur; if (nt >= 1) nt -= 1
        xT.current = nt
        renderXray(nt)
      }
      xRaf.current = requestAnimationFrame(loop)
    }
    xRaf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(xRaf.current)
  }, [renderXray])
  // viewBox do palco a partir de {z, cx, cy} (clampado ao bbox base + folga)
  const writeVb = useCallback(() => {
    const g = xrayRef.current, el = segSvgRef.current
    if (!g || !el) return
    const s = zXf.current
    const w = g.bw / s.z, h = g.bh / s.z
    const sx = g.bw * 0.08, sy = g.bh * 0.08
    s.cx = Math.max(g.bx + w / 2 - sx, Math.min(g.bx + g.bw - w / 2 + sx, s.cx))
    s.cy = Math.max(g.by + h / 2 - sy, Math.min(g.by + g.bh - h / 2 + sy, s.cy))
    el.setAttribute('viewBox', `${(s.cx - w / 2).toFixed(1)} ${(s.cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`)
    renderXray(xT.current, true) // dots HTML acompanham o novo enquadramento
  }, [renderXray])
  const zoomXray = useCallback((f: number, px?: number, py?: number) => {
    const g = xrayRef.current, el = segSvgRef.current; if (!g || !el) return
    const s = zXf.current
    const nz = Math.max(1, Math.min(10, s.z * f))
    if (px != null && py != null && nz !== s.z) {
      // mantém o ponto sob o cursor: centro caminha na direção dele
      const r = el.getBoundingClientRect()
      const w = g.bw / s.z, h = g.bh / s.z
      const sc = Math.min(r.width / w, r.height / h)
      const ox = (r.width - w * sc) / 2, oy = (r.height - h * sc) / 2
      const ux = (s.cx - w / 2) + (px - r.left - ox) / sc
      const uy = (s.cy - h / 2) + (py - r.top - oy) / sc
      const k = 1 - s.z / nz
      s.cx += (ux - s.cx) * k
      s.cy += (uy - s.cy) * k
    }
    s.z = nz
    writeVb()
    setXz(nz)
  }, [writeVb])
  const resetXzoom = useCallback(() => {
    const g = xrayRef.current; if (!g) return
    zXf.current = { z: 1, cx: g.bx + g.bw / 2, cy: g.by + g.bh / 2 }
    writeVb(); setXz(1)
  }, [writeVb])
  const panXray = (e: React.PointerEvent) => {
    const g = xrayRef.current, el = segSvgRef.current
    if (!g || !el || zXf.current.z <= 1.001) return
    e.preventDefault()
    const r = el.getBoundingClientRect()
    const sc = Math.min(r.width / (g.bw / zXf.current.z), r.height / (g.bh / zXf.current.z))
    let lx = e.clientX, ly = e.clientY
    const mv = (ev: PointerEvent) => { const s = zXf.current; s.cx -= (ev.clientX - lx) / sc; s.cy -= (ev.clientY - ly) / sc; lx = ev.clientX; ly = ev.clientY; writeVb() }
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }
  // roda do mouse = zoom ancorado no cursor (listener nativo: precisa de passive:false)
  useEffect(() => {
    const el = segSvgRef.current?.parentElement; if (!el) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomXray(e.deltaY < 0 ? 1.22 : 1 / 1.22, e.clientX, e.clientY) }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [pin, m, zoomXray])
  // larguras dos gráficos + tamanho do palco acompanham resize (tudo por transform)
  useEffect(() => {
    const w = xwrapRef.current; if (!w) return
    const measure = () => {
      for (const c of xEls.current.cursors) c.w = c.el.parentElement?.clientWidth || c.w
      const st = segSvgRef.current
      if (st) { xStageSz.current = { w: st.clientWidth, h: st.clientHeight } }
    }
    const ro = new ResizeObserver(() => { measure(); renderXray(xT.current, true) })
    ro.observe(w)
    if (segSvgRef.current) ro.observe(segSvgRef.current)
    measure(); renderXray(xT.current, true)
    return () => ro.disconnect()
  }, [pin, m, renderXray])
  // cache dos elementos do raio-X (1×/render) + enquadramento + frame inicial
  useLayoutEffect(() => {
    const w = xwrapRef.current
    xEls.current = w ? {
      cursors: ([...w.querySelectorAll('[data-xcur]')] as HTMLElement[]).map(el => ({ el, w: el.parentElement?.clientWidth || 0 })),
      vas: [...w.querySelectorAll('[data-xva]')] as HTMLElement[],
      vbs: [...w.querySelectorAll('[data-xvb]')] as HTMLElement[],
      gap: w.querySelector('[data-xgap]') as HTMLElement | null,
    } : { cursors: [], vas: [], vbs: [], gap: null }
    const g = xrayRef.current
    if (g && g.rank !== xLastRank.current) {
      // curva nova: reenquadra (zoom 1 no bbox do trecho)
      xLastRank.current = g.rank
      zXf.current = { z: 1, cx: g.bx + g.bw / 2, cy: g.by + g.bh / 2 }
      if (xz !== 1) setXz(1)
    }
    writeVb()
    renderXray(xT.current, true)
  })
  useEffect(() => { xT.current = 0 }, [pin])

  // EVIDÊNCIA por curva do skill expandido: melhor vs média calculados dos canais
  // reais, fiel à definição de cada score (signatures.py). Um cálculo por clique.
  interface SkillDef { title: string; unit: string; def: string; hi: boolean; f: (i0: number, i1: number, ia: number, L: 'ref' | 'media') => number; tip: (ok: boolean) => string }
  const evid = useMemo(() => {
    if (!payload || !m || skillSel == null) return null
    const p = payload
    const N = p.delta.length; if (!N) return null
    const corners = p.corners || []; if (!corners.length) return null
    const tA = m.tRef, tB = m.tMed
    const peakDec = (v: number[], t: number[] | null, brk: number[], i0: number, i1: number) => {
      if (!t) { let mx = 0; for (let i = i0; i <= i1; i++) mx = Math.max(mx, brk[i] || 0); return mx }
      let mx = 0
      for (let i = i0; i <= i1 - 3; i++) {
        if ((brk[i] || 0) < 10) continue
        const dt = t[i + 3] - t[i]; if (dt <= 0) continue
        const dec = (v[i] - v[i + 3]) / 3.6 / dt
        if (dec > mx) mx = dec
      }
      return mx
    }
    const trailPct = (st: number[], brk: number[], i0: number, ia: number) => {
      let s0 = -1
      for (let i = i0; i <= ia; i++) if (Math.abs(st[i] || 0) > 15) { s0 = i; break }
      if (s0 < 0 || ia - s0 < 2) return 0
      let on = 0
      for (let i = s0; i <= ia; i++) if ((brk[i] || 0) > 10) on++
      return on / (ia - s0 + 1) * 100
    }
    const minV = (v: number[], i0: number, i1: number) => { let mn = 1e9; for (let i = i0; i <= i1; i++) mn = Math.min(mn, v[i] ?? 1e9); return mn }
    const meanAbs = (a: number[], i0: number, i1: number) => { let s = 0; for (let i = i0; i <= i1; i++) s += Math.abs(a[i] || 0); return s / (i1 - i0 + 1) }
    const defs: SkillDef[] = [
      { title: 'Pico de frenagem por curva', unit: tA ? 'm/s²' : '%', hi: true,
        def: 'Quão perto do limite de frenagem do carro você chega: pico de desaceleração em cada zona de freio.',
        f: (i0, i1, _ia, L) => peakDec(p[L].speed, L === 'ref' ? tA : tB, p[L].brake, i0, i1),
        tip: ok => ok ? 'Frenagens perto do limite do carro — mantenha o padrão.' : 'Ataque o pedal com mais força no INÍCIO da frenagem (pico cedo, module depois) — as barras mostram onde a média freia mais fraco que a sua melhor.' },
      { title: 'Trail braking por curva', unit: '%', hi: true,
        def: 'Fração do turn-in com o freio ainda aplicado — carregar freio até o apex gera rotação.',
        f: (i0, _i1, ia, L) => trailPct(p[L].steer, p[L].brake, i0, ia),
        tip: ok => ok ? 'Bom overlap de freio no turn-in — siga assim.' : 'Não solte todo o freio antes de virar: carregue ~20–30% até perto do apex nas curvas onde a barra da média é curta.' },
      { title: 'Velocidade mínima por curva', unit: 'km/h', hi: true,
        def: 'Uso do grip visto pela velocidade que você carrega no ponto mais lento de cada curva.',
        f: (i0, i1, _ia, L) => minV(p[L].speed, i0, i1),
        tip: ok => ok ? 'Você carrega bem a velocidade de curva.' : 'Há grip na mesa: nas curvas com barra menor, entre um tique mais rápido e confie no apoio — o carro aguenta vmin maior.' },
      { title: 'Volante médio por curva', unit: '°', hi: false,
        def: 'Eficiência de rotação: quanto MENOS volante para a mesma curva, melhor o carro gira (menos understeer).',
        f: (i0, i1, _ia, L) => meanAbs(p[L].steer, i0, i1),
        tip: ok => ok ? 'O carro gira com pouco volante — eficiente.' : 'Muito volante para a mesma curva: gere rotação na entrada (trail) em vez de adicionar esterço no meio.' },
    ]
    const d = defs[skillSel]
    const rows = corners.map(c => {
      const lo = Math.max(0, c.apex_pct - 0.045), hi = Math.min(1, c.apex_pct + 0.04)
      const i0 = Math.max(0, Math.floor(lo * (N - 1))), i1 = Math.min(N - 1, Math.ceil(hi * (N - 1)))
      const ia = Math.round(c.apex_pct * (N - 1))
      return { n: c.n, name: c.name, a: d.f(i0, i1, ia, 'ref'), b: d.f(i0, i1, ia, 'media'), oppIdx: m.opps.findIndex(o => o.insight.corner === c.name) }
    }).filter(r => isFinite(r.a) && isFinite(r.b) && (r.a > 0.01 || r.b > 0.01))
    if (!rows.length) return null
    const max = Math.max(...rows.map(r => Math.max(r.a, r.b)), 0.001)
    let worst = -1, wd = 0.04 * max
    rows.forEach((r, i) => { const df = d.hi ? r.a - r.b : r.b - r.a; if (df > wd) { wd = df; worst = i } })
    const meanA = rows.reduce((s, r) => s + r.a, 0) / rows.length
    const meanB = rows.reduce((s, r) => s + r.b, 0) / rows.length
    const fmtV = (v: number) => (d.unit === '%' || d.unit === '°') ? Math.round(v) + d.unit : v.toFixed(1) + ' ' + d.unit
    return { title: d.title, def: d.def, rows, max, worst, meanA, meanB, fmtV, tip: d.tip(m.skills[skillSel].score >= 70) }
  }, [payload, m, skillSel])

  if (loading) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>Carregando sessão…</div>
  if (error || !payload || !m) return <div className="card pad" style={{ display: 'grid', placeItems: 'center', minHeight: 340, color: 'var(--ink-3)' }}>{error || 'Sem dados'}</div>

  const ctx = payload.contexto
  const cur = m.opps[pin] || m.opps[0] || null
  const scaleBase = Math.max(m.perda, m.topSum, 0.001)
  const outros = Math.max(0, m.perda - m.topSum)

  const send = (text: string) => {
    const q = (text || '').trim(); if (!q || typing) return
    setDraft(''); setMsgs(v => [...v, { role: 'me', text: q }]); setTyping(true)
    timer.current = window.setTimeout(() => {
      setTyping(false)
      const local = localAnswer(q, m)
      setMsgs(v => [...v, local
        ? { role: 'eng', text: local, local: true }
        : { role: 'eng', text: 'Essa eu ainda não respondo: o chat com IA de verdade entra em breve. Por enquanto eu falo do relatório desta sessão — me pergunte sobre perdas, setores, consistência, potencial ou combustível.' }])
    }, 650)
  }

  const openInTelemetry = (o: Opp) => {
    setPendingFocus({ lo: Math.max(0, o.apex - 0.05), hi: Math.min(1, o.apex + 0.045), t: o.apex })
    window.dispatchEvent(new CustomEvent('pw:go', { detail: 'telemetry' }))
  }

  // raio-X da curva fixada: canais reais (melhor vs média) recortados em [apex±5%]
  // + geometria do TRECHO da pista p/ o replay fantasma (zoom na curva)
  const XW = 300, XH = 60
  const xray: XrayGeom | null = (() => {
    if (!cur) return null
    const N = payload.delta.length; if (!N) return null
    const lo = Math.max(0, cur.apex - 0.055), hi = Math.min(1, cur.apex + 0.05)
    const i0 = Math.max(0, Math.floor(lo * (N - 1))), i1 = Math.min(N - 1, Math.ceil(hi * (N - 1)))
    const slice = (a: number[]) => a.slice(i0, i1 + 1)
    const path = (a: number[], min: number, max: number) =>
      a.map((v, i) => (i ? 'L' : 'M') + (i / (a.length - 1) * XW).toFixed(1) + ',' + ((1 - (v - min) / ((max - min) || 1)) * XH).toFixed(1)).join(' ')
    const sR = slice(payload.ref.speed), sM = slice(payload.media.speed)
    const smin = Math.min(...sR, ...sM) - 4, smax = Math.max(...sR, ...sM) + 4
    const apexPct = ((cur.apex - lo) / ((hi - lo) || 1)) * 100
    const aRow: Record<string, any> = (payload.analise_curvas || []).find(r => r.name === cur.insight.corner) || {}
    // trecho da pista: linhas recortadas + viewBox no bbox do segmento
    const ptsA = m.pair.racing.pts
    const ptsB = m.pair.racingB?.pts || null
    const cut = (pts: { x: number; y: number }[]) =>
      pts.slice(Math.max(0, Math.floor(lo * (pts.length - 1))), Math.min(pts.length - 1, Math.ceil(hi * (pts.length - 1))) + 1)
    const segA = cut(ptsA), segB = ptsB ? cut(ptsB) : null
    const segRoad = cut(m.pair.track.pts)
    const P = (a: { x: number; y: number }[]) => a.map((q, i) => (i ? 'L' : 'M') + q.x.toFixed(1) + ',' + q.y.toFixed(1)).join(' ')
    const roadW = (payload.track_width_m || 10) * (m.pair.unitPerM || 1)
    const all = segB ? segA.concat(segB, segRoad) : segA.concat(segRoad)
    const xs = all.map(q => q.x), ys = all.map(q => q.y)
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys)
    const pad = Math.max(roadW * 0.85, (maxx - minx + maxy - miny) * 0.055)
    const dur = m.tRef ? Math.max(1.2, m.tRef[i1] - m.tRef[i0]) : Math.max(1.2, (hi - lo) * m.lapSecs)
    return {
      rank: cur.rank, lo, hi, dur, apexPct,
      dIn: aRow.dt_entry != null ? +aRow.dt_entry : null,
      dOut: aRow.dt_exit != null ? +aRow.dt_exit : null,
      vmin: aRow.v_min != null ? +aRow.v_min : null,
      charts: [
        { k: 'SPEED', color: 'var(--cyan)', main: path(sR, smin, smax), ghost: path(sM, smin, smax) },
        { k: 'THROTTLE', color: 'var(--accent)', main: path(slice(payload.ref.throttle), 0, 100), ghost: path(slice(payload.media.throttle), 0, 100) },
        { k: 'BRAKE', color: 'var(--red)', main: path(slice(payload.ref.brake), 0, 100), ghost: path(slice(payload.media.brake), 0, 100) },
      ],
      bx: minx - pad, by: miny - pad, bw: maxx - minx + pad * 2, bh: maxy - miny + pad * 2,
      roadD: P(segRoad), segA: P(segA), segB: segB ? P(segB) : null, roadW, ptsA, ptsB,
    }
  })()
  xrayRef.current = xray
  const sign2 = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2)

  return (
    <div className="tp-wrap pw-ai">
      <div className="pw-pagebg" aria-hidden><i className="g1" /><i className="g2" /><i className="g3" /></div>

      {/* strip do engenheiro */}
      <div className="pw-aitop">
        <div className="pw-aiid">
          <span className="pw-aiav"><img src="/assets/engineer-mascot.png" alt="Race Engineer" /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="row center gap8" style={{ flexWrap: 'wrap' }}>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Race Engineer</b>
              <span className="ap-live"><i className="ap-dot" />análise local ativa</span>
              <span className="chip" style={{ padding: '2px 9px', fontSize: 10, cursor: 'default' }}>chat com IA em breve</span>
            </div>
            <p className="pw-aisay"><span ref={sayRef} /><i className="caret" style={{ opacity: typedDone ? 0 : 1 }} /></p>
          </div>
        </div>
        <div className="pw-aipills">
          <div className="pw-statpill pw-glass2">
            <span className="pw-kico" style={{ ['--c' as string]: 'var(--red)' }}><Icon n="telem" s={16} /></span>
            <div><span className="kl">Δ médio / volta</span><b className="kv num redt">+{m.perda.toFixed(2)}s</b><span className="ks">média vs sua melhor</span></div>
          </div>
          <div className="pw-statpill pw-glass2">
            <span className="pw-kico" style={{ ['--c' as string]: 'var(--purple)' }}><Icon n="clock" s={16} /></span>
            <div><span className="kl">Potencial (ótima)</span><b className="kv num purple">{m.potencial != null ? fmtClock(m.potencial) : '—'}</b><span className="ks">soma dos melhores setores</span></div>
          </div>
          <div className="pw-statpill pw-glass2">
            <span className="pw-kico" style={{ ['--c' as string]: 'var(--amber)' }}><Icon n="spark" s={16} /></span>
            <div><span className="kl">Tempo morto</span><b className="kv num amber">{m.coastS.toFixed(1)}s</b><span className="ks">coasting por volta</span></div>
          </div>
        </div>
      </div>

      <div className="pw-aimain">
        {/* plano de recuperação */}
        <div className="pw-aiplan pw-glass2">
          <div className="row between center">
            <span className="lbl">Plano de recuperação</span>
            {m.consist != null && <span className="chip" style={{ padding: '2px 9px', fontSize: 10.5, cursor: 'default' }}>Consistência <b className="num" style={{ marginLeft: 4 }}>{m.consist.toFixed(0)}/100</b></span>}
          </div>
          <div className="pw-aidelta redt">+<em ref={bigRef}>0.00</em><i>s / volta</i></div>
          <span className="ks" style={{ color: 'var(--ink-3)', fontSize: 11 }}>o que a média deixa na pista vs sua melhor volta</span>
          <div className="pw-aibar">
            {m.opps.map((o, i) => (
              <i key={o.rank} style={{ width: (o.cost / scaleBase * 100) + '%', transform: go ? 'scaleX(1)' : 'scaleX(0)', background: OPP_COLORS[i], transitionDelay: i * 0.12 + 's' }} />
            ))}
            <i style={{ width: (outros / scaleBase * 100) + '%', transform: go ? 'scaleX(1)' : 'scaleX(0)', background: 'var(--surface-3)', transitionDelay: '.36s' }} />
          </div>
          <div className="pw-aileg">
            {m.opps.map((o, i) => <span key={o.rank}><i style={{ background: OPP_COLORS[i] }} />{o.insight.corner} +{o.cost.toFixed(2)}s</span>)}
            {outros > 0.005 && <span><i style={{ background: 'var(--surface-3)' }} />resto da volta +{outros.toFixed(2)}s</span>}
          </div>
          <div style={{ marginTop: 10, minHeight: 0, overflowY: 'auto' }}>
            {m.opps.map((o, i) => (
              <button key={o.rank} className={'opp ap-opp' + (pin === i ? ' on' : '')} onClick={() => setPin(i)}>
                <span className={'rank' + (pin === i ? ' r1' : '')}>{o.rank}</span>
                <div className="grow"><div className="ob">{o.title}</div><div className="od">{o.desc}</div></div>
                <div className="gain redt">+{o.cost.toFixed(2)}s<div className="od" style={{ fontWeight: 500 }}>{o.insight.phase}</div></div>
              </button>
            ))}
            {!m.opps.length && <p className="muted" style={{ fontSize: 13 }}>Sem oportunidades detectadas nesta sessão.</p>}
          </div>
          {m.opps.length > 0 && (
            <div className="pw-aiplanfoot">
              <Icon n="spark" s={13} /> Zerando as {m.opps.length} maiores: <b className="num green">−{Math.min(m.topSum, m.perda).toFixed(2)}s por volta</b>
              {m.avgClean != null && <> → média projetada <b className="num green">{fmtClock(Math.max(m.bestT ?? 0, m.avgClean - m.topSum))}</b></>}
            </div>
          )}
        </div>

        {/* raio-X das perdas: replay fantasma da curva fixada + evidência nos canais */}
        <div className="pw-aimap pw-glass2">
          <div className="row between center" style={{ flex: 'none' }}>
            <span className="lbl">Raio-X das perdas</span>
            <button className="chip" style={{ padding: '3px 10px', fontSize: 10.5 }} onClick={() => window.dispatchEvent(new CustomEvent('pw:go', { detail: 'lap' }))}>
              <Icon n="ext" s={11} /> Lap Analysis
            </button>
          </div>
          {cur && xray ? (
            <div className="pw-aixwrap" ref={xwrapRef} key={cur.rank}>
              <div className="pw-aixhead">
                <div className="row center gap8" style={{ minWidth: 0 }}>
                  <b style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, whiteSpace: 'nowrap' }}>{cur.insight.corner} · replay</b>
                  <span className="pw-xleg"><i className="s" />melhor<i className="d" />média</span>
                </div>
                <b className="num redt" style={{ fontSize: 13.5 }}>+{cur.cost.toFixed(2)}s</b>
              </div>
              {/* palco do replay: o TRECHO real da curva, melhor vs média correndo em loop.
                  viewBox imperativo (writeVb): roda = zoom no cursor, arrasto = pan */}
              <div className="pw-aixstage">
                <svg ref={segSvgRef} className={'pw-aixseg' + (xz > 1.01 ? ' zoomed' : '')} preserveAspectRatio="xMidYMid meet" onPointerDown={panXray}>
                  <path d={xray.roadD} fill="none" stroke="rgba(244,247,246,.075)" strokeWidth={xray.roadW} strokeLinecap="round" strokeLinejoin="round" />
                  {xray.segB && <path d={xray.segB} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={1.3} strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />}
                  <path d={xray.segA} fill="none" stroke="var(--accent)" strokeWidth={1.9} vectorEffect="non-scaling-stroke" opacity={.9} />
                </svg>
                {/* dots em camada HTML compositada (fora do svg — replay não repinta o palco) */}
                <div ref={dotB} className="pw-xdot" style={{ background: '#aab1bb' }} aria-hidden />
                <div ref={dotA} className="pw-xdot" style={{ background: 'var(--accent)' }} aria-hidden />
                <div className="pw-aixzoom">
                  <button onClick={() => zoomXray(1.35)} title="Aproximar (ou roda do mouse)">+</button>
                  <button onClick={() => zoomXray(1 / 1.35)} title="Afastar">−</button>
                  {xz > 1.01 && <button onClick={resetXzoom} title="Reenquadrar a curva"><Icon n="refresh" s={11} /></button>}
                </div>
                {/* inset de contexto: pista inteira + pins (dentro do SVG = sem desalinhamento) */}
                <svg className="pw-aixinset" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet">
                  <path d={m.pair.track.d} fill="none" stroke="rgba(255,255,255,.30)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                  {m.opps.map((o, i) => (
                    <g key={o.rank} onClick={() => setPin(i)} style={{ cursor: 'pointer' }}>
                      <title>{`${o.insight.corner} · +${o.cost.toFixed(2)}s`}</title>
                      {pin === i && <circle className="ping" cx={o.x} cy={o.y} r={46} fill="none" stroke="var(--red)" strokeWidth={7} />}
                      <circle cx={o.x} cy={o.y} r={46} fill={pin === i ? 'var(--accent)' : 'rgba(19,22,25,.95)'} stroke={pin === i ? 'var(--accent)' : 'var(--red)'} strokeWidth={8} />
                      <text x={o.x} y={o.y + 17} textAnchor="middle" fontSize={50} fontWeight={800} fill={pin === i ? '#0a0d0a' : 'var(--red)'} fontFamily="var(--font-mono)">{o.rank}</text>
                    </g>
                  ))}
                </svg>
                <span className="pw-aixgap"><i>gap média</i> <b className="num" data-xgap>—</b></span>
                <button className="pw-aixplay" onClick={() => setXplay(v => !v)} title={xplay ? 'Pausar replay' : 'Replay'}>
                  {xplay
                    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
                    : <Icon n="play" s={10} fill="currentColor" />}
                </button>
              </div>
              <div className="pw-aixchips">
                {xray.dIn != null && <span className="chip">entrada <b className={'num ' + (xray.dIn > 0 ? 'redt' : 'green')}>{sign2(xray.dIn)}</b></span>}
                {xray.dOut != null && <span className="chip">saída <b className={'num ' + (xray.dOut > 0 ? 'redt' : 'green')}>{sign2(xray.dOut)}</b></span>}
                {xray.vmin != null && <span className="chip">vmin <b className="num">{Math.round(xray.vmin)} km/h</b></span>}
                <span className="chip">fase: <b>{cur.insight.phase}</b></span>
              </div>
              <div className="pw-aixray">
                {xray.charts.map(c => (
                  <div key={c.k} className="pw-xchart">
                    <svg viewBox={`0 0 ${XW} ${XH}`} preserveAspectRatio="none">
                      <path d={c.ghost} className="pw-ghostline" />
                      <path d={c.main} fill="none" stroke={c.color} strokeWidth={1.7} className="tp-mainline" />
                    </svg>
                    <span className="pw-chlabel">{c.k}</span>
                    <span className="pw-xapex" style={{ left: xray.apexPct + '%' }} />
                    <span className="tp-cursor" data-xcur style={{ left: 0, willChange: 'transform' }} />
                    <span className="pw-xvals"><b className="num" data-xva style={{ color: c.color }}>—</b><i>/</i><b className="num" data-xvb>—</b></span>
                  </div>
                ))}
              </div>
              <div className="pw-aipin">
                <p style={{ margin: '0 0 9px' }}>
                  <b style={{ color: 'var(--ink-2)' }}>O quê:</b> {cur.insight.what}<br />
                  <b style={{ color: 'var(--ink-2)' }}>Por quê:</b> {cur.insight.why}<br />
                  <b style={{ color: 'var(--ink-2)' }}>Corrigir:</b> {cur.insight.fix}<br />
                  <b style={{ color: 'var(--ink-2)' }}>Validar:</b> {cur.insight.validate}</p>
                <button className="chip" onClick={() => openInTelemetry(cur)}><Icon n="telem" s={12} /> Abrir trecho na Telemetry</button>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Sem oportunidades para detalhar nesta sessão.</p>
          )}
        </div>

        {/* skills + chat */}
        <div className="pw-aicol">
          <div className="pw-aiskills pw-glass2">
            <div className="pw-gaugerow">
              {m.skills.map((sk, i) => {
                const R = 24, C = 2 * Math.PI * R
                return (
                  <button key={sk.k} type="button" className={'pw-gauge' + (skillSel === i ? ' on' : '')}
                    title={`${sk.k}: ${sk.score}/100 — clique para ver a evidência por curva`}
                    onClick={() => setSkillSel(s => (s === i ? null : i))}>
                    <svg width="58" height="58" viewBox="0 0 58 58">
                      <circle cx="29" cy="29" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="4.5" />
                      {/* glow = halo translúcido (drop-shadow re-rasterizava o filtro a CADA frame da transição) */}
                      <circle cx="29" cy="29" r={R} fill="none" stroke={sk.color} strokeWidth="10" strokeLinecap="round" opacity={0.16}
                        strokeDasharray={C} strokeDashoffset={go ? C * (1 - sk.score / 100) : C}
                        transform="rotate(-90 29 29)" style={{ transition: 'stroke-dashoffset 1.1s var(--ease)' }} />
                      <circle cx="29" cy="29" r={R} fill="none" stroke={sk.color} strokeWidth="4.5" strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={go ? C * (1 - sk.score / 100) : C}
                        transform="rotate(-90 29 29)" style={{ transition: 'stroke-dashoffset 1.1s var(--ease)' }} />
                    </svg>
                    <b className="pw-gradel" style={{ color: sk.color }}>{sk.grade}</b>
                    <span className="kl">{sk.k}</span>
                    <span className="ks num">{sk.score}/100</span>
                  </button>
                )
              })}
            </div>
            {evid && skillSel != null && (
              <div className="pw-skdetail" key={skillSel}>
                <div className="pw-skhead">
                  <span className="lbl" title={evid.def} style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {evid.title} <Icon n="info" s={11} sw={2} />
                  </span>
                  <span className="pw-skchips">
                    <span><i className="sa" />melhor {evid.fmtV(evid.meanA)}</span>
                    <span><i className="sb" />média {evid.fmtV(evid.meanB)}</span>
                  </span>
                </div>
                <div className="pw-skbars">
                  {evid.rows.map((r, i) => (
                    <div key={r.n} className={'pw-skcol' + (r.oppIdx >= 0 ? ' link' : '')}
                      title={`${r.name} — melhor ${evid.fmtV(r.a)} · média ${evid.fmtV(r.b)}${r.oppIdx >= 0 ? ' · clique p/ abrir no replay' : ''}`}
                      style={{ ['--d' as string]: (i * 0.04) + 's' }}
                      onClick={r.oppIdx >= 0 ? () => setPin(r.oppIdx) : undefined}>
                      {evid.worst === i && <span className="pw-skworst" />}
                      <div className="cell">
                        <i className="a" style={{ height: Math.max(5, r.a / evid.max * 100) + '%' }} />
                        <i className="b" style={{ height: Math.max(5, r.b / evid.max * 100) + '%' }} />
                      </div>
                      <span className="cn">{r.n}</span>
                    </div>
                  ))}
                </div>
                <p className="pw-sktip">{evid.tip}</p>
              </div>
            )}
          </div>
          <div className="pw-aichat pw-glass2">
            <div className="row between center" style={{ flex: 'none', marginBottom: 4 }}>
              <span className="lbl">Chat com o engenheiro</span>
              <span className="muted" style={{ fontSize: 10.5 }}>respostas do relatório · IA em breve</span>
            </div>
            <div className="ap-thread" ref={scrollRef}>
              <div className="msg eng"><span className="av mascot"><img src="/assets/engineer-mascot.png" alt="Engineer" /></span>
                <div className="bubble"><b>Engineer</b>O coach com IA entra em breve. Enquanto isso, eu respondo com o relatório REAL desta sessão — pergunte sobre <i>perdas, setores, consistência, potencial ou combustível</i>.</div></div>
              {msgs.map((msg, i) => (
                <div key={i} className={'msg ' + (msg.role === 'me' ? 'me' : 'eng')}>
                  {msg.role === 'eng' && <span className="av mascot"><img src="/assets/engineer-mascot.png" alt="Engineer" /></span>}
                  <div className="bubble">
                    {msg.role === 'eng' && (msg.local ? <span className="pw-localtag">análise local · do relatório</span> : <b>Engineer</b>)}
                    {msg.text}
                  </div>
                </div>
              ))}
              {typing && <div className="msg eng"><span className="av mascot"><img src="/assets/engineer-mascot.png" alt="Engineer" /></span><div className="bubble ap-typing"><span></span><span></span><span></span></div></div>}
            </div>
            <div className="ap-suggest">
              {SUGGESTS.map(sg => <button key={sg} className="chip" onClick={() => send(sg)}>{sg}</button>)}
            </div>
            <form className="chatinput ap-input" onSubmit={(e) => { e.preventDefault(); send(draft) }}>
              <input placeholder={`Pergunte sobre a sessão em ${ctx.pista}…`} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button type="submit" className="chip solid" style={{ padding: '7px 14px', border: 0, cursor: 'pointer' }}><Icon n="send" s={13} /> Enviar</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
