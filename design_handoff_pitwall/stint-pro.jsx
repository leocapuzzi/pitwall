/* stint-pro.jsx — premium interactive Stint Overview.
   An interactive laptime-evolution chart is linked to a selectable lap list:
   hover/click a point or a row and both highlight, the sector breakdown + KPIs
   update. Overrides window.StintScreen. */
const { useState: useStateSP, useRef: useRefSP, useMemo: useMemoSP, useCallback: useCbSP } = React;

/* lap, time(s), [s1,s2,s3,s4], fuel(L) */
const SP_LAPS = [
{ n: 1, t: 99.610, s: [26.286, 22.579, 28.107, 22.638], fuel: 0.71, tag: 'out' },
{ n: 2, t: 92.901, s: [20.529, 22.421, 27.468, 22.483], fuel: 0.66 },
{ n: 3, t: 92.454, s: [20.612, 21.903, 27.452, 22.487], fuel: 0.68 },
{ n: 4, t: 91.990, s: [20.380, 22.137, 27.191, 22.282], fuel: 0.67, tag: 'best' },
{ n: 5, t: 92.572, s: [20.643, 22.118, 27.205, 22.606], fuel: 0.68 },
{ n: 6, t: 92.318, s: [20.401, 21.998, 27.331, 22.588], fuel: 0.67 },
{ n: 7, t: 92.740, s: [20.560, 22.205, 27.402, 22.573], fuel: 0.69 },
{ n: 8, t: 92.205, s: [20.452, 21.961, 27.214, 22.578], fuel: 0.66 }];

const SP_BEST = SP_LAPS.reduce((a, b) => b.t < a.t ? b : a);
const SP_BESTSEC = [0, 1, 2, 3].map((i) => Math.min(...SP_LAPS.filter((l) => l.tag !== 'out').map((l) => l.s[i])));
const SP_OPTIMAL = SP_BESTSEC.reduce((a, b) => a + b, 0);
const SP_AVG = (() => {const r = SP_LAPS.filter((l) => l.tag !== 'out');return r.reduce((a, l) => a + l.t, 0) / r.length;})();
const SP_SIGMA = (() => {const r = SP_LAPS.filter((l) => l.tag !== 'out');const m = SP_AVG;return Math.sqrt(r.reduce((a, l) => a + (l.t - m) ** 2, 0) / r.length);})();
function spTime(sec) {const m = Math.floor(sec / 60),s = sec - m * 60;return m + ':' + s.toFixed(3).padStart(6, '0');}

function StintPro() {
  const [sel, setSel] = useStateSP(4);
  const [hover, setHover] = useStateSP(null);
  const [view, setView] = useStateSP('Laptime');
  const cur = SP_LAPS.find((l) => l.n === sel) || SP_LAPS[3];

  // chart domain — ignore out-lap so the racing laps fill the plot
  const racing = SP_LAPS.filter((l) => l.tag !== 'out');
  const lo = Math.min(...racing.map((l) => l.t)) - 0.25,hi = Math.max(...racing.map((l) => l.t)) + 0.25;
  const W = 560,H = 210,PADX = 18,PADT = 14,PADB = 26;
  const x = (i) => PADX + i / (SP_LAPS.length - 1) * (W - PADX * 2);
  const y = (t) => {const c = Math.max(lo, Math.min(hi, t));return PADT + (1 - (c - lo) / (hi - lo)) * (H - PADT - PADB);};
  const pts = SP_LAPS.map((l, i) => ({ i, l, cx: x(i), cy: y(l.t), clip: l.t > hi }));
  const linePath = pts.map((p, i) => (i ? 'L' : 'M') + p.cx.toFixed(1) + ',' + p.cy.toFixed(1)).join(' ');
  const areaPath = linePath + ` L${pts[pts.length - 1].cx},${H - PADB} L${pts[0].cx},${H - PADB} Z`;
  const bestY = y(SP_BEST.t),optY = y(SP_OPTIMAL);
  const active = hover ?? sel;

  return <div className="tp-wrap">
    {/* header */}
    <div className="row between center">
      <div className="row center gap10">
        <span className="cbadge" style={{ width: 40, height: 40 }}><Icon n="car" s={20} /></span>
        <div><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>Stint 1 · Mazda MX5</div>
          <span className="muted" style={{ fontSize: 12 }}>Winton · Race · 8 laps</span></div>
      </div>
      <div className="row center gap8">
        <span className="chip"><Icon n="fuel" s={13} /> 0.67 L/lap · +2 laps</span>
        <window.SlideSeg accent options={['Laptime', 'Sectors']} value={view} onChange={setView} />
      </div>
    </div>

    {/* KPI row */}
    <div className="grid4" style={{ marginTop: 14 }}>
      <div className="card pad stat"><span className="lbl">Fastest lap</span><div className="v green sm">{spTime(SP_BEST.t)}</div><span className="muted" style={{ fontSize: 11 }}>Lap {SP_BEST.n}</span></div>
      <div className="card pad stat"><span className="lbl">Optimal lap</span><div className="v purple sm">{spTime(SP_OPTIMAL)}</div><span className="muted" style={{ fontSize: 11 }}>−{(SP_BEST.t - SP_OPTIMAL).toFixed(2)}s vs best</span></div>
      <div className="card pad stat"><span className="lbl">Average</span><div className="v sm">{spTime(SP_AVG)}</div><span className="muted" style={{ fontSize: 11 }}>σ {SP_SIGMA.toFixed(2)}s</span></div>
      <div className="card pad stat" style={{ background: 'linear-gradient(120deg,var(--accent-soft),var(--surface) 60%)', borderColor: 'var(--accent-line)' }}><span className="lbl">Consistency</span><div className="v sm">{(100 - SP_SIGMA * 40).toFixed(0)}<span style={{ fontSize: 14, color: 'var(--ink-3)' }}>/100</span></div><span className="muted" style={{ fontSize: 11 }}>tight grouping</span></div>
    </div>

    <div className="row tp-main" style={{ gap: 14, alignItems: 'stretch', marginTop: 12, flex: 'none', height: 210 }}>
      {/* interactive chart */}
      <div className="card pad sp-chartcard" style={{ flex: 1.5, display: 'flex', flexDirection: 'column' }}>
        <div className="row between center"><span className="lbl">Laptime evolution</span>
          <div className="row" style={{ gap: 14, fontSize: 11.5, fontWeight: 600 }}>
            <span className="row center gap6"><span className="sp-key" style={{ background: 'var(--accent)' }}></span>Laptime</span>
            <span className="row center gap6"><span className="sp-key dash" style={{ borderColor: 'var(--purple)' }}></span>Optimal</span>
          </div>
        </div>
        <div className="sp-plot" style={{ position: 'relative', flex: 1, minHeight: 130, marginTop: 10 }} onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <defs><linearGradient id="spfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".22" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
            <line x1={PADX} x2={W - PADX} y1={optY} y2={optY} stroke="var(--purple)" strokeWidth="1.4" strokeDasharray="4 4" opacity=".75" vectorEffect="non-scaling-stroke" />
            <line x1={PADX} x2={W - PADX} y1={bestY} y2={bestY} stroke="var(--accent)" strokeWidth="1" strokeDasharray="2 5" opacity=".4" vectorEffect="non-scaling-stroke" />
            <path d={areaPath} fill="url(#spfill)" />
            <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" shapeRendering="geometricPrecision" />
            {pts.map((p) => <rect key={p.i} x={p.cx - W / SP_LAPS.length / 2} y="0" width={W / SP_LAPS.length} height={H} fill="transparent" style={{ cursor: 'pointer' }} onPointerEnter={() => setHover(p.i)} onClick={() => setSel(p.l.n)} />)}
          </svg>
          {active != null && pts[active] && <span className="sp-guide" style={{ left: pts[active].cx / W * 100 + '%' }}></span>}
          {pts.map((p) => <span key={p.i} className={"sp-dot" + (p.l.tag === 'best' ? ' best' : '') + (active === p.i ? ' on' : '')} style={{ left: p.cx / W * 100 + '%', top: p.cy / H * 100 + '%' }}></span>)}
          {active != null && pts[active] && <span className="sp-tip" style={{ left: Math.min(90, Math.max(10, pts[active].cx / W * 100)) + '%', top: pts[active].cy / H * 100 + '%' }}>{spTime(pts[active].l.t)}</span>}
          <div className="sp-xaxis">{pts.map((p) => <span key={p.i} className={active === p.i ? 'on' : ''} style={{ left: p.cx / W * 100 + '%' }}>{p.l.n}</span>)}</div>
        </div>
        <div className="row between" style={{ marginTop: 4 }}><span className="dim" style={{ fontSize: 11 }}>Lap number</span><span className="dim" style={{ fontSize: 11 }}>Optimal {spTime(SP_OPTIMAL)}</span></div>
      </div>

      {/* lap list + selected detail */}
      <div className="col" style={{ flex: 1, gap: 14, minWidth: 0 }}>
        <div className="card sp-listcard" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 4px 4px' }}>
          <span className="lbl" style={{ marginLeft: 14, marginBottom: 6 }}>All laps</span>
          <div className="sp-list">
            {SP_LAPS.map((l) => <button key={l.n} className={"sp-row" + (sel === l.n ? ' on' : '') + (hover === l.n - 1 ? ' hov' : '')}
            onClick={() => setSel(l.n)} onPointerEnter={() => setHover(l.n - 1)} onPointerLeave={() => setHover(null)}>
              <span className="num lead">{l.n}</span>
              <span className={"num " + (l.tag === 'best' ? 'green' : '')}>{spTime(l.t)}</span>
              <span className={"num " + (l.t === SP_BEST.t ? '' : 'redt')} style={{ fontSize: 11.5 }}>{l.tag === 'out' ? 'out' : l.t === SP_BEST.t ? 'best' : '+' + (l.t - SP_BEST.t).toFixed(3)}</span>
              {l.tag === 'best' && <span className="sp-flag">★</span>}
            </button>)}
          </div>
        </div>
      </div>
    </div>

    {/* selected lap sector breakdown — full width band */}
    <div className="card pad sp-secband" style={{ marginTop: 12, paddingTop: 14, paddingBottom: 14 }} key={sel}>
      <div className="row between center" style={{ marginBottom: 10 }}>
        <div className="row center gap10"><span className="lp-cbadge" style={{ background: cur.tag === 'best' ? 'var(--accent)' : 'var(--surface-3)', color: cur.tag === 'best' ? '#0a0d0a' : 'var(--ink)' }}>L{cur.n}</span>
          <div><div className="lbl">Sector breakdown</div><b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{spTime(cur.t)}</b></div></div>
        <span className="muted" style={{ fontSize: 12 }}>green = session-best sector · vs optimal {spTime(SP_OPTIMAL)}</span>
      </div>
      <div className="sp-sectors">
        {cur.s.map((v, i) => {const isBest = Math.abs(v - SP_BESTSEC[i]) < 0.001;const loss = v - SP_BESTSEC[i];
          return <div key={i} className="sp-sec">
            <span className="lbl">S{i + 1}</span>
            <b className={"num " + (isBest ? 'green' : '')} style={{ fontSize: 17 }}>{v.toFixed(3)}</b>
            <div className="sp-secbar"><i style={{ width: Math.min(100, loss / 0.5 * 100) + '%' }}></i></div>
            <span className={"num " + (isBest ? 'green' : 'redt')} style={{ fontSize: 12 }}>{isBest ? 'best' : '+' + loss.toFixed(3)}</span>
          </div>;})}
      </div>
    </div>
  </div>;
}
window.StintScreen = function () {return <StintPro />;};