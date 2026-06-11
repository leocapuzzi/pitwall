/* telemetry-pro.jsx — premium, fully interactive telemetry analyzer.
   A single shared cursor `t` (0..1 along the lap) is driven by play/pause,
   scrubber drag, and scrub-on-hover. It moves every channel cursor, the car
   marker on the track (rotated to the racing-line tangent) and all live values. */
const {useState:useStateTP, useRef:useRefTP, useEffect:useEffectTP, useLayoutEffect:useLayoutTP, useMemo:useMemoTP, useCallback:useCbTP} = React;

/* ---- seeded series (matches charts.jsx semantics; returns raw arrays) ---- */
function tpLcg(s){let x=s||7; return ()=>{x=(x*1103515245+12345)&0x7fffffff; return x/0x7fffffff;};}
function tpSeries(kind, seed, n){
  const r=tpLcg(seed||13), main=[], ghost=[];
  for(let i=0;i<=n;i++){
    const t=i/n; let v=0.5, g=0.5;
    if(kind==='throttle'){const base=(Math.sin(t*34)>0.1?0.94:0.04); v=base+(r()-0.5)*0.07; g=base+(r()-0.5)*0.1-0.03;}
    else if(kind==='brake'){const sp=Math.max(0,Math.sin(t*30+1)); const on=sp>0.6; v=on?0.55+sp*0.42+(r()-0.5)*0.05:0.02+r()*0.03; g=on?0.5+sp*0.4:0.02+r()*0.03;}
    else if(kind==='speed'){v=0.45+0.42*Math.sin(t*9-0.6)+(r()-0.5)*0.04; g=v-0.05-r()*0.035;}
    else if(kind==='steering'){v=0.5+0.4*Math.sin(t*7)+(r()-0.5)*0.035; g=0.5+0.4*Math.sin(t*7-0.15);}
    else if(kind==='gear'){v=Math.round(0.2+(0.5+0.45*Math.sin(t*6))*5)/6; g=v;}
    else if(kind==='rpm'){const ph=(t*6)%1; v=0.35+ph*0.6+(r()-0.3)*0.04; if(v>0.96)v=0.4; g=v-0.04;}
    else{v=Math.min(0.95,0.1+t*0.85+Math.sin(t*5)*0.03); g=Math.max(0.04,v-0.05-Math.sin(t*5)*0.04);}
    v=Math.max(0.02,Math.min(0.98,v)); g=Math.max(0.02,Math.min(0.98,g));
    main.push(v); ghost.push(g);
  }
  return {main,ghost};
}
function tpLine(arr,W,H){return arr.map((v,i)=>(i?'L':'M')+(i/(arr.length-1)*W).toFixed(1)+','+((1-v)*H).toFixed(1)).join(' ');}
function tpStep(arr,W,H){let d=''; arr.forEach((v,i)=>{const x0=i/(arr.length-1)*W,y=(1-v)*H; d+=(i?`L${x0.toFixed(1)},${y.toFixed(1)}`:`M${x0.toFixed(1)},${y.toFixed(1)}`); if(i<arr.length-1){const x1=(i+1)/(arr.length-1)*W; d+=` L${x1.toFixed(1)},${y.toFixed(1)}`;}}); return d;}

const TP_N=240;
const TP_SEEDS={delta:11,speed:44,throttle:22,brake:33,rpm:77,gear:66,steering:55};
const TP_DEFS=[
  {kind:'delta',    name:'Delta',    color:'var(--purple)', unit:'s',    fmt:v=>{const d=(v-0.45)*0.9; return (d>=0?'+':'−')+Math.abs(d).toFixed(3);}},
  {kind:'speed',    name:'Speed',    color:'var(--cyan)',   unit:'km/h', fmt:v=>Math.round(60+v*175)},
  {kind:'throttle', name:'Throttle', color:'var(--accent)', unit:'%',    fmt:v=>Math.round(v*100)},
  {kind:'brake',    name:'Brake',    color:'var(--red)',    unit:'%',    fmt:v=>Math.round(v*100)},
  {kind:'rpm',      name:'RPM',      color:'var(--amber)',  unit:'',     fmt:v=>((3200+v*4600)/1000).toFixed(1)+'k'},
  {kind:'gear',     name:'Gear',     color:'var(--ink)',    unit:'',     fmt:v=>Math.max(1,Math.round(v*6))},
  {kind:'steering', name:'Steering', color:'var(--ink-2)',  unit:'°',    fmt:v=>Math.round((v-0.5)*180)},
];
const TP_LAP_YOU=91.990, TP_LAP_REF=90.149, TP_PLAY_SECS=16;
function tpTime(sec){const m=Math.floor(sec/60), s=sec-m*60; return m+':'+s.toFixed(3).padStart(6,'0');}

/* ---- sliding segmented control ---- */
function SlideSeg({options, value, onChange, accent}){
  const i=Math.max(0,options.indexOf(value));
  return <div className={"sseg"+(accent?' accent':'')}>
    <span className="sseg-ind" style={{left:`calc(3px + ${i} * ((100% - 6px)/${options.length}))`, width:`calc((100% - 6px)/${options.length})`}}></span>
    {options.map(o=><button key={o} className={o===value?'on':''} onClick={()=>onChange(o)}>{o}</button>)}
  </div>;
}

/* ---- one channel row ---- */
function TPChannel({def, paths, main, ghost, t, idx, i, onScrub, zoom, onHide, onDragStart, dragging}){
  const W=600,H=100;
  const lo=zoom?zoom.lo:0, hi=zoom?zoom.hi:1, span=Math.max(0.0001,hi-lo);
  const leftPct=((t-lo)/span)*100, topPct=(1-main[idx])*100;
  const inView=leftPct>=0&&leftPct<=100;
  const onMove=useCbTP((e)=>{const r=e.currentTarget.getBoundingClientRect(); const f=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); onScrub(lo+f*span);},[onScrub,lo,span]);
  return <div className={"tp-chan"+(dragging?' dragging':'')} data-kind={def.kind} style={{animationDelay:(0.04*i+0.05)+'s'}}>
    <div className="tp-chan-head">
      <span className="tp-grip" onPointerDown={(e)=>onDragStart(e,def.kind)} title="Drag to reorder"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.7"/><circle cx="15" cy="5" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="19" r="1.7"/><circle cx="15" cy="19" r="1.7"/></svg></span>
      <span className="lbl">{def.name}</span>
      <span className="tp-ref num">{def.fmt(ghost[idx])}</span>
      <span className="tp-val num" style={{color:def.color}}>{def.fmt(main[idx])}<i>{def.unit}</i></span>
      <button className="tp-hide" onClick={()=>onHide(def.kind)} title="Hide channel" aria-label="Hide channel"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div className="tp-plot" onPointerMove={onMove}>
      <svg viewBox={`${(lo*W).toFixed(1)} 0 ${(span*W).toFixed(1)} ${H}`} preserveAspectRatio="none" className="tp-svg">
        <defs><linearGradient id={'tpg-'+def.kind} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={def.color} stopOpacity=".34"/><stop offset="1" stopColor={def.color} stopOpacity="0"/></linearGradient></defs>
        {def.kind!=='gear' && <path d={paths.area} fill={`url(#tpg-${def.kind})`}/>}
        <path d={paths.ghost} className="tp-ghost"/>
        <path d={paths.line} fill="none" stroke={def.color} className="tp-mainline"/>
      </svg>
      {inView && <span className="tp-cursor" style={{left:leftPct+'%'}}></span>}
      {def.kind!=='gear' && inView && <span className="tp-dot" style={{left:leftPct+'%', top:topPct+'%', background:def.color}}></span>}
    </div>
  </div>;
}

/* ---- big interactive track with moving car ---- */
const TP_TRACK="M120,520 C90,360 150,250 300,210 C420,178 470,250 560,240 C690,226 700,120 820,150 C930,178 940,300 840,360 C720,430 640,330 520,400 C420,458 360,560 240,540 C170,528 150,560 120,520 Z";
function TPTrack({t, braking}){
  const pathRef=useRefTP(), carRef=useRefTP(), lenRef=useRefTP(0), svgRef=useRefTP();
  const [vp,setVp]=useStateTP({z:1,x:0,y:0});
  const vpr=useRefTP(vp); vpr.current=vp;
  const clampVp=(z,x,y)=>({z, x:Math.min(0,Math.max(-1000*(z-1),x)), y:Math.min(0,Math.max(-640*(z-1),y))});
  const carRot=useRefTP(0);
  useLayoutTP(()=>{
    const p=pathRef.current, car=carRef.current; if(!p||!car) return;
    if(!lenRef.current) lenRef.current=p.getTotalLength();
    const L=lenRef.current, pt=p.getPointAtLength((t%1)*L), pt2=p.getPointAtLength(((t+0.006)%1)*L);
    const ang=Math.atan2(pt2.y-pt.y,pt2.x-pt.x)*180/Math.PI;
    carRot.current=ang;
    car.setAttribute('transform',`translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)}) rotate(${(ang+90).toFixed(1)})`);
    car.style.filter=`drop-shadow(0 1px 1.5px rgba(0,0,0,.8)) drop-shadow(0 0 7px ${braking?'var(--red)':'var(--accent)'})`;
  },[t,braking]);
  // map clientXY -> viewBox coords
  const toVB=(cx,cy)=>{const svg=svgRef.current; const pt=svg.createSVGPoint(); pt.x=cx; pt.y=cy; return pt.matrixTransform(svg.getScreenCTM().inverse());};
  const zoomAt=(factor,vx,vy)=>setVp(s=>{const nz=Math.max(1,Math.min(5,s.z*factor)); const Lx=(vx-s.x)/s.z, Ly=(vy-s.y)/s.z; return clampVp(nz, vx-nz*Lx, vy-nz*Ly);});
  // non-passive wheel zoom
  useEffectTP(()=>{
    const svg=svgRef.current; if(!svg) return;
    const onWheel=(e)=>{e.preventDefault(); const p=toVB(e.clientX,e.clientY); zoomAt(e.deltaY<0?1.2:1/1.2, p.x, p.y);};
    svg.addEventListener('wheel',onWheel,{passive:false});
    return ()=>svg.removeEventListener('wheel',onWheel);
  },[]);
  const onDown=useCbTP((e)=>{
    if(e.button!==0) return;
    const svg=svgRef.current, rect=svg.getBoundingClientRect();
    const s=Math.min(rect.width/1000, rect.height/640);
    const sx=e.clientX, sy=e.clientY, start={...vpr.current};
    svg.classList.add('grabbing');
    const mv=(ev)=>setVp(clampVp(start.z, start.x+(ev.clientX-sx)/s, start.y+(ev.clientY-sy)/s));
    const up=()=>{svg.classList.remove('grabbing'); window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up);};
    window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up);
  },[]);
  const zoomed=vp.z>1.01;
  return <div className={"trackstage tp-track"+(zoomed?' zoomed':'')} style={{flex:1,minHeight:300,position:'relative',marginTop:12}}>
    <svg ref={svgRef} viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" onPointerDown={onDown}
      style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
      <defs><filter id="tpcarglow" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g transform={`translate(${vp.x} ${vp.y}) scale(${vp.z})`}>
        <path d={TP_TRACK} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="44" strokeLinecap="round"/>
        <path d={TP_TRACK} fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="1.4" strokeDasharray="2 9"/>
        <path ref={pathRef} d={TP_TRACK} fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" style={{filter:'drop-shadow(0 0 6px var(--accent-glow))'}}/>
        <path d="M820,150 C930,178 940,300 840,360 C720,430 640,330 520,400" fill="none" stroke="var(--red)" strokeWidth="3.5" strokeLinecap="round" style={{filter:'drop-shadow(0 0 6px var(--red))'}}/>
        <g ref={carRef} style={{color:'#F4F7F6'}}>
          <g className="pmark-wrap" transform="scale(0.11) translate(-300,-300)" dangerouslySetInnerHTML={{__html:window.PORSCHE_MARK||''}}/>
        </g>
      </g>
    </svg>
    <div className="tp-zoom">
      <button onClick={()=>zoomAt(1.4,500,320)} aria-label="Zoom in"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
      <button onClick={()=>zoomAt(1/1.4,500,320)} aria-label="Zoom out"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14"/></svg></button>
      <button className={"tp-zreset"+(zoomed?' show':'')} onClick={()=>setVp({z:1,x:0,y:0})} aria-label="Reset view"><Icon n="refresh" s={13}/></button>
    </div>
    <div className="callout" style={{left:24,bottom:54}}>
      <span className="pin" style={{background:braking?'var(--red)':'var(--accent)',boxShadow:`0 0 0 4px ${braking?'var(--red-soft)':'var(--accent-soft)'}`}}></span>
      <div className="txt"><b className={braking?'redt':'green'}>{braking?'BRAKING':'ON POWER'}</b><p>{braking?'2.1 m later than reference into T3.':'Full throttle — carrying speed onto the straight.'}</p></div>
    </div>
    <div className="tp-zoomhint">Scroll to zoom · drag to pan</div>
  </div>;
}

/* ---- scrubber (play / drag / time / delta) ---- */
function TPScrubber({t, playing, onToggle, onScrub, delta, speed, mode, setMode}){
  const trackRef=useRefTP();
  const startDrag=useCbTP((e)=>{
    const el=trackRef.current; const set=(cx)=>{const r=el.getBoundingClientRect(); onScrub(Math.max(0,Math.min(1,(cx-r.left)/r.width)));};
    set(e.clientX); const mv=(ev)=>set(ev.clientX); const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);};
    window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up);
  },[onScrub]);
  return <div className="tp-scrub card">
    <button className={"tp-play"+(playing?' on':'')} onClick={onToggle} aria-label={playing?'Pause':'Play'}>
      {playing? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>
              : <Icon n="play" s={14} fill="currentColor"/>}
    </button>
    <b className="num tp-clock">{tpTime(t*TP_LAP_YOU)}</b>
    <div className="tp-track-bar" ref={trackRef} onPointerDown={startDrag}>
      <div className="tp-fill" style={{width:(t*100)+'%'}}></div>
      {[0.18,0.42,0.7].map((m,i)=><span key={i} className="tp-tick" style={{left:(m*100)+'%'}}></span>)}
      <span className="tp-knob" style={{left:(t*100)+'%'}}></span>
    </div>
    <div className="tp-readout">
      <span className="dim">Δ</span> <b className={"num "+(delta>=0?'redt':'green')}>{(delta>=0?'+':'−')+Math.abs(delta).toFixed(3)}</b>
      <span className="dim" style={{marginLeft:12}}>SPD</span> <b className="num">{speed}<i style={{fontStyle:'normal',color:'var(--ink-3)',fontSize:10}}> km/h</i></b>
    </div>
    <SlideSeg accent options={['Time','Distance']} value={mode==='Distance'?'Distance':'Time'} onChange={setMode}/>
  </div>;
}

/* ---- live driver pod values ---- */
function tpPod(series, ghost, idx){
  const g=(k)=> (ghost?series[k].ghost:series[k].main)[idx];
  return {thr:Math.round(g('throttle')*100), brk:Math.round(g('brake')*100), kmh:Math.round(60+g('speed')*175),
    gear:Math.max(1,Math.round(g('gear')*6)), rpm:((3200+g('rpm')*4600)/1000).toFixed(1)+'k'};
}

window.TelemetryPro=function TelemetryPro({mode, setMode}){
  const [t,setT]=useStateTP(()=>{try{const v=parseFloat(localStorage.getItem('pw_tp_t')); return isFinite(v)?v:0.42;}catch(e){return 0.42;}});
  const [playing,setPlaying]=useStateTP(false);
  const [view,setView]=useStateTP('Segments');
  const [order,setOrder]=useStateTP(()=>TP_DEFS.map(d=>d.kind));
  const [hidden,setHidden]=useStateTP([]);
  const [zoom,setZoom]=useStateTP({lo:0,hi:1});
  const [dragging,setDragging]=useStateTP(null);
  const stackRef=useRefTP();
  const dragK=useRefTP(null);
  const raf=useRefTP();

  // build all series + static paths once
  const data=useMemoTP(()=>{
    const series={}; Object.keys(TP_SEEDS).forEach(k=>series[k]=tpSeries(k,TP_SEEDS[k],TP_N));
    const paths={}; TP_DEFS.forEach(d=>{const a=series[d.kind]; const line=d.kind==='gear'?tpStep(a.main,600,100):tpLine(a.main,600,100);
      paths[d.kind]={line, ghost:d.kind==='gear'?tpStep(a.ghost,600,100):tpLine(a.ghost,600,100), area:line+' L600,100 L0,100 Z'};});
    return {series,paths};
  },[]);
  const {series,paths}=data;
  const idx=Math.round((t%1)*TP_N);

  // playback loop
  useEffectTP(()=>{
    if(!playing) return;
    let last=performance.now();
    const loop=(now)=>{const dt=(now-last)/1000; last=now; setT(p=>{let n=p+dt/TP_PLAY_SECS; if(n>=1)n-=1; return n;}); raf.current=requestAnimationFrame(loop);};
    raf.current=requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(raf.current);
  },[playing]);
  // persist when settled
  useEffectTP(()=>{ if(playing) return; try{localStorage.setItem('pw_tp_t',String(t));}catch(e){} },[t,playing]);

  const scrub=useCbTP((v)=>{setPlaying(false); setT(v);},[]);
  const hoverScrub=useCbTP((v)=>{if(playing) return; setT(v);},[playing]);
  const defByKind=useMemoTP(()=>{const m={}; TP_DEFS.forEach(d=>m[d.kind]=d); return m;},[]);
  const visible=order.filter(k=>!hidden.includes(k));
  const hideChan=useCbTP((k)=>setHidden(h=>h.includes(k)?h:[...h,k]),[]);
  const showChan=useCbTP((k)=>setHidden(h=>h.filter(x=>x!==k)),[]);
  const onDragStart=useCbTP((e,k)=>{
    e.preventDefault(); dragK.current=k; setDragging(k);
    const move=(ev)=>{const stack=stackRef.current; if(!stack) return; let target=null;
      stack.querySelectorAll('.tp-chan').forEach(row=>{const r=row.getBoundingClientRect(); if(ev.clientY>=r.top&&ev.clientY<=r.bottom) target=row.dataset.kind;});
      if(target&&target!==dragK.current){setOrder(o=>{const a=o.filter(x=>x!==dragK.current); const ti=a.indexOf(target); a.splice(ti,0,dragK.current); return a;});}};
    const up=()=>{dragK.current=null; setDragging(null); window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up);};
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  },[]);
  useEffectTP(()=>{const el=stackRef.current; if(!el) return;
    const onWheel=(e)=>{e.preventDefault(); const r=el.getBoundingClientRect(); const f=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
      setZoom(z=>{const span=z.hi-z.lo; const center=z.lo+f*span; const ns=Math.max(0.08,Math.min(1,span*(e.deltaY<0?1/1.25:1.25)));
        let lo=center-ns*f, hi=lo+ns; if(lo<0){lo=0;hi=ns;} if(hi>1){hi=1;lo=1-ns;} return {lo,hi};});};
    el.addEventListener('wheel',onWheel,{passive:false}); return ()=>el.removeEventListener('wheel',onWheel);
  },[]);
  const braking=series.brake.main[idx]>0.18;
  const you=tpPod(series,false,idx), ref=tpPod(series,true,idx);
  const deltaVal=(series.delta.main[idx]-0.45)*0.9;

  return <div className="tp-wrap">
    {/* header: session + live driver pods */}
    <div className="row resp" style={{gap:14,alignItems:'stretch',flexWrap:'wrap'}}>
      <div className="card pad" style={{flex:'1 1 300px',display:'flex',alignItems:'center',gap:16}}>
        <span className="cbadge" style={{width:46,height:46}}><Icon n="car" s={22}/></span>
        <div className="grow">
          <div className="sesshead"><div><div className="ttl">Mazda MX5 Cup <span className="mini"><Icon n="ext" s={13}/></span></div>
            <div className="sub">Winton Motor Raceway — National</div></div></div>
          <div className="cond" style={{marginTop:8}}>
            <span><Icon n="clock" s={13} sw={2}/> <b className="num">15:10</b></span>
            <span><Icon n="temp" s={13} sw={2}/> <b className="num">19°C</b></span>
            <span><Icon n="road" s={13} sw={2}/> <b className="num">22°C</b></span>
            <span><Icon n="weather" s={13} sw={2}/> <b className="num">67%</b></span>
          </div>
        </div>
      </div>
      <DriverPod you name="L. Capuzzi" lap="4" time={tpTime(t*TP_LAP_YOU)} thr={you.thr} brk={you.brk} kmh={you.kmh} gear={you.gear} rpm={you.rpm}/>
      <DriverPod name="C. Webster" lap="1" time={tpTime(t*TP_LAP_REF)} thr={ref.thr} brk={ref.brk} kmh={ref.kmh} gear={ref.gear} rpm={ref.rpm} danger={ref.brk>5}/>
    </div>

    <div className="row tp-main" style={{gap:14,alignItems:'stretch',marginTop:14,flex:1,minHeight:0}}>
      <LeftRail/>
      {/* track column */}
      <div className="col" style={{flex:'1.02',gap:0}}>
        <div className="row between center">
          <SlideSeg accent options={['Segments','Sectors']} value={view} onChange={setView}/>
          <span className="muted" style={{fontSize:12}}><b className="num">L. Capuzzi 1:31.990</b> · vs <b className="num purple">C. Webster 1:30.149</b></span>
        </div>
        <TPTrack t={t} braking={braking}/>
        <div className="card pad tp-seg" style={{marginTop:12}}>
          <div className="segstep">
            <span className="arrow"><Icon n="chevL" s={15}/></span>
            <div className="row center gap8"><b>{view==='Sectors'?'Sector 3':'All'}</b><b className="num redt">+1.840</b></div>
            <span className="arrow"><Icon n="chevR" s={15}/></span>
          </div>
          <div className="tp-poslabel"><span className="dim">Lap position</span><b className="num">{Math.round((t%1)*100)}%</b></div>
        </div>
      </div>
      {/* channel stack */}
      <div className="card pad tp-channels" style={{flex:'0.98',display:'flex',flexDirection:'column'}}>
        <div className="row between center" style={{marginBottom:6}}>
          <div className="utabs" style={{border:0,gap:18}}><button className="on">Telemetry</button><button>Tyres <span className="pro"><Icon n="diamond" s={11} fill="var(--purple)"/></span></button></div>
          <div className="row center gap8" style={{color:'var(--ink-3)'}}>
            {(zoom.lo>0||zoom.hi<1) && <button className="chip" style={{padding:'3px 9px'}} onClick={()=>setZoom({lo:0,hi:1})}><Icon n="refresh" s={11}/> Reset zoom</button>}
            <span className="tp-leg"><span className="dot acc"></span>You</span>
            <span className="tp-leg"><span className="tp-dash"></span>Ref</span>
          </div>
        </div>
        <div className="tp-stack" ref={stackRef}>
          {visible.map((k,i)=><TPChannel key={k} def={defByKind[k]} paths={paths[k]} main={series[k].main} ghost={series[k].ghost} t={t} idx={idx} i={i} onScrub={hoverScrub} zoom={zoom} onHide={hideChan} onDragStart={onDragStart} dragging={dragging===k}/>)}
        </div>
        {hidden.length>0 && <div className="tp-hidden">{hidden.map(k=><button key={k} className="chip" onClick={()=>showChan(k)}>+ {defByKind[k].name}</button>)}</div>}
        <div className="tp-zoomnote">Scroll over the channels to zoom · drag <span className="tp-gripinline"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.7"/><circle cx="15" cy="5" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="19" r="1.7"/><circle cx="15" cy="19" r="1.7"/></svg></span> to reorder · × to hide</div>
      </div>
    </div>

    <div style={{marginTop:12}}>
      <TPScrubber t={t} playing={playing} onToggle={()=>setPlaying(p=>!p)} onScrub={scrub} delta={deltaVal} speed={you.kmh} mode={mode} setMode={setMode}/>
    </div>
  </div>;
};
