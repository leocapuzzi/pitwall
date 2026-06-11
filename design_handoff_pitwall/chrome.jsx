/* chrome.jsx — shared app chrome for PitWall hi-fi */
const {useState:useStateC}=React;

/* ---- icon set ---- */
const ICONS={
  gear:'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 13a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.4-1.8l-.1-.1A2 2 0 117.4 4.3l.1.1a1.6 1.6 0 001.8.3H9.4a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9.4a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  bell:'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 01-3.4 0',
  info:'M12 22a10 10 0 100-20 10 10 0 000 20z M12 16v-4 M12 8h.01',
  flag:'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  telem:'M3 12h3l2-7 4 14 3-9 2 2h4',
  clock:'M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2',
  search:'M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.3-4.3',
  filter:'M22 3H2l8 9.5V19l4 2v-8.5z',
  play:'M5 3l14 9-14 9z',
  back:'M19 12H5 M12 19l-7-7 7-7',
  chevL:'M15 18l-6-6 6-6', chevR:'M9 18l6-6-6-6', chevD:'M6 9l6 6 6-6',
  fuel:'M3 22V4a2 2 0 012-2h6a2 2 0 012 2v18 M3 13h10 M13 8h3a2 2 0 012 2v6a2 2 0 003 1.7 M19 7l-2-2',
  temp:'M14 14.8V4a2 2 0 10-4 0v10.8a4 4 0 104 0z',
  weather:'M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M6.3 17.7l-1.4 1.4 M19.1 4.9l-1.4 1.4 M12 17a5 5 0 100-10 5 5 0 000 10z',
  road:'M4 19l4-14 M20 19l-4-14 M12 6v2 M12 12v2 M12 18v2',
  diamond:'M6 3h12l4 6-10 12L2 9z',
  spark:'M12 3l1.9 5.8L20 9l-5.5 4 2.1 6L12 15.5 7.4 19l2.1-6L4 9l6.1-.2z',
  send:'M22 2L11 13 M22 2l-7 20-4-9-9-4z',
  refresh:'M21 2v6h-6 M3 12a9 9 0 0115-6.7L21 8 M3 22v-6h6 M21 12a9 9 0 01-15 6.7L3 16',
  wrench:'M14.7 6.3a4 4 0 01-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 015.4-5.4z',
  ext:'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6 M15 3h6v6 M10 14L21 3',
  pin:'M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z M12 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  car:'M5 17a2 2 0 104 0 M15 17a2 2 0 104 0 M3 17h-1v-5l2-5h12l3 5v5h-1 M5 12h14 M9 17h6',
  wheel:'M12 21a9 9 0 100-18 9 9 0 000 18z M12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M12 9.5V3.2 M9.8 13.6l-5.4 3.1 M14.2 13.6l5.4 3.1',
  oval:'M12 6c5 0 9 2.7 9 6s-4 6-9 6-9-2.7-9-6 4-6 9-6z',
  trophy:'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 01-10 0z M7 6H4v2a3 3 0 003 3 M17 6h3v2a3 3 0 01-3 3',
  sliders:'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
};
function Icon({n, s=17, sw=1.9, fill}){return <svg width={s} height={s} viewBox="0 0 24 24" fill={fill||"none"}
  stroke={fill?"none":"currentColor"} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[n]}/></svg>;}
window.Icon=Icon;

/* ---- top navigation ---- */
const NAV=[{id:'dashboard',label:'Dashboard'},{id:'engineer',label:'Race Engineer'}];
function topGroup(view){return view==='dashboard'?'dashboard':'engineer';}

function TopNav({view, go}){
  const grp=topGroup(view);
  return <header className="topnav">
    <div className="brand">
      <img className="brandmark" src="assets/ligma-logo.png" alt="LIGMA Racing"/>
      <div className="bn">LIGMA<small>RACING · PITWALL</small></div>
    </div>
    <nav className="mainnav">
      {NAV.map(n=><button key={n.id} className={grp===n.id?'on':''}
        onClick={()=>{ if(n.id==='dashboard')go('dashboard'); else if(n.id==='engineer')go('telemetry'); }}>
        {n.label}{n.pro&&<span style={{marginLeft:6,color:'var(--purple)',display:'inline-flex',verticalAlign:'-2px'}}><Icon n="diamond" s={12} fill="var(--purple)"/></span>}
      </button>)}
    </nav>
    <div className="navr">
      <button className="iconbtn"><Icon n="gear"/></button>
      <button className="iconbtn"><Icon n="bell"/><span className="badge"></span></button>
      <button className="iconbtn"><Icon n="info"/></button>
      <div className="userchip">
        <img className="ava" src="assets/ligma-driver-face.png" alt="L. Capuzzi"/>
        <div className="un">L. Capuzzi<small>Driver</small></div>
        <span style={{color:'var(--ink-3)'}}><Icon n="chevD" s={14}/></span>
      </div>
    </div>
  </header>;
}

/* ---- workspace tabs (Race Engineer sub-views) ---- */
const WS=[{id:'stint',label:'Stint'},{id:'telemetry',label:'Telemetry'},{id:'lap',label:'Lap Analysis'},
  {id:'comparison',label:'Comparison'},{id:'ai',label:'AI Engineer'}];
function SessionStrip({view, go}){
  return <div className="tabstrip">
    <div className="stab idle"><span>Waiting for session</span></div>
    <div className="stab on"><span className="dot acc"></span>Mazda MX5 · Winton<span className="x"><Icon n="info" s={12} sw={2.2}/></span></div>
    <div className="add"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></div>
    <div className="ws-switch">
      {WS.map(w=><button key={w.id} className={view===w.id?'on':''} onClick={()=>go(w.id)}>{w.label}</button>)}
    </div>
  </div>;
}

/* ---- live driver pod (telemetry/lap header) ---- */
function DriverPod({name, you, stint='Stint 1', lap, time, thr=100, brk=0, kmh, gear, rpm, danger, accent}){
  return <div className={"dpod"+(you?" you":"")}>
    <CarDial pct={brk>5?brk:thr} color={you?undefined:'var(--ink-2)'} danger={danger}/>
    <div className="grow">
      <div className="dpod-top">
        <b style={you?{color:'var(--accent)'}:null}>{name}</b>
        <div className="dpod-meta">
          <span><Icon n="weather" s={12} sw={2}/> {stint}</span><span>Lap {lap}</span>
          <span className="num"><Icon n="clock" s={12} sw={2}/> {time}</span>
        </div>
      </div>
      <div className="dpod-bars">
        <span className="num thr">{thr}%</span>
        <div className="tbbar"><i className="t" style={{width:thr+'%'}}></i></div>
        <div className="tbbar"><i className="b" style={{width:brk+'%'}}></i></div>
        <span className="num spd">{kmh}<i> km/h</i></span>
        <span className="num gr">|H| {gear}</span>
        <span className="num rp">RPM {rpm}</span>
      </div>
    </div>
  </div>;
}

/* ---- conditions row (track + weather) ---- */
function Conditions({items}){
  return <div className="cond">{items.map((it,i)=><span key={i}><Icon n={it.i} s={13} sw={2}/> {it.v}</span>)}</div>;
}

/* ---- playback scrubber ---- */
function Scrubber({time='00:09.865', pct=62, delta='+00.166', dist='+6 m', mode='Time', setMode}){
  return <div className="scrubber card">
    <button className="play"><Icon n="play" s={14} fill="currentColor"/></button>
    <b className="num clk">{time}</b>
    <div className="track"><div className="done" style={{width:pct+'%'}}><span className="knob"></span></div></div>
    <div className="scr-delta"><span className="dim">Delta</span> <b className="num redt">{delta}</b>
      <span className="dim" style={{marginLeft:10}}>↔</span> <b className="num">{dist}</b></div>
    <div className="seg accent">
      <button className={mode==='Time'?'on':''} onClick={()=>setMode&&setMode('Time')}>Time</button>
      <button className={mode==='Distance'?'on':''} onClick={()=>setMode&&setMode('Distance')}>Distance</button>
    </div>
  </div>;
}

/* ---- left rail (flag / setup / fuel quick tools) ---- */
function LeftRail(){
  return <div className="leftrail">
    <button className="on"><Icon n="flag"/></button>
    <button><Icon n="sliders" s={16}/><span className="prodot"></span></button>
    <button><Icon n="fuel"/></button>
  </div>;
}

function StatusBar(){
  return <footer className="statusbar"><Icon n="telem" s={15} sw={2}/> Race Engineer
    <span className="live"><i></i> Waiting for session…</span></footer>;
}

Object.assign(window,{TopNav,SessionStrip,DriverPod,Conditions,Scrubber,LeftRail,StatusBar});
