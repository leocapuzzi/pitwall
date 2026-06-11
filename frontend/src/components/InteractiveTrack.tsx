import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode } from 'react'
import Icon from './Icon'
import type { TrackGeom, TrackEdges } from '../lib/track'

export interface TrackHandle {
  setT: (tv: number, braking?: boolean) => void      // carro principal (fração de distância)
  setT2: (tv: number | null) => void                  // carro-fantasma (null esconde)
}

// Mapa interativo v3.
// - PISTA: polígono do asfalto real (OSM), SEM bordas — estilo GO Fast.
// - CARRO: sprite <img> em escala física, camada GPU (translate+rotate 1:1).
// - FANTASMA: 2º sprite (comparação) na linha da média, com linha pontilhada.
// - CÂMERA: viewport IMPERATIVO (<g> via ref); com `follow`, segue o carro quando
//   há zoom (sem pan manual — zoom in/out apenas, como o GO Fast).
// - BALÕES de curva: divs HTML posicionadas imperativamente (acompanham a câmera).
const CAR = 66    // fallback (pistas sem geometria real): box em unidades do viewBox
const CAR_M = 7.5 // sprite ~1.7x o tamanho físico — proporção carro×pista da referência GO Fast
const CAR_MIN_PX = 11 // piso de visibilidade na visão geral
const Z_MAX = 48
const markURL = (color: string) => {
  const g = String((window as any).PORSCHE_MARK || '').replace(/currentColor/g, color)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">${g}</svg>`)
}

interface VP { z: number; x: number; y: number }

const InteractiveTrack = forwardRef<TrackHandle, {
  trackGeom: TrackGeom; racingGeom: TrackGeom; racingGeomB?: TrackGeom; initialT?: number
  corners?: { n: number; apex_pct: number }[]; activeCorner?: number | null
  onPickCorner?: (n: number | null) => void; height?: number
  racingSegments?: { d: string; color: string }[]   // linha colorida por delta (Lap)
  focusCorner?: number | null                       // zoom programático numa curva
  children?: ReactNode                              // overlays (callouts/insets)
  edges?: TrackEdges                                // asfalto REAL (OSM)
  unitPerM?: number                                 // escala (unidades/m) p/ carro em tamanho real
  follow?: boolean                                  // câmera fixa no carro quando há zoom
  hideCorners?: boolean                             // mapa limpo (balões só no minimapa)
  initialZoom?: number                              // abre já aproximado no carro (GO Fast)
  markers?: { x: number; y: number; ang: number }[] // bandeirinhas de freada (vermelhas)
  zoomSlider?: boolean                              // pílula − slider + central (GO Fast)
  followX?: number                                  // âncora horizontal da câmera (fração do palco; 0.5 = centro). Telas com painel à direita usam ~0.22
}>(function InteractiveTrack({ trackGeom, racingGeom, racingGeomB, initialT = 0, corners, activeCorner, onPickCorner, height = 300, racingSegments, focusCorner, children, edges, unitPerM, follow, hideCorners, initialZoom, markers, zoomSlider, followX = 0.5 }, ref) {
  const carRef = useRef<HTMLDivElement>(null), ghostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null), gRef = useRef<SVGGElement>(null), stageRef = useRef<HTMLDivElement>(null)
  const dotsWrapRef = useRef<HTMLDivElement>(null), marksWrapRef = useRef<HTMLDivElement>(null)
  const vpr = useRef<VP>({ z: 1, x: 0, y: 0 })
  const [vpUi, setVpUi] = useState<VP>(vpr.current)  // espelho p/ UI discreta (botões/classe)
  const sizeRef = useRef({ w: 0, h: 0 })
  const tLast = useRef(initialT), tBLast = useRef<number | null>(null)
  const brakingRef = useRef<boolean | null>(null)
  const carPx = useRef(0), ghostPx = useRef(0)
  const imgARef = useRef<HTMLImageElement>(null), imgBRef = useRef<HTMLImageElement>(null)
  const sprites = useMemo(() => ({ normal: markURL('#F4F7F6'), braking: markURL('#FF7A6B'), ghost: markURL('#9BA6B2') }), [])

  const ptsA = racingGeom.pts
  const ptsB = racingGeomB?.pts?.length ? racingGeomB.pts : ptsA
  const clampVp = (z: number, x: number, y: number): VP => ({ z, x: Math.min(0, Math.max(-1000 * (z - 1), x)), y: Math.min(0, Math.max(-640 * (z - 1), y)) })

  // escreve o viewport DIRETO no DOM (o <g> não é controlado pelo React)
  const writeVp = (v: VP) => { vpr.current = v; gRef.current?.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.z})`) }
  const applyVp = (v: VP) => { writeVp(v); setVpUi(v) }

  const lerpPt = (pts: { x: number; y: number }[], tv: number) => {
    const n = pts.length
    const f = (((tv % 1) + 1) % 1) * (n - 1)
    const i = Math.floor(f), fr = f - i, i1 = Math.min(n - 1, i + 1)
    const x = pts[i].x + (pts[i1].x - pts[i].x) * fr, y = pts[i].y + (pts[i1].y - pts[i].y) * fr
    const j = Math.min(n - 1, i + 3), j1 = Math.min(n - 1, j + 1)
    const bx = pts[j].x + (pts[j1].x - pts[j].x) * fr, by = pts[j].y + (pts[j1].y - pts[j].y) * fr
    return { x, y, ang: Math.atan2(by - y, bx - x) * 180 / Math.PI }
  }

  const placeSprite = (el: HTMLDivElement | null, p: { x: number; y: number; ang: number }, sizeRefP: { current: number }) => {
    if (!el) return
    const { w, h } = sizeRef.current
    const v = vpr.current
    const sc = Math.min(w / 1000, h / 640), ox = (w - 1000 * sc) / 2, oy = (h - 640 * sc) / 2
    const px = ox + sc * (v.x + v.z * p.x), py = oy + sc * (v.y + v.z * p.y)
    const units = unitPerM ? CAR_M * unitPerM : CAR
    const size = Math.max(unitPerM ? CAR_MIN_PX : 0, units * sc * v.z)
    if (Math.abs(size - sizeRefP.current) > 0.5) { sizeRefP.current = size; el.style.width = size.toFixed(1) + 'px'; el.style.height = size.toFixed(1) + 'px' }
    const half = sizeRefP.current / 2
    el.style.visibility = 'visible'
    el.style.transform = `translate3d(${(px - half).toFixed(2)}px,${(py - half).toFixed(2)}px,0) rotate(${(p.ang + 90).toFixed(2)}deg)`
  }

  // posiciona TUDO que depende de t/câmera: carro, fantasma e balões
  const renderAll = useCallback((braking?: boolean) => {
    const { w, h } = sizeRef.current
    const car = carRef.current
    if (!w || !h || ptsA.length < 2) { if (car) car.style.visibility = 'hidden'; return }
    const a = lerpPt(ptsA, tLast.current)
    // câmera fixa no carro (sem clamp — fundo é escuro, como o GO Fast). A âncora
    // horizontal é deslocável (followX): telas com painel à direita centram o carro
    // na ÁREA VISÍVEL do mapa, não no centro da tela. Vale em QUALQUER zoom —
    // inclusive no zoom out máximo (z=1), senão o mapa "solta" a âncora e volta
    // pro centro da tela (debaixo do painel).
    if (follow) {
      const sc0 = Math.min(w / 1000, h / 640), ox0 = (w - 1000 * sc0) / 2, oy0 = (h - 640 * sc0) / 2
      const cx = (followX * w - ox0) / sc0, cy = (0.5 * h - oy0) / sc0
      writeVp({ z: vpr.current.z, x: cx - vpr.current.z * a.x, y: cy - vpr.current.z * a.y })
    }
    placeSprite(car, a, carPx)
    if (braking !== undefined && braking !== brakingRef.current) {
      brakingRef.current = braking
      if (imgARef.current) imgARef.current.style.opacity = braking ? '0' : '1'
      if (imgBRef.current) imgBRef.current.style.opacity = braking ? '1' : '0'
    }
    const ghost = ghostRef.current
    if (ghost) {
      if (tBLast.current == null || ptsB.length < 2) ghost.style.visibility = 'hidden'
      else placeSprite(ghost, lerpPt(ptsB, tBLast.current), ghostPx)
    }
    const v2 = vpr.current
    const sc2 = Math.min(w / 1000, h / 640), ox2 = (w - 1000 * sc2) / 2, oy2 = (h - 640 * sc2) / 2
    const wrap = dotsWrapRef.current
    if (wrap) {
      for (const el of Array.from(wrap.children) as HTMLElement[]) {
        const bx = parseFloat(el.dataset.bx || '0'), by = parseFloat(el.dataset.by || '0')
        el.style.transform = `translate3d(${(ox2 + sc2 * (v2.x + v2.z * bx) - 8.5).toFixed(1)}px,${(oy2 + sc2 * (v2.y + v2.z * by) - 8.5).toFixed(1)}px,0)`
      }
    }
    const marks = marksWrapRef.current
    if (marks) {
      for (const el of Array.from(marks.children) as HTMLElement[]) {
        const mx = parseFloat(el.dataset.mx || '0'), my = parseFloat(el.dataset.my || '0')
        el.style.transform = `translate3d(${(ox2 + sc2 * (v2.x + v2.z * mx) - 7).toFixed(1)}px,${(oy2 + sc2 * (v2.y + v2.z * my) - 7).toFixed(1)}px,0)`
      }
    }
  }, [racingGeom, racingGeomB, unitPerM, follow, followX])

  const setT = useCallback((tv: number, braking?: boolean) => { tLast.current = tv; renderAll(braking) }, [renderAll])
  const setT2 = useCallback((tv: number | null) => {
    tBLast.current = tv
    const ghost = ghostRef.current; if (!ghost) return
    if (tv == null || ptsB.length < 2) { ghost.style.visibility = 'hidden'; return }
    placeSprite(ghost, lerpPt(ptsB, tv), ghostPx)
  }, [renderAll])
  useImperativeHandle(ref, () => ({ setT, setT2 }), [setT, setT2])

  // mede o palco e re-renderiza tudo (resize/geometria)
  useLayoutEffect(() => {
    const el = stageRef.current; if (!el) return
    const measure = () => { sizeRef.current = { w: el.clientWidth, h: el.clientHeight }; writeVp(vpr.current); renderAll() }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    return () => ro.disconnect()
  }, [renderAll])
  // mudanças discretas de viewport (botões/roda/foco) já escrevem direto; este efeito
  // cobre o primeiro mount e re-renders do React (g não é controlado)
  useLayoutEffect(() => { writeVp(vpr.current); renderAll() })

  // abre já com a câmera no carro (o follow centra assim que z>1)
  const initZoomDone = useRef(false)
  useLayoutEffect(() => {
    if (initZoomDone.current || !initialZoom || initialZoom <= 1) return
    initZoomDone.current = true
    const v = { z: Math.min(Z_MAX, initialZoom), x: vpr.current.x, y: vpr.current.y }
    applyVp(v)
    renderAll()
  }, [initialZoom, renderAll])

  // zoom programático numa curva: centra o ápice (o follow assume se o carro estiver lá).
  // Só RESETA quando o foco é desfeito (não no mount, senão mataria o initialZoom).
  const hadFocus = useRef(false)
  useLayoutEffect(() => {
    if (focusCorner == null) {
      if (hadFocus.current) { hadFocus.current = false; applyVp({ z: 1, x: 0, y: 0 }); renderAll() }
      return
    }
    const c = (corners || []).find(k => k.n === focusCorner); const tp = trackGeom.pts
    if (!c || tp.length < 2) return
    hadFocus.current = true
    const p = tp[Math.min(tp.length - 1, Math.max(0, Math.round(c.apex_pct * (tp.length - 1))))]
    const z = 8
    applyVp({ z, x: 500 - z * p.x, y: 320 - z * p.y })
    renderAll()
  }, [focusCorner])

  const dots = useMemo(() => {
    const tp = trackGeom.pts, tn = tp.length
    return (corners || []).map(c => {
      const i = Math.min(tn - 1, Math.max(0, Math.round(c.apex_pct * (tn - 1)))); const p = tp[i] || { x: 0, y: 0 }
      return { n: c.n, x: p.x, y: p.y }
    })
  }, [corners, trackGeom])

  const toVB = (cx: number, cy: number) => { const svg = svgRef.current!; const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; return pt.matrixTransform(svg.getScreenCTM()!.inverse()) }
  const zoomAt = (f: number, vx: number, vy: number) => {
    const s = vpr.current
    const nz = Math.max(1, Math.min(Z_MAX, s.z * f))
    const Lx = (vx - s.x) / s.z, Ly = (vy - s.y) / s.z
    const v = nz <= 1.001 ? { z: 1, x: 0, y: 0 } : (follow ? { z: nz, x: vx - nz * Lx, y: vy - nz * Ly } : clampVp(nz, vx - nz * Lx, vy - nz * Ly))
    applyVp(v)
    renderAll()
  }
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const p = toVB(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y) }
    svg.addEventListener('wheel', onWheel, { passive: false }); return () => svg.removeEventListener('wheel', onWheel)
  }, [follow])
  const onDown = useCallback((e: RPointerEvent) => {
    if (e.button !== 0 || follow) return   // com câmera fixa no carro não há pan manual
    const svg = svgRef.current!, rect = svg.getBoundingClientRect()
    const sc = Math.min(rect.width / 1000, rect.height / 640)
    const sx = e.clientX, sy = e.clientY, start = { ...vpr.current }; svg.classList.add('grabbing')
    const mv = (ev: PointerEvent) => { applyVp(clampVp(start.z, start.x + (ev.clientX - sx) / sc, start.y + (ev.clientY - sy) / sc)); renderAll() }
    const up = () => { svg.classList.remove('grabbing'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }, [follow, renderAll])
  const zoomed = vpUi.z > 1.01
  return (
    <div ref={stageRef} className={'trackstage tp-track' + (zoomed ? ' zoomed' : '') + (follow ? ' follow' : '')} style={{ flex: 1, minHeight: height, position: 'relative', marginTop: 12 }}>
      <svg ref={svgRef} viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" onPointerDown={onDown} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <g ref={gRef}>
          {/* ASFALTO real (OSM): só o polígono, sem bordas — estilo GO Fast.
              Fallback (sem geometria): faixa estilizada. */}
          {edges ? (
            <path d={edges.roadD} fill="rgba(244,247,246,.075)" stroke="none" />
          ) : (
            <>
              <path d={trackGeom.d} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" />
              <path d={trackGeom.d} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={1.4} strokeDasharray="2 9" />
            </>
          )}
          {/* linha do FANTASMA (volta de comparação): tracejada branca sobre o asfalto,
              como na referência GO Fast (não é borda da pista) */}
          {racingGeomB && <path d={racingGeomB.d} fill="none" stroke="rgba(244,247,246,.8)" strokeWidth={2.6} strokeDasharray="5 6" strokeLinecap="butt" vectorEffect="non-scaling-stroke" />}
          {/* LINHA da sessão: gradiente por delta (Lap) ou inteira (accent) */}
          {racingSegments?.length
            ? racingSegments.map((s, i) => <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={edges ? 4 : 3.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect={edges ? 'non-scaling-stroke' : undefined} />)
            : <path d={racingGeom.d} fill="none" stroke="var(--accent)" strokeWidth={edges ? 1.8 : 3.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect={edges ? 'non-scaling-stroke' : undefined} style={{ filter: 'drop-shadow(0 0 6px var(--accent-glow))' }} />}
        </g>
      </svg>
      {/* bandeirinhas de freada em espaço de TELA (tamanho fixo; seguem a câmera) */}
      {markers && markers.length > 0 && (
        <div ref={marksWrapRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {markers.map((mk, i) => (
            <span key={i} className="pw-flagwrap" data-mx={mk.x} data-my={mk.y}>
              <i style={{ transform: `rotate(${(mk.ang + 90).toFixed(1)}deg)` }} />
            </span>
          ))}
        </div>
      )}
      {/* BALÕES das curvas: divs em espaço de tela, posicionadas por frame (seguem a câmera) */}
      {!hideCorners && dots.length > 0 && (
        <div ref={dotsWrapRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {dots.map(d => (
            <div key={d.n} className={'pw-bal' + (activeCorner === d.n ? ' on' : '')} data-bx={d.x} data-by={d.y}
              onPointerDown={(e) => { e.stopPropagation(); onPickCorner && onPickCorner(d.n) }}>{d.n}</div>
          ))}
        </div>
      )}
      {/* FANTASMA (comparação) — abaixo do carro principal */}
      <div ref={ghostRef} aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: CAR, height: CAR, pointerEvents: 'none', willChange: 'transform', visibility: 'hidden', opacity: 0.8 }}>
        <img src={sprites.ghost} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </div>
      {/* CARRO principal: sprites <img> (branco/freando) trocados por opacity */}
      <div ref={carRef} aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: CAR, height: CAR, pointerEvents: 'none', willChange: 'transform', visibility: 'hidden' }}>
        <img ref={imgARef} src={sprites.normal} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 1 }} />
        <img ref={imgBRef} src={sprites.braking} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0 }} />
      </div>
      {children}
      {zoomSlider ? (
        <div className="pw-zoompill pw-glass2">
          <button onClick={() => zoomAt(1 / 1.35, 500, 320)} aria-label="Zoom out">−</button>
          <input type="range" min={0} max={100} value={Math.round(Math.log(Math.max(1, vpUi.z)) / Math.log(Z_MAX) * 100)}
            onChange={(e) => {
              const z = Math.exp(+e.target.value / 100 * Math.log(Z_MAX))
              const s = vpr.current
              applyVp(z <= 1.001 ? { z: 1, x: 0, y: 0 } : { z, x: s.x, y: s.y })
              renderAll()
            }} aria-label="Zoom" />
          <button onClick={() => zoomAt(1.35, 500, 320)} aria-label="Zoom in">+</button>
        </div>
      ) : (
        <>
          <div className="tp-zoom">
            <button onClick={() => zoomAt(1.4, 500, 320)} aria-label="Zoom in"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></button>
            <button onClick={() => zoomAt(1 / 1.4, 500, 320)} aria-label="Zoom out"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg></button>
            <button className={'tp-zreset' + (zoomed ? ' show' : '')} onClick={() => { applyVp({ z: 1, x: 0, y: 0 }); renderAll(); onPickCorner && onPickCorner(null) }} aria-label="Reset view"><Icon n="refresh" s={13} /></button>
          </div>
          <div className="tp-zoomhint">{follow ? 'Zoom aproxima no carro · roda do mouse' : 'Scroll to zoom · drag to pan'}</div>
        </>
      )}
    </div>
  )
})
export default InteractiveTrack
