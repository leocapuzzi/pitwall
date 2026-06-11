/* re-shared.jsx — shared premium primitives for Race Engineer screens
   (Lap Analysis, Stint Overview). Exports React components to window so the
   per-screen babel files can consume them. Keep telemetry-pro.jsx untouched. */
const {useState:useStateRS, useRef:useRefRS, useEffect:useEffectRS, useLayoutEffect:useLayoutRS, useMemo:useMemoRS, useCallback:useCbRS} = React;

/* ---- seeded series (shared) ---- */
function rsLcg(s){let x=s||7; return ()=>{x=(x*1103515245+12345)&0x7fffffff; return x/0x7fffffff;};}
window.reSeries=function(kind, seed, n){
  const r=rsLcg(seed||13), main=[], ghost=[];
  for(let i=0;i<=n;i++){
    const t=i/n; let v=0.5, g=0.5;
    if(kind==='throttle'){const base=(Math.sin(t*34)>0.1?0.94:0.04); v=base+(r()-0.5)*0.07; g=base+(r()-0.5)*0.1-0.03;}
    else if(kind==='brake'){const sp=Math.max(0,Math.sin(t*30+1)); const on=sp>0.6; v=on?0.55+sp*0.42:0.02+r()*0.03; g=on?0.5+sp*0.4:0.02+r()*0.03;}
    else if(kind==='speed'){v=0.45+0.42*Math.sin(t*9-0.6)+(r()-0.5)*0.04; g=v-0.05-r()*0.035;}
    else{v=0.5+0.4*Math.sin(t*7)+(r()-0.5)*0.04; g=0.5+0.4*Math.sin(t*7-0.15);}
    v=Math.max(0.02,Math.min(0.98,v)); g=Math.max(0.02,Math.min(0.98,g));
    main.push(v); ghost.push(g);
  }
  return {main,ghost};
};

/* ---- shared track geometry ---- */
const RE_TRACK="M120,520 C90,360 150,250 300,210 C420,178 470,250 560,240 C690,226 700,120 820,150 C930,178 940,300 840,360 C720,430 640,330 520,400 C420,458 360,560 240,540 C170,528 150,560 120,520 Z";
window.RE_TRACK=RE_TRACK;
/* corner anchors: fraction along the path + label + which sector */
window.RE_CORNERS=[
  {id:'T1',f:0.07,s:'S1'},{id:'T2',f:0.20,s:'S1'},{id:'T3',f:0.34,s:'S2'},
  {id:'T4',f:0.52,s:'S2'},{id:'T5',f:0.68,s:'S3'},{id:'T6',f:0.86,s:'S4'},
];

/* ---- sliding segmented control ---- */
window.SlideSeg=function SlideSeg({options, value, onChange, accent}){
  const i=Math.max(0,options.indexOf(value));
  return <div className={"sseg"+(accent?' accent':'')}>
    <span className="sseg-ind" style={{left:`calc(3px + ${i} * ((100% - 6px)/${options.length}))`, width:`calc((100% - 6px)/${options.length})`}}></span>
    {options.map(o=><button key={o} className={o===value?'on':''} onClick={()=>onChange(o)}>{o}</button>)}
  </div>;
};

/* ---- interactive track: zoom (wheel/buttons) + pan (drag) + animated focus ----
   props: t (0..1 cursor for the car, or null to hide car), braking,
          focus ({x,y,z} viewport target, animated) , corners (array to render dots),
          activeCorner (id), onPickCorner(id), redPath (optional sector overlay) */
window.InteractiveTrack=function InteractiveTrack({t, braking, focusCorner, corners, activeCorner, onPickCorner, redPath, height=300, hint=true, children}){
  const pathRef=useRefRS(), carRef=useRefRS(), lenRef=useRefRS(0), svgRef=useRefRS();
  const [vp,setVp]=useStateRS({z:1,x:0,y:0});
  const [smooth,setSmooth]=useStateRS(false);
  const vpr=useRefRS(vp); vpr.current=vp;
  const clampVp=(z,x,y)=>({z, x:Math.min(0,Math.max(-1000*(z-1),x)), y:Math.min(0,Math.max(-640*(z-1),y))});

  // car follows t
  useLayoutRS(()=>{
    const p=pathRef.current, car=carRef.current; if(!p||!car||t==null) return;
    if(!lenRef.current) lenRef.current=p.getTotalLength();
    const L=lenRef.current, pt=p.getPointAtLength((t%1)*L), pt2=p.getPointAtLength(((t+0.006)%1)*L);
    const ang=Math.atan2(pt2.y-pt.y,pt2.x-pt.x)*180/Math.PI;
    car.setAttribute('transform',`translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)}) rotate(${(ang+90).toFixed(1)})`);
    car.style.filter=`drop-shadow(0 1px 1.5px rgba(0,0,0,.8)) drop-shadow(0 0 7px ${braking?'var(--red)':'var(--accent)'})`;
  },[t,braking]);

  // corner dot positions (measured from the live path)
  const [dotPts,setDotPts]=useStateRS([]);
  useLayoutRS(()=>{
    const p=pathRef.current; if(!p||!corners) return;
    const L=p.getTotalLength();
    setDotPts(corners.map(c=>{const pt=p.getPointAtLength(c.f*L); return {id:c.id, x:pt.x, y:pt.y};}));
  },[corners]);

  // animated focus -> viewport (by corner id)
  useEffectRS(()=>{
    if(!focusCorner){ setSmooth(true); setVp({z:1,x:0,y:0}); return; }
    const d=dotPts.find(p=>p.id===focusCorner); if(!d) return;
    const z=2.4; setSmooth(true);
    setVp(clampVp(z, 500-d.x*z, 320-d.y*z));
  },[focusCorner, dotPts]);

  const toVB=(cx,cy)=>{const svg=svgRef.current; const pt=svg.createSVGPoint(); pt.x=cx; pt.y=cy; return pt.matrixTransform(svg.getScreenCTM().inverse());};
  const zoomAt=(factor,vx,vy)=>{setSmooth(false); setVp(s=>{const nz=Math.max(1,Math.min(5,s.z*factor)); const Lx=(vx-s.x)/s.z, Ly=(vy-s.y)/s.z; return clampVp(nz, vx-nz*Lx, vy-nz*Ly);});};
  useEffectRS(()=>{
    const svg=svgRef.current; if(!svg) return;
    const onWheel=(e)=>{e.preventDefault(); const p=toVB(e.clientX,e.clientY); zoomAt(e.deltaY<0?1.2:1/1.2, p.x, p.y);};
    svg.addEventListener('wheel',onWheel,{passive:false});
    return ()=>svg.removeEventListener('wheel',onWheel);
  },[]);
  const onDown=useCbRS((e)=>{
    if(e.button!==0) return;
    const svg=svgRef.current, rect=svg.getBoundingClientRect();
    const sc=Math.min(rect.width/1000, rect.height/640);
    const sx=e.clientX, sy=e.clientY, start={...vpr.current}; let moved=false;
    setSmooth(false);
    const mv=(ev)=>{if(Math.abs(ev.clientX-sx)+Math.abs(ev.clientY-sy)>3)moved=true; setVp(clampVp(start.z, start.x+(ev.clientX-sx)/sc, start.y+(ev.clientY-sy)/sc));};
    const up=()=>{svg.classList.remove('grabbing'); window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up);};
    svg.classList.add('grabbing');
    window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up);
  },[]);

  // corner dot positions
  const zoomed=vp.z>1.01;
  return <div className={"trackstage tp-track"+(zoomed?' zoomed':'')} style={{flex:1,minHeight:height,position:'relative'}}>
    <svg ref={svgRef} viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" onPointerDown={onDown}
      style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
      <g style={{transform:`translate(${vp.x}px, ${vp.y}px) scale(${vp.z})`, transition:smooth?'transform .55s cubic-bezier(.4,0,.2,1)':'none'}}>
        <path d={RE_TRACK} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="44" strokeLinecap="round"/>
        <path d={RE_TRACK} fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="1.4" strokeDasharray="2 9"/>
        <path ref={pathRef} d={RE_TRACK} fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" style={{filter:'drop-shadow(0 0 6px var(--accent-glow))'}}/>
        {redPath && <path d={redPath} fill="none" stroke="var(--red)" strokeWidth="3.5" strokeLinecap="round" style={{filter:'drop-shadow(0 0 6px var(--red))'}}/>}
        {dotPts.map(d=><g key={d.id} onPointerDown={(e)=>{e.stopPropagation(); onPickCorner&&onPickCorner(d.id);}} style={{cursor:'pointer'}}>
          <circle cx={d.x} cy={d.y} r={activeCorner===d.id?11:8} fill={activeCorner===d.id?'var(--accent)':'var(--surface-2)'} stroke={activeCorner===d.id?'#0a0d0a':'var(--accent)'} strokeWidth="2.5" style={{transition:'r .2s'}}/>
          <text x={d.x} y={d.y+0.5} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="800" fill={activeCorner===d.id?'#0a0d0a':'var(--accent)'} style={{pointerEvents:'none'}}>{d.id.replace('T','')}</text>
        </g>)}
        {t!=null && <g ref={carRef} style={{color:'#F4F7F6'}}>
          <g transform="scale(0.11) translate(-300,-300)" dangerouslySetInnerHTML={{__html:window.PORSCHE_MARK||''}}/>
        </g>}
      </g>
    </svg>
    <div className="tp-zoom">
      <button onClick={()=>zoomAt(1.4,500,320)} aria-label="Zoom in"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
      <button onClick={()=>zoomAt(1/1.4,500,320)} aria-label="Zoom out"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14"/></svg></button>
      <button className={"tp-zreset"+(zoomed?' show':'')} onClick={()=>{setSmooth(true); setVp({z:1,x:0,y:0}); onPickCorner&&onPickCorner(null);}} aria-label="Reset view"><Icon n="refresh" s={13}/></button>
    </div>
    {hint && <div className="tp-zoomhint">Scroll to zoom · drag to pan</div>}
    {children}
  </div>;
};

/* ---- premium scrubber (play / drag / time / delta) ---- */
window.REScrubber=function REScrubber({t, playing, onToggle, onScrub, delta, sub, mode, setMode, lap}){
  const trackRef=useRefRS();
  const startDrag=useCbRS((e)=>{
    const el=trackRef.current; const set=(cx)=>{const r=el.getBoundingClientRect(); onScrub(Math.max(0,Math.min(1,(cx-r.left)/r.width)));};
    set(e.clientX); const mv=(ev)=>set(ev.clientX); const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);};
    window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up);
  },[onScrub]);
  return <div className="tp-scrub card">
    <button className={"tp-play"+(playing?' on':'')} onClick={onToggle} aria-label={playing?'Pause':'Play'}>
      {playing? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>
              : <Icon n="play" s={14} fill="currentColor"/>}
    </button>
    <b className="num tp-clock">{lap}</b>
    <div className="tp-track-bar" ref={trackRef} onPointerDown={startDrag}>
      <div className="tp-fill" style={{width:(t*100)+'%'}}></div>
      {window.RE_CORNERS.map((c,i)=><span key={i} className="tp-tick" style={{left:(c.f*100)+'%'}}></span>)}
      <span className="tp-knob" style={{left:(t*100)+'%'}}></span>
    </div>
    <div className="tp-readout">
      <span className="dim">Δ</span> <b className={"num "+(delta>=0?'redt':'green')}>{(delta>=0?'+':'−')+Math.abs(delta).toFixed(3)}</b>
      {sub&&<><span className="dim" style={{marginLeft:12}}>{sub.k}</span> <b className="num">{sub.v}</b></>}
    </div>
    {setMode && <window.SlideSeg accent options={['Time','Distance']} value={mode==='Distance'?'Distance':'Time'} onChange={setMode}/>}
  </div>;
};
