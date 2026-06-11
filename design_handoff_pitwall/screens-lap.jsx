/* screens-lap.jsx */
function SectorRow({s, a, b}){
  return <div className="sr"><span className="sk-lbl">{s}</span><span className="num">{a}</span><span className="num purple" style={{textAlign:'right'}}>{b}</span></div>;
}

function LapA({mode,setMode}){
  return <div>
    <div className="row" style={{gap:14,alignItems:'flex-start'}}>
      <LeftRail/>
      <div className="col" style={{flex:1.5}}>
        <div className="row gap8"><div className="seg accent"><button className="on">Segments</button><button>Sectors</button></div></div>
        <div className="trackstage" style={{height:336,position:'relative'}}>
          <TrackMap accent="var(--accent)" red="var(--red)" style={{position:'absolute',inset:0}}/>
          <div className="callout" style={{left:24,top:130}}>
            <span className="pin" style={{background:'var(--accent)',boxShadow:'0 0 0 4px var(--accent-soft)'}}></span>
            <div className="txt"><b className="green">T1 APEX</b><p>Carrying +3 km/h vs reference.</p></div>
          </div>
        </div>
        <div className="card pad">
          <div className="row between center" style={{marginBottom:8}}><span className="lbl">Sector comparison</span>
            <span className="muted" style={{fontSize:11}}>You · <span className="purple">Reference</span></span></div>
          <div className="sectbl"><SectorRow s="S1" a="20.380" b="19.987"/><SectorRow s="S2" a="22.137" b="21.528"/>
            <SectorRow s="S3" a="27.191" b="26.771"/><SectorRow s="S4" a="22.280" b="21.861"/></div>
        </div>
      </div>
      <div className="col" style={{flex:1}}>
        <div className="card" style={{padding:12}}><span className="lbl" style={{marginLeft:4}}>Segment picker</span>
          <MiniMap accent="var(--accent)" style={{height:200,marginTop:4}}/></div>
        <div className="card pad"><div className="row between center"><span className="lbl">Segment 5</span><b className="num redt" style={{fontSize:16}}>+0.116</b></div>
          <p className="muted" style={{fontSize:12.5,margin:'8px 0 0'}}>Lost time on entry — braking 8 m early forces a slower mid-corner minimum speed.</p>
          <div className="row gap8" style={{marginTop:12}}><span className="chip">Replay</span><span className="chip"><Icon n="telem" s={13}/> Telemetry</span></div></div>
        <Scrubber time="01:02.032" pct={48} delta="+1.232" dist="+42 m" mode={mode} setMode={setMode}/>
      </div>
    </div>
  </div>;
}

function LapB({mode,setMode}){
  const corners=[['T1','-0.08','gain',30],['T2','+0.12','loss',40],['T3','+0.21','loss',62],
    ['T4','-0.03','gain',14],['T5','+0.11','loss',36],['T6','-0.06','gain',24]];
  return <div>
    <div className="row resp" style={{alignItems:'stretch'}}>
      <div className="trackstage" style={{flex:1.3,height:344,position:'relative'}}>
        <TrackMap accent="var(--accent)" red="var(--red)" style={{position:'absolute',inset:0}}/>
        <div className="callout" style={{left:24,bottom:24}}><span className="pin"></span>
          <div className="txt"><b className="redt">T3 — biggest loss</b><p>Clique numa barra para focar a curva no mapa.</p></div></div>
      </div>
      <div className="card pad" style={{flex:1}}>
        <span className="lbl">Time gained / lost per corner</span>
        <div style={{marginTop:12}}>{corners.map(c=><div key={c[0]} className="cornerbar">
          <span className="cn">{c[0]}</span>
          <div className="crail"><div className={"cfill "+c[2]} style={{width:(c[3]/2)+'%'}}></div></div>
          <span className={"cv "+(c[2]==='loss'?'redt':'green')}>{c[1]}</span>
        </div>)}</div>
        <div className="row between center" style={{marginTop:10,paddingTop:12,borderTop:'1px solid var(--hair)'}}>
          <span className="muted" style={{fontSize:12}}>Total vs reference</span><b className="num redt" style={{fontSize:16}}>+0.27s</b></div>
      </div>
    </div>
    <div style={{marginTop:12}}><Scrubber time="01:02.032" pct={48} delta="+1.232" dist="+42 m" mode={mode} setMode={setMode}/></div>
  </div>;
}

window.LapScreen=function({variation,mode,setMode}){return variation==='b'?<LapB mode={mode} setMode={setMode}/>:<LapA mode={mode} setMode={setMode}/>;};
window.LapScreen.variations=[
  {id:'a',label:'A',name:'Tipo ref',desc:'Mapa grande da pista + <b>mini-mapa</b> com segmentos numerados, toggle Segments/Sectors e comparação de setores.'},
  {id:'b',label:'B',name:'Delta por curva',desc:'Mapa da pista + <b>tira de barras divergentes</b> de delta por curva — onde você ganha e perde tempo.'},
];
