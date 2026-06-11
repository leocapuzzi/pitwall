/* screens-stint.jsx */
const STINT_LAPS=[
  ['1','1:39.610','+7.620','0',['26.286','22.579','28.107','22.637'],''],
  ['2','1:32.901','+0.911','0.66',['20.529','22.421','27.468','22.482'],''],
  ['3','1:32.454','+0.464','0.68',['20.612','21.903','27.452','22.487'],'s2p'],
  ['4','1:31.990','0.000','0.67',['20.380','22.137','27.191','22.280'],'best'],
  ['5','1:32.572','+0.582','0.68',['20.643','22.118','27.205','22.606'],''],
];
function SectorCells({s, flags}){
  return <>{s.map((v,i)=>{
    let cls='num';
    if(flags==='best'&&(i===0||i===2)) cls='num green';
    if(flags==='best'&&i===3) cls='num purple';
    if(flags==='s2p'&&i===1) cls='num purple';
    return <td key={i} className={cls}>{v}</td>;
  })}</>;
}

function StintA({mode,setMode}){
  return <div>
    <REHeader/>
    <div className="row between center" style={{marginBottom:12}}>
      <div className="h2">Stint 1</div>
      <div className="row gap8"><span className="chip"><span className="dot acc"></span> Race</span><span className="chip">8 laps</span><span className="chip"><Icon n="fuel" s={13}/> 4.7L · 0.67L/lap</span></div>
    </div>
    <div className="grid3" style={{marginBottom:14}}>
      <div className="card pad stat"><span className="lbl">Fastest lap</span><div className="v green">1:31.990</div></div>
      <div className="card pad stat"><span className="lbl">Optimal lap</span><div className="v purple">1:31.830</div><span className="muted" style={{fontSize:12}}>−0.16 vs best</span></div>
      <div className="card pad stat" style={{background:'linear-gradient(120deg,var(--accent-soft),var(--surface) 60%)',borderColor:'var(--accent-line)'}}><span className="lbl">Avg fuel usage</span><div className="v">0.67<span style={{fontSize:18}}> L</span></div><span className="muted" style={{fontSize:12}}>margin +2 laps</span></div>
    </div>
    <div className="card pad" style={{marginBottom:14}}>
      <div className="row between center"><span className="lbl">Average laptime</span><span className="muted num" style={{fontSize:12}}>σ 0.41s</span></div>
      <Spark seed={4} color="var(--accent)" style={{height:120,marginTop:6}}/>
    </div>
    <div className="card pad">
      <table className="tbl"><thead><tr><th>Lap</th><th>Time</th><th>Delta</th><th>Fuel</th><th>S1</th><th>S2</th><th>S3</th><th>S4</th></tr></thead>
      <tbody>{STINT_LAPS.map((r,i)=><tr key={i} className={r[5]==='best'?'best':''}>
        <td className="lead num">{r[0]}</td>
        <td className={"num "+(r[5]==='best'?'green':'')}>{r[1]}</td>
        <td className={"num "+(r[2]==='0.000'?'':'redt')}>{r[2]}</td>
        <td>{r[3]}</td>
        <SectorCells s={r[4]} flags={r[5]}/>
      </tr>)}</tbody></table>
    </div>
  </div>;
}

function StintB(){
  return <div>
    <div className="row between center" style={{marginBottom:14}}>
      <div className="sesshead"><span className="cbadge"><Icon n="car" s={20}/></span>
        <div><div className="ttl">Stint 1 · Mazda MX5 · Winton</div><div className="sub">Race · 8 laps · 1:31.990 best</div></div></div>
      <div className="seg accent"><button className="on">Time</button><button>Sectors</button></div>
    </div>
    <div className="row resp" style={{alignItems:'stretch'}}>
      <div className="card pad" style={{flex:2.3}}>
        <span className="lbl">All laps</span>
        <table className="tbl" style={{marginTop:6}}><thead><tr><th>Lap</th><th>Time</th><th>Δ</th><th>S1</th><th>S2</th><th>S3</th><th>S4</th><th>Fuel</th></tr></thead>
        <tbody>{STINT_LAPS.map((r,i)=><tr key={i} className={r[5]==='best'?'best':''}>
          <td className="lead num">{r[0]}</td><td className={"num "+(r[5]==='best'?'green':'')}>{r[1]}</td>
          <td className={"num "+(r[2]==='0.000'?'':'redt')}>{r[2]}</td><SectorCells s={r[4]} flags={r[5]}/><td>{r[3]}</td>
        </tr>)}</tbody></table>
      </div>
      <div className="col" style={{flex:1}}>
        <div className="card pad" style={{background:'linear-gradient(120deg,var(--purple-soft),var(--surface) 60%)',borderColor:'color-mix(in oklch,var(--purple) 30%, transparent)'}}>
          <span className="lbl">Theoretical best</span><div className="stat"><div className="v purple">1:31.830</div></div><span className="muted" style={{fontSize:12}}>−0.16s vs your best lap</span></div>
        <div className="card pad"><span className="lbl">Most lost time</span><div className="h2" style={{margin:'4px 0'}}>Sector 3</div>
          <div className="row between" style={{fontSize:12}}><span className="muted">avg loss</span><b className="num redt">+0.42s</b></div>
          <div className="barline" style={{marginTop:8}}><div className="f" style={{width:'68%',background:'var(--red)'}}></div></div></div>
        <div className="card pad grow"><span className="lbl">Fuel to finish</span><div className="h2 num" style={{margin:'4px 0'}}>+2 laps</div>
          <span className="muted" style={{fontSize:12}}>0.67 L/lap · margin OK</span>
          <div className="row gap6 center" style={{marginTop:10}}><span className="dot acc"></span><span style={{fontSize:12.5}}>No stop required</span></div></div>
      </div>
    </div>
  </div>;
}

window.StintScreen=function({variation,mode,setMode}){return variation==='b'?<StintB/>:<StintA mode={mode} setMode={setMode}/>;};
window.StintScreen.variations=[
  {id:'a',label:'A',name:'Tipo ref',desc:'Barras dos pilotos no topo, <b>KPIs</b> (fastest / optimal / fuel), gráfico de laptime e tabela de voltas por setor.'},
  {id:'b',label:'B',name:'Tabela + insights',desc:'Tabela de voltas dominante à esquerda, <b>trilho de insights</b> (theoretical best, most lost time, fuel) à direita.'},
];
