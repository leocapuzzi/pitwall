/* lap-pro.jsx — premium interactive Lap Analysis.
   A shared cursor `t` drives the Porsche on the map; clicking a corner bar (or
   a map dot) focuses the map on that corner, moves the car there and shows the
   corner detail. Overrides window.LapScreen. */
const {useState:useStateLP, useRef:useRefLP, useEffect:useEffectLP, useMemo:useMemoLP, useCallback:useCbLP} = React;

const LP_CORNERS=[
  {id:'T1', s:'S1', f:0.07, d:-0.08, vmin:96,  why:'Strong entry — carrying +3 km/h through the apex and getting back to power early.'},
  {id:'T2', s:'S1', f:0.20, d:0.12,  vmin:78,  why:'Turning in a touch early, scrubbing speed mid-corner. Hold the brake 4 m deeper and roll the entry.'},
  {id:'T3', s:'S2', f:0.34, d:0.21,  vmin:64,  why:'Biggest loss of the lap. Braking 8 m early forces a slow minimum speed — trail the brake to the apex.'},
  {id:'T4', s:'S2', f:0.52, d:-0.03, vmin:88,  why:'Clean, neutral mid-corner. Marginal gain vs reference — keep the same line.'},
  {id:'T5', s:'S3', f:0.68, d:0.11,  vmin:71,  why:'Early throttle on exit lights up the rears. Wait for rotation before committing to full power.'},
  {id:'T6', s:'S4', f:0.86, d:-0.06, vmin:102, why:'Good commitment on the fast kink — slightly later apex than reference but carrying more speed onto the straight.'},
];
const LP_RED="M820,150 C930,178 940,300 840,360 C720,430 640,330 520,400"; // sector-3 overlay (lossy zone)
const LP_LAP=91.990;
function lpTime(sec){const m=Math.floor(sec/60), s=sec-m*60; return m+':'+s.toFixed(3).padStart(6,'0');}
const LP_TOTAL=LP_CORNERS.reduce((a,c)=>a+c.d,0);

function LapPro({mode,setMode}){
  const [t,setT]=useStateLP(()=>{try{const v=parseFloat(localStorage.getItem('pw_lp_t')); return isFinite(v)?v:0.34;}catch(e){return 0.34;}});
  const [playing,setPlaying]=useStateLP(false);
  const [view,setView]=useStateLP('Segments');
  const [active,setActive]=useStateLP('T3');
  const [focused,setFocused]=useStateLP(null);
  const raf=useRefLP();
  const speed=useMemoLP(()=>window.reSeries('speed',44,240),[]);
  const brake=useMemoLP(()=>window.reSeries('brake',33,240),[]);
  const idx=Math.round((t%1)*240);
  const braking=brake.main[idx]>0.18;

  useEffectLP(()=>{ if(!playing) return; let last=performance.now();
    const loop=(now)=>{const dt=(now-last)/1000; last=now; setT(p=>{let n=p+dt/14; if(n>=1)n-=1; return n;}); raf.current=requestAnimationFrame(loop);};
    raf.current=requestAnimationFrame(loop); return ()=>cancelAnimationFrame(raf.current);
  },[playing]);
  useEffectLP(()=>{ if(playing) return; try{localStorage.setItem('pw_lp_t',String(t));}catch(e){} },[t,playing]);

  const pick=useCbLP((id)=>{
    if(id==null){ setFocused(null); return; }
    setActive(id); setFocused(id);
    const c=LP_CORNERS.find(x=>x.id===id); if(c){setPlaying(false); setT(c.f);}
  },[]);
  const scrub=useCbLP((v)=>{setPlaying(false); setT(v);
    // snap active corner to nearest while scrubbing
    let best=LP_CORNERS[0],bd=9; LP_CORNERS.forEach(c=>{const dd=Math.abs(((c.f-v+1)%1)); const e=Math.min(dd,1-dd); if(e<bd){bd=e;best=c;}});
    if(bd<0.06) setActive(best.id);
  },[]);
  const cur=LP_CORNERS.find(c=>c.id===active)||LP_CORNERS[2];
  const maxAbs=Math.max(...LP_CORNERS.map(c=>Math.abs(c.d)));

  return <div className="tp-wrap">
    <div className="row between center">
      <window.SlideSeg accent options={['Segments','Sectors']} value={view} onChange={setView}/>
      <span className="muted" style={{fontSize:12.5}}>Lap <b className="num">1:31.990</b> · vs reference <b className="num purple">1:30.149</b> · <b className={"num "+(LP_TOTAL>=0?'redt':'green')}>{(LP_TOTAL>=0?'+':'−')+Math.abs(LP_TOTAL).toFixed(2)}s</b></span>
    </div>

    <div className="row tp-main" style={{gap:14,alignItems:'stretch',marginTop:12,flex:1,minHeight:0}}>
      {/* map */}
      <div className="card pad lp-mapcard" style={{flex:1.45,display:'flex',flexDirection:'column'}}>
        <div className="row between center" style={{marginBottom:2}}>
          <span className="lbl">Racing line — gains &amp; losses</span>
          <div className="row" style={{gap:14,fontSize:11.5,fontWeight:600}}>
            <span className="row center gap6"><span className="dot acc"></span>Faster</span>
            <span className="row center gap6"><span className="dot" style={{background:'var(--red)'}}></span>Slower zone</span>
          </div>
        </div>
        <window.InteractiveTrack t={t} braking={braking} focusCorner={focused} corners={window.RE_CORNERS}
          activeCorner={active} onPickCorner={pick} redPath={LP_RED} height={300}/>
      </div>

      {/* corner breakdown + detail */}
      <div className="col" style={{flex:1,gap:14,minWidth:0}}>
        <div className="card pad" style={{display:'flex',flexDirection:'column'}}>
          <div className="row between center" style={{marginBottom:6}}><span className="lbl">Time per corner</span>
            <span className="muted" style={{fontSize:11}}>click to focus map</span></div>
          <div className="lp-bars">
            {LP_CORNERS.map(c=>{const loss=c.d>0, w=Math.abs(c.d)/maxAbs*50;
              return <button key={c.id} className={"lp-bar"+(active===c.id?' on':'')} onClick={()=>pick(c.id)}>
                <span className="cn">{c.id}</span>
                <span className="lp-rail"><i className={loss?'loss':'gain'} style={loss?{left:'50%',width:w+'%'}:{right:'50%',width:w+'%'}}></i></span>
                <span className={"cv num "+(loss?'redt':'green')}>{(c.d>0?'+':'−')+Math.abs(c.d).toFixed(2)}</span>
              </button>;})}
          </div>
        </div>
        <div className="card pad lp-detail grow" key={active}>
          <div className="row between center">
            <div className="row center gap10"><span className="lp-cbadge">{cur.id}</span>
              <div><div className="lbl" style={{marginBottom:2}}>{cur.s} · corner detail</div>
                <b style={{fontFamily:'var(--font-display)',fontSize:18}}>{cur.d>0?'Losing time':'Gaining time'}</b></div></div>
            <div className="lp-cdelta"><div className={"num "+(cur.d>0?'redt':'green')} style={{fontSize:26,fontFamily:'var(--font-display)',fontWeight:800}}>{(cur.d>0?'+':'−')+Math.abs(cur.d).toFixed(2)}</div><span className="dim" style={{fontSize:11}}>vs ref</span></div>
          </div>
          <p className="muted" style={{fontSize:13,lineHeight:1.55,margin:'12px 0 0'}}>{cur.why}</p>
          <div className="lp-minis">
            <div><span className="lbl">Min speed</span><b className="num">{cur.vmin}<i> km/h</i></b></div>
            <div><span className="lbl">Sector</span><b className="num">{cur.s}</b></div>
            <div><span className="lbl">Status</span><b className={"num "+(cur.d>0?'redt':'green')}>{cur.d>0?'Focus':'Good'}</b></div>
          </div>
          <div className="row gap8" style={{marginTop:14}}>
            <span className="chip"><Icon n="play" s={12}/> Replay corner</span>
            <span className="chip"><Icon n="telem" s={13}/> Open telemetry</span>
          </div>
        </div>
      </div>
    </div>

    <div style={{marginTop:12}}>
      <window.REScrubber t={t} playing={playing} onToggle={()=>setPlaying(p=>!p)} onScrub={scrub}
        delta={cur.d} sub={{k:'SPD',v:Math.round(60+speed.main[idx]*175)+' km/h'}} mode={mode} setMode={setMode} lap={lpTime(t*LP_LAP)}/>
    </div>
  </div>;
}
window.LapScreen=function({mode,setMode}){return <LapPro mode={mode} setMode={setMode}/>;};
