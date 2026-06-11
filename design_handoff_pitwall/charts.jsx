/* charts.jsx — seeded SVG generators + chart components for PitWall hi-fi
   Exports to window: gen (raw svg strings) + <Channel>, <TrackMap>, <MiniMap>, <Spark>, <Prog>, <Donut>, <CarDial> */

function lcg(s){let x=s||7; return ()=>{x=(x*1103515245+12345)&0x7fffffff; return x/0x7fffffff;};}

/* ---- telemetry channel: returns {main:[pts], ghost:[pts]} normalized 0..1 (1=top) ---- */
function chanSeries(kind, seed){
  const n=120, r=lcg(seed||13), main=[], ghost=[];
  let v=0.5, g=0.5;
  for(let i=0;i<=n;i++){
    const t=i/n;
    if(kind==='throttle'){
      const base = (Math.sin(t*34)>0.1 ? 0.92 : 0.05);
      v = base + (r()-0.5)*0.08; g = base + (r()-0.5)*0.12 - 0.04;
    } else if(kind==='brake'){
      const sp = Math.max(0, Math.sin(t*30+1)); const on = sp>0.6;
      v = on ? 0.55+sp*0.4 + (r()-0.5)*0.05 : 0.02+r()*0.03;
      g = on ? 0.5+sp*0.38 : 0.02+r()*0.03;
    } else if(kind==='speed'){
      v = 0.45+0.42*Math.sin(t*9-0.6)+(r()-0.5)*0.05; g=v-0.05-r()*0.04;
    } else if(kind==='steering'){
      v = 0.5+0.4*Math.sin(t*7)+(r()-0.5)*0.04; g=0.5+0.4*Math.sin(t*7-0.15);
    } else if(kind==='gear'){
      v = Math.round(0.2+ (0.5+0.45*Math.sin(t*6))*5)/6 ; g=v;
    } else if(kind==='rpm'){
      const ph=(t*6)%1; v=0.35+ph*0.6+(r()-0.3)*0.05; if(v>0.96)v=0.4; g=v-0.04;
    } else { /* delta — monotonic-ish rising */
      v = Math.min(0.95, 0.1 + t*0.85 + Math.sin(t*5)*0.03); g=v;
    }
    v=Math.max(0.02,Math.min(0.98,v)); g=Math.max(0.02,Math.min(0.98,g));
    main.push(v); ghost.push(g);
  }
  return {main,ghost};
}

function pathFrom(arr,W,H,step){
  return arr.map((v,i)=>{
    const x=(i/(arr.length-1))*W, y=H-v*H;
    return (i?'L':'M')+x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
}
function stepPath(arr,W,H){
  let d=''; arr.forEach((v,i)=>{const x0=(i/(arr.length-1))*W, y=H-v*(H-4)-2;
    d+= i? `L${x0.toFixed(1)},${y.toFixed(1)}`:`M${x0.toFixed(1)},${y.toFixed(1)}`;
    if(i<arr.length-1){const x1=((i+1)/(arr.length-1))*W; d+=` L${x1.toFixed(1)},${y.toFixed(1)}`;}
  }); return d;
}

window.channelSVG = function(kind, seed, color, cursor=0.62){
  const W=600,H=100; const {main,ghost}=chanSeries(kind,seed);
  const isStep = kind==='gear';
  const line = isStep? stepPath(main,W,H) : pathFrom(main,W,H);
  const gline = isStep? stepPath(ghost,W,H) : pathFrom(ghost,W,H);
  const area = line+` L${W},${H} L0,${H} Z`;
  const cx=cursor*W;
  const gid='g'+kind+seed;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chsvg">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".42"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${isStep?'':`<path d="${area}" fill="url(#${gid})"/>`}
    <path d="${gline}" fill="none" stroke="rgba(255,255,255,.34)" stroke-width="1.4" stroke-dasharray="2 4" stroke-linejoin="round"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ${color}99)"/>
    <line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="rgba(255,255,255,.5)" stroke-width="1"/>
  </svg>`;
};

/* ---- big track map with racing line gain/loss + car ---- */
window.trackMapSVG = function(opt={}){
  const acc=opt.accent||'#1FDE7E', red=opt.red||'#FF5C4D';
  // a flowing Winton-ish circuit path
  const d="M120,520 C90,360 150,250 300,210 C420,178 470,250 560,240 C690,226 700,120 820,150 C930,178 940,300 840,360 C720,430 640,330 520,400 C420,458 360,560 240,540 C170,528 150,560 120,520 Z";
  // car position fraction marker drawn via a translate on a sub group (static demo)
  return `<svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">
    <defs>
      <filter id="trkglow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d="${d}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="46" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.5" stroke-dasharray="2 9" stroke-linecap="round"/>
    <path d="M120,520 C90,360 150,250 300,210 C420,178 470,250 560,240 C690,226 700,120 820,150"
      fill="none" stroke="${acc}" stroke-width="4" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ${acc})"/>
    <path d="M820,150 C930,178 940,300 840,360 C720,430 640,330 520,400"
      fill="none" stroke="${red}" stroke-width="4" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ${red})"/>
    <path d="M520,400 C420,458 360,560 240,540 C170,528 150,560 120,520"
      fill="none" stroke="${acc}" stroke-width="4" stroke-linecap="round"/>
    <g transform="translate(560,240) rotate(8)" filter="url(#trkglow)">
      <rect x="-9" y="-15" width="18" height="30" rx="5" fill="none" stroke="${acc}" stroke-width="2.4"/>
      <line x1="-9" y1="-3" x2="9" y2="-3" stroke="${acc}" stroke-width="1.6"/>
      <line x1="-9" y1="6" x2="9" y2="6" stroke="${acc}" stroke-width="1.6"/>
    </g>
  </svg>`;
};

/* ---- mini map with numbered segment markers ---- */
window.miniMapSVG = function(opt={}){
  const acc=opt.accent||'#1FDE7E';
  const d="M70,260 C55,170 95,120 165,108 C220,98 245,135 290,128 C350,118 352,62 415,76 C470,88 472,160 418,188 C355,220 320,168 258,202 C205,232 175,285 120,272 C95,266 82,288 70,260 Z";
  const segs=[[165,108,'2'],[415,76,'1'],[418,188,'3'],[300,160,'5'],[258,202,'4'],[120,272,'6']];
  return `<svg viewBox="0 0 500 340" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">
    <path d="${d}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="3"/>
    <path d="M290,128 C350,118 352,62 415,76 C470,88 472,160 418,188" fill="none" stroke="${acc}" stroke-width="3.4" style="filter:drop-shadow(0 0 5px ${acc})"/>
    ${segs.map(s=>`<g transform="translate(${s[0]},${s[1]})"><circle r="13" fill="#0b0d10" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/><text y="4" text-anchor="middle" font-family="JetBrains Mono" font-size="12" font-weight="700" fill="#fff">${s[2]}</text></g>`).join('')}
  </svg>`;
};

/* ---- sparkline (laptime trend, dotted markers) ---- */
window.sparkSVG = function(seed, color){
  const W=600,H=130,r=lcg(seed||3),n=8,pts=[];
  for(let i=0;i<n;i++){let y=i===0?0.92:(0.35+r()*0.4); if(i===3)y=0.12; pts.push(y);}
  const line=pts.map((v,i)=>(i?'L':'M')+(8+i/(n-1)*(W-16)).toFixed(0)+','+(H-v*(H-18)-6).toFixed(0)).join(' ');
  const area=line+` L${W-8},${H} L8,${H} Z`;
  const gid='spk'+seed;
  const dots=pts.map((v,i)=>`<circle cx="${(8+i/(n-1)*(W-16)).toFixed(0)}" cy="${(H-v*(H-18)-6).toFixed(0)}" r="4" fill="${color}" stroke="#0b0d10" stroke-width="2.5"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>${dots}</svg>`;
};

/* ---- progression line (improving) ---- */
window.progSVG = function(seed, color){
  const W=600,H=200,r=lcg(seed||5),n=16,pts=[];let v=0.18;
  for(let i=0;i<n;i++){v=Math.min(0.92,v+(0.02+r()*0.08)); pts.push(v);}
  const line=pts.map((y,i)=>(i?'L':'M')+(10+i/(n-1)*(W-20)).toFixed(0)+','+(H-y*(H-16)-8).toFixed(0)).join(' ');
  const area=line+` L${W-10},${H} L10,${H} Z`; const gid='prg'+seed;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".34"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
};

/* ============ React components ============ */
const {useState}=React;

function Channel({name, kind, seed, color, value, unit, ghost, height=92}){
  return (
    <div className="channel">
      <div className="ch-head"><span className="lbl">{name}</span>
        <span className="ch-val num" style={{color}}>{value}{unit&&<i>{unit}</i>}</span></div>
      <div className="ch-plot" style={{height}} dangerouslySetInnerHTML={{__html:window.channelSVG(kind,seed,color)}}/>
    </div>
  );
}
function TrackMap({accent,red,style}){return <div className="gfx" style={style} dangerouslySetInnerHTML={{__html:window.trackMapSVG({accent,red})}}/>;}
function MiniMap({accent,style}){return <div className="gfx" style={style} dangerouslySetInnerHTML={{__html:window.miniMapSVG({accent})}}/>;}
function Spark({seed,color,style}){return <div className="gfx" style={style} dangerouslySetInnerHTML={{__html:window.sparkSVG(seed,color)}}/>;}
function Prog({seed,color,style}){return <div className="gfx" style={style} dangerouslySetInnerHTML={{__html:window.progSVG(seed,color)}}/>;}

function Donut({pct=100, label, sub, glow, size=118}){
  const c=size/2, R=size*0.441, sw=size*0.11, C=2*Math.PI*R, off=C*(1-pct/100);
  return <div className="ring-wrap" style={{position:'relative',width:size,height:size}}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={glow?{filter:'drop-shadow(0 0 18px var(--accent-glow))'}:null}>
      <circle cx={c} cy={c} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={sw}/>
      <circle cx={c} cy={c} r={R} fill="none" stroke="var(--accent)" strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off} transform={`rotate(-90 ${c} ${c})`}/>
    </svg>
    <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',textAlign:'center'}}>
      <div><b style={{fontFamily:'var(--font-display)',fontWeight:800,fontSize:size*0.205,letterSpacing:'-.02em'}}>{label}</b>
        {sub&&<small style={{display:'block',fontSize:size*0.086,color:'var(--ink-3)',fontWeight:600,letterSpacing:'.04em'}}>{sub}</small>}</div>
    </div>
  </div>;
}

/* small RPM/throttle car dial used in driver pods */
function CarDial({pct=0, color, danger}){
  const c=danger?'var(--red)':(color||'var(--accent)');
  const R=15.5, C=2*Math.PI*R, off=C*(1-pct/100);
  return <svg width="40" height="40" viewBox="0 0 40 40" style={{flex:'none'}}>
    <circle cx="20" cy="20" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="3.4"/>
    <circle cx="20" cy="20" r={R} fill="none" stroke={c} strokeWidth="3.4" strokeLinecap="round"
      strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 20 20)" style={{filter:`drop-shadow(0 0 4px ${c})`}}/>
    <g stroke={c} strokeWidth="1.8" fill="none" transform="translate(20,20)">
      <rect x="-6" y="-5" width="12" height="10" rx="2.5"/><line x1="-6" y1="0" x2="6" y2="0"/></g>
  </svg>;
}

Object.assign(window, {Channel, TrackMap, MiniMap, Spark, Prog, Donut, CarDial});
