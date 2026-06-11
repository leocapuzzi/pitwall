/* screens-telemetry.jsx — also defines shared REHeader used by RE screens */

window.REHeader=function REHeader({mode}){
  return <div className="row resp" style={{gap:14,alignItems:'stretch',marginBottom:16,flexWrap:'wrap'}}>
    <div className="card pad" style={{flex:'1 1 320px',display:'flex',alignItems:'center',gap:16}}>
      <span className="cbadge" style={{width:46,height:46}}><Icon n="car" s={22}/></span>
      <div className="grow">
        <div className="sesshead">
          <div><div className="ttl">Mazda MX5 Cup <span className="mini"><Icon n="ext" s={13}/></span></div>
            <div className="sub">Winton Motor Raceway — National</div></div>
        </div>
        <div className="cond" style={{marginTop:8}}>
          <span><Icon n="clock" s={13} sw={2}/> <b className="num">15:10</b></span>
          <span><Icon n="temp" s={13} sw={2}/> <b className="num">19°C</b></span>
          <span><Icon n="road" s={13} sw={2}/> <b className="num">22°C</b></span>
          <span><Icon n="weather" s={13} sw={2}/> <b className="num">67%</b></span>
          <span className="chip" style={{padding:'3px 9px'}}>high usage</span>
        </div>
      </div>
    </div>
    <DriverPod you name="L. Capuzzi" lap="4" time="01:31.990" thr={100} brk={0} kmh="126" gear="3" rpm="5722"/>
    <DriverPod name="C. Webster" lap="1" time="01:30.149" thr={0} brk={37} kmh="130" gear="3" rpm="5854" danger/>
  </div>;
};

const CHANNELS=[
  {name:'Delta',kind:'delta',color:'var(--purple)',value:'+0.08',seed:11},
  {name:'Throttle',kind:'throttle',color:'var(--accent)',value:'73',unit:'%',seed:22},
  {name:'Brake',kind:'brake',color:'var(--red)',value:'78',unit:'%',seed:33},
  {name:'Speed',kind:'speed',color:'var(--cyan)',value:'145',unit:'km/h',seed:44},
  {name:'Steering',kind:'steering',color:'var(--ink-2)',value:'-2',unit:'°',seed:55},
  {name:'Gear',kind:'gear',color:'var(--cyan)',value:'2',seed:66},
  {name:'RPM',kind:'rpm',color:'var(--amber)',value:'6.6k',seed:77},
];

function TelemetryA({mode,setMode}){
  return <div>
    <REHeader/>
    <div className="row" style={{gap:14,alignItems:'flex-start'}}>
      <LeftRail/>
      {/* big track + callout */}
      <div className="col" style={{flex:'1.02'}}>
        <div className="row between center"><div className="seg accent"><button className="on">Segments</button><button>Sectors</button></div>
          <span className="muted" style={{fontSize:12}}><b className="num">L. Capuzzi 1:31.990</b> · vs <b className="num purple">C. Webster 1:30.149</b></span></div>
        <div className="trackstage" style={{height:392,position:'relative',marginTop:12}}>
          <TrackMap accent="var(--accent)" red="var(--red)" style={{position:'absolute',inset:0,opacity:.95}}/>
          <div className="callout" style={{left:24,bottom:60}}>
            <span className="pin"></span>
            <div className="txt"><b className="redt">BRAKING</b><p>Braked 2.1 m later than reference into T3.</p></div>
          </div>
          <div className="minimap-inset" style={{top:14,right:14,width:170}}>
            <span className="lbl">Track</span>
            <MiniMap accent="var(--accent)" style={{height:84,marginTop:4}}/>
            <div className="zoomctl" style={{marginTop:8}}><span className="zbtn">−</span><div className="zbar"><i></i></div><span className="zbtn">+</span></div>
          </div>
        </div>
        <div className="card pad" style={{marginTop:12}}>
          <div className="segstep">
            <span className="arrow"><Icon n="chevL" s={15}/></span>
            <div className="row center gap8"><b>All</b><b className="num redt">+1.840</b></div>
            <span className="arrow"><Icon n="chevR" s={15}/></span>
          </div>
          <div className="row between" style={{marginTop:10}}><span className="muted" style={{fontSize:12}}>L. Capuzzi</span><b className="num">1:31.990</b></div>
          <div className="row between"><span className="purple" style={{fontSize:12}}>C. Webster</span><b className="num purple">1:30.149</b></div>
        </div>
      </div>
      {/* channel stack */}
      <div className="card pad" style={{flex:'0.98'}}>
        <div className="row between center" style={{marginBottom:10}}>
          <div className="utabs" style={{border:0,gap:18}}><button className="on">Telemetry</button><button>Tyres <span className="pro"><Icon n="diamond" s={11} fill="var(--purple)"/></span></button></div>
          <div className="row gap8" style={{color:'var(--ink-3)'}}><Icon n="refresh" s={15}/><Icon n="gear" s={15}/></div>
        </div>
        <div className="chstack">
          {CHANNELS.map(c=><Channel key={c.name} {...c} height={70}/>)}
        </div>
      </div>
    </div>
    <div style={{marginTop:12}}><Scrubber time="00:09.865" pct={62} delta="+00.166" dist="+6 m" mode={mode} setMode={setMode}/></div>
  </div>;
}

function TelemetryB({mode,setMode}){
  const big=[
    {name:'Delta',kind:'delta',color:'var(--purple)',value:'+0.08',seed:11},
    {name:'Speed',kind:'speed',color:'var(--cyan)',value:'145',unit:'km/h',seed:44},
    {name:'Throttle',kind:'throttle',color:'var(--accent)',value:'73',unit:'%',seed:22},
    {name:'Brake',kind:'brake',color:'var(--red)',value:'78',unit:'%',seed:33},
  ];
  return <div>
    <REHeader/>
    <div className="row between center" style={{marginBottom:12}}>
      <div className="row gap8">
        <span className="chip on"><span className="dot acc"></span> L. Capuzzi</span>
        <span className="chip"><span className="dot pur"></span> C. Webster</span>
        <span className="chip">+ add lap</span>
      </div>
      <div className="seg accent"><button className={mode==='Time'?'on':''} onClick={()=>setMode('Time')}>Time</button><button className={mode!=='Time'?'on':''} onClick={()=>setMode('Distance')}>Distance</button></div>
    </div>
    <div className="col gap10">
      {big.map(c=><Channel key={c.name} {...c} height={92}/>)}
    </div>
    <div className="row" style={{marginTop:12,gap:14,alignItems:'stretch'}}>
      <div className="trackstage" style={{flex:1,height:96,display:'grid',placeItems:'center'}}><MiniMap accent="var(--accent)" style={{height:80}}/></div>
      <div className="grow" style={{flex:3}}><Scrubber time="00:09.865" pct={62} delta="+00.166" dist="+6 m" mode={mode} setMode={setMode}/></div>
    </div>
  </div>;
}

window.TelemetryScreen=function({variation,mode,setMode}){
  const Pro=window.TelemetryPro;
  if(variation!=='b' && Pro) return <Pro mode={mode} setMode={setMode}/>;
  return variation==='b'?<TelemetryB mode={mode} setMode={setMode}/>:<TelemetryA mode={mode} setMode={setMode}/>;
};
window.TelemetryScreen.variations=[
  {id:'a',label:'A',name:'Mapa + canais',desc:'Mapa da volta com <b>callout do Engineer</b> ancorado na pista, mini-mapa + zoom, e stack de 7 canais sincronizados.'},
  {id:'b',label:'B',name:'Canais full-width',desc:'Canais ocupam a <b>largura toda</b> para comparar 2+ voltas sobrepostas, com mini-mapa em inset.'},
];
