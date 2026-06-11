/* screens-comparison.jsx */
const CMP_SECTORS=[
  {s:'S1', a:'21.173', b:'20.750', d:0.42},
  {s:'S2', a:'22.225', b:'22.320', d:-0.10},
  {s:'S3', a:'27.798', b:'26.490', d:1.31},
  {s:'S4', a:'23.044', b:'21.990', d:1.06},
];
function SectorBar({s, a, b, d, onClick, active}){
  const max=1.4, w=Math.min(50, Math.abs(d)/max*50), loss=d>0;
  const txt=(d>0?'+':d<0?'−':'')+Math.abs(d).toFixed(2);
  return <button className={"cmp-srow cmp-srowbtn"+(active?' on':'')} onClick={onClick}>
    <span className="cmp-s">{s}</span>
    <span className="num cmp-a">{a}</span>
    <div className="dbar"><div className="f" style={loss?{left:'50%',width:w+'%',background:'var(--red)'}:{right:'50%',width:w+'%',background:'var(--accent)'}}></div></div>
    <span className="num cmp-b purple">{b}</span>
    <span className={"num cmp-d "+(loss?'redt':(d<0?'green':'dim'))}>{txt}</span>
  </button>;
}
const CMP_CHANNELS=[
  {name:'Speed', kind:'speed', seed:44, color:'var(--cyan)', unit:' km/h', fmt:v=>Math.round(60+v*175)},
  {name:'Throttle', kind:'throttle', seed:22, color:'var(--accent)', unit:'%', fmt:v=>Math.round(v*100)},
  {name:'Brake', kind:'brake', seed:33, color:'var(--red)', unit:'%', fmt:v=>Math.round(v*100)},
];
function cmpChanLine(arr){const W=600,H=100;return arr.map((v,i)=>(i?'L':'M')+(i/(arr.length-1)*W).toFixed(1)+','+((1-v)*H).toFixed(1)).join(' ');}
function CmpChan({def, t}){
  const data=React.useMemo(()=>window.reSeries(def.kind,def.seed,160),[def.kind,def.seed]);
  const line=React.useMemo(()=>cmpChanLine(data.main),[data]);
  const gline=React.useMemo(()=>cmpChanLine(data.ghost),[data]);
  const area=line+' L600,100 L0,100 Z';
  const idx=Math.round((t%1)*(data.main.length-1));
  const leftPct=t*100, topPct=(1-data.main[idx])*100;
  return <div className="cmp-chrow">
    <div className="cmp-chlbl">
      <span className="lbl">{def.name}</span>
      <div className="cmp-chvals"><b className="num" style={{color:def.color}}>{def.fmt(data.main[idx])}<i>{def.unit}</i></b><b className="num purple">{def.fmt(data.ghost[idx])}<i>{def.unit}</i></b></div>
    </div>
    <div className="cmp-chplot">
      <svg viewBox="0 0 600 100" preserveAspectRatio="none" className="tp-svg">
        <defs><linearGradient id={'cg-'+def.kind} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={def.color} stopOpacity=".26"/><stop offset="1" stopColor={def.color} stopOpacity="0"/></linearGradient></defs>
        <path d={area} fill={'url(#cg-'+def.kind+')'}/>
        <path d={gline} className="tp-ghost"/>
        <path d={line} fill="none" stroke={def.color} className="tp-mainline"/>
      </svg>
      <span className="tp-cursor" style={{left:leftPct+'%'}}></span>
      <span className="tp-dot" style={{left:leftPct+'%', top:topPct+'%', background:def.color}}></span>
    </div>
  </div>;
}
function cmpTime(sec){const m=Math.floor(sec/60), s=sec-m*60; return m+':'+s.toFixed(3).padStart(6,'0');}
const CMP_RED="M820,150 C930,178 940,300 840,360 C720,430 640,330 520,400";
const SECTOR_CORNER={S1:'T2', S2:'T3', S3:'T5', S4:'T6'};
function ComparisonA(){
  const [t,setT]=React.useState(0.42);
  const [playing,setPlaying]=React.useState(false);
  const [focusSec,setFocusSec]=React.useState(null);
  const brake=React.useMemo(()=>window.reSeries('brake',33,240),[]);
  const speed=React.useMemo(()=>window.reSeries('speed',21,240),[]);
  const raf=React.useRef();
  const idx=Math.round((t%1)*240);
  const braking=brake.main[idx]>0.18;
  React.useEffect(()=>{ if(!playing) return; let last=performance.now();
    const loop=(now)=>{const dt=(now-last)/1000; last=now; setT(p=>{let n=p+dt/16; if(n>=1)n-=1; return n;}); raf.current=requestAnimationFrame(loop);};
    raf.current=requestAnimationFrame(loop); return ()=>cancelAnimationFrame(raf.current);
  },[playing]);
  const scrub=React.useCallback((v)=>{setPlaying(false); setT(v);},[]);
  const deltaNow=+(t*2.69).toFixed(3);
  return <div className="cmp-wrap">
    {/* lap selectors + total delta */}
    <div className="row gap10" style={{alignItems:'stretch'}}>
      <div className="card pad grow"><span className="lbl">Lap A — your best</span>
        <div className="stat" style={{marginTop:4}}><div className="v sm">1:34.241</div></div>
        <div className="row center gap8" style={{marginTop:6}}><span className="dot acc"></span><span className="muted" style={{fontSize:12}}>Winton · 06-06 15:10</span><span className="chip" style={{marginLeft:'auto',padding:'3px 9px'}}>change <Icon n="chevD" s={12}/></span></div></div>
      <div className="card pad" style={{flex:'none',width:158,textAlign:'center',display:'grid',placeItems:'center',background:'linear-gradient(150deg,var(--red-soft),var(--surface) 70%)',borderColor:'color-mix(in oklch,var(--red) 28%, transparent)'}}>
        <div><span className="lbl">Total Δ</span><div className="v redt" style={{fontFamily:'var(--font-display)',fontSize:30,marginTop:4}}>+2.69</div>
        <span className="dim" style={{fontSize:11}}>A slower</span></div></div>
      <div className="card pad grow"><span className="lbl">Lap B — reference lap</span>
        <div className="stat" style={{marginTop:4}}><div className="v sm purple">1:31.553</div></div>
        <div className="row center gap8" style={{marginTop:6}}><span className="dot pur"></span><span className="muted" style={{fontSize:12}}>Reference · Pro ghost</span><span className="chip" style={{marginLeft:'auto',padding:'3px 9px'}}>change <Icon n="chevD" s={12}/></span></div></div>
    </div>

    {/* main: big map (left) + delta trace & sectors (right) */}
    <div className="row resp cmp-main" style={{alignItems:'stretch',gap:14}}>
      <div className="card pad cmp-mapcard" style={{flex:1.55,display:'flex',flexDirection:'column'}}>
        <div className="row between center">
          <span className="lbl">Where the lap is won &amp; lost</span>
          <div className="row" style={{gap:14,fontSize:11.5,fontWeight:600}}>
            <span className="row center gap6"><span className="dot acc"></span>Lap A faster</span>
            <span className="row center gap6"><span className="dot" style={{background:'var(--red)'}}></span>Lap B faster</span>
          </div>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',marginTop:12,minHeight:0}}>
          <window.InteractiveTrack t={t} braking={braking} redPath={CMP_RED} height={332}
            corners={window.RE_CORNERS} focusCorner={focusSec?SECTOR_CORNER[focusSec]:null} activeCorner={focusSec?SECTOR_CORNER[focusSec]:null}>
            <div className="callout" style={{left:22,bottom:22}}><span className="pin" style={{background:braking?'var(--red)':'var(--accent)',boxShadow:`0 0 0 4px ${braking?'var(--red-soft)':'var(--accent-soft)'}`}}></span>
              <div className="txt"><b className="redt">S3 · +1.31s lost</b><p>Late on throttle out of the chicane</p></div></div>
            <div className="minimap-inset" style={{left:16,top:14,padding:'9px 13px'}}>
              <span className="lbl">Biggest gain</span>
              <div className="num green" style={{fontSize:15,fontWeight:700,marginTop:3}}>S2 · −0.10s</div>
            </div>
          </window.InteractiveTrack>
        </div>
        <div className="cmp-mapstats">
          <div><span className="lbl">Top speed A</span><b className="num">214<i> km/h</i></b></div>
          <div><span className="lbl">Top speed B</span><b className="num purple">221<i> km/h</i></b></div>
          <div><span className="lbl">Theoretical best</span><b className="num green">1:33.18</b></div>
        </div>
      </div>

      <div className="col" style={{flex:1,gap:14}}>
        <div className="card pad">
          <div className="row between center"><span className="lbl">Cumulative delta · A vs B</span>
            <b className="num redt" style={{fontSize:15}}>+2.69<i style={{fontStyle:'normal',color:'var(--ink-3)',fontWeight:500,fontSize:11}}> s</i></b></div>
          <div style={{height:118,marginTop:10}} dangerouslySetInnerHTML={{__html:window.channelSVG('delta',5,'var(--red)',t)}}></div>
          <div className="row between" style={{marginTop:2}}><span className="dim" style={{fontSize:11}}>Start / finish</span><span className="dim" style={{fontSize:11}}>S1 · S2 · S3 · S4</span></div>
        </div>
        <div className="card pad grow" style={{display:'flex',flexDirection:'column'}}>
          <div className="cmp-srow cmp-shead">
            <span className="cmp-s">Sec</span><span className="cmp-a lbl">Lap A</span>
            <span className="lbl" style={{textAlign:'center'}}>Gain ◂ ▸ Loss</span>
            <span className="cmp-b lbl" style={{textAlign:'right'}}>Lap B</span><span className="cmp-d lbl" style={{textAlign:'right'}}>Δ</span>
          </div>
          {CMP_SECTORS.map(r=><SectorBar key={r.s} {...r} active={focusSec===r.s} onClick={()=>setFocusSec(s=>s===r.s?null:r.s)}/>)}
        </div>
      </div>
    </div>

    {/* channel overlay — fills the lower half with A vs B telemetry */}
    <div className="card pad cmp-chan" style={{flex:'1 1 0',display:'flex',flexDirection:'column',minHeight:188}}>
      <div className="row between center">
        <span className="lbl">Channel overlay · A vs B over the lap</span>
        <div className="row" style={{gap:16,fontSize:11.5,fontWeight:600}}>
          <span className="row center gap6"><span className="dot acc"></span>Lap A</span>
          <span className="row center gap6"><span className="leg-dash"></span>Lap B (ref)</span>
        </div>
      </div>
      <div className="cmp-chan-grid">
        {CMP_CHANNELS.map(c=><CmpChan key={c.name} def={c} t={t}/>)}
      </div>
    </div>

    <div style={{marginTop:12}}><window.REScrubber t={t} playing={playing} onToggle={()=>setPlaying(p=>!p)} onScrub={scrub} delta={deltaNow} sub={{k:'SPD',v:Math.round(60+speed.main[idx]*175)+' km/h'}} lap={cmpTime(t*94.241)}/></div>
  </div>;
}

const CMP_ROWS=[
  ['1','1:40.646','+6.404',['25.283','23.737','28.416','23.208'],''],
  ['2','1:41.367','Invalid',['27.495','23.064','27.609','23.197'],'inv'],
  ['4','1:34.241','0.000',['21.173','22.225','27.798','23.044'],'best'],
  ['6','1:34.548','+0.306',['21.118','22.289','27.762','23.378'],'s1p'],
  ['7','1:34.574','+0.332',['21.149','22.495','27.834','23.093'],''],
];
function ComparisonB(){
  return <div>
    <div className="stepind" style={{marginBottom:16}}>
      <div className="si on"><span className="sn">1</span> Select first comparison</div>
      <div className="line"></div>
      <div className="si"><span className="sn">2</span> Select second comparison</div>
    </div>
    <div className="row between center" style={{marginBottom:12}}>
      <div className="sesshead"><span className="cbadge"><Icon n="car" s={20}/></span>
        <div><div className="ttl">Mazda MX5 Cup — Winton</div><div className="sub">2026-06-06 15:10</div></div></div>
      <div className="row gap8"><span className="chip"><Icon n="search" s={13}/> Search</span><span className="chip"><Icon n="filter" s={13}/> Filter</span><span className="chip solid"><Icon n="ext" s={13}/> Import lap</span></div>
    </div>
    <div className="utabs" style={{marginBottom:14}}><button className="on">Past sessions</button><button>Reference laps <span className="pro"><Icon n="diamond" s={11} fill="var(--purple)"/></span></button><button>Leaderboard</button><button>Imported <span className="pro"><Icon n="diamond" s={11} fill="var(--purple)"/></span></button></div>
    <div className="card pad">
      <table className="tbl"><thead><tr><th>Lap</th><th>Time</th><th>Delta</th><th>S1</th><th>S2</th><th>S3</th><th>S4</th><th></th></tr></thead>
      <tbody>{CMP_ROWS.map((r,i)=><tr key={i} className={r[4]==='best'?'best':''}>
        <td className="lead num">{r[0]}</td>
        <td className={"num "+(r[4]==='best'?'purple':'')}>{r[1]}</td>
        <td className={"num "+(r[2]==='Invalid'?'redt':(r[2]==='0.000'?'':'redt'))}>{r[2]}</td>
        {r[3].map((v,j)=><td key={j} className={"num "+(r[4]==='best'&&j===1?'purple':(r[4]==='s1p'&&j===0?'purple':''))}>{v}</td>)}
        <td style={{textAlign:'right'}}><span className="chip" style={{padding:'4px 12px'}}>Select</span></td>
      </tr>)}</tbody></table>
    </div>
  </div>;
}

window.ComparisonScreen=function({variation}){return variation==='b'?<ComparisonB/>:<ComparisonA/>;};
window.ComparisonScreen.variations=[
  {id:'a',label:'A',name:'Lado a lado',desc:'Duas voltas em <b>colunas paralelas</b> com coluna de delta central e o total no topo.'},
  {id:'b',label:'B',name:'Fluxo 2 passos',desc:'Próximo da ref: <b>selecionar volta 1 → volta 2</b> por fonte (sessões / referência / leaderboard / importadas).'},
];
