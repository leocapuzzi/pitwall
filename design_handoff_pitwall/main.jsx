/* main.jsx — app shell, routing, variation state, tweaks */
const {useState,useEffect}=React;

const VIEW_TITLES={
  dashboard:'Dashboard', stint:'Stint Overview', telemetry:'Telemetry',
  lap:'Lap Analysis', comparison:'Comparison', ai:'Race Engineer AI'
};
const VIEW_SUBTITLES={
  dashboard:'Your season at a glance', stint:'Lap-by-lap breakdown of your stint',
  telemetry:'Your lap vs the reference, channel by channel', lap:'Where you gain and lose time, corner by corner',
  comparison:'Two laps, side by side', ai:'Post-session analysis from your AI race engineer'
};
// Locked variations (chosen by the team — no in-prototype toggle).
const FIXED_VAR={dashboard:'a', stint:'a', telemetry:'a', lap:'b', comparison:'a', ai:'a'};
const SCREEN_COMPONENTS={
  dashboard:'DashboardScreen', stint:'StintScreen', telemetry:'TelemetryScreen',
  lap:'LapScreen', comparison:'ComparisonScreen', ai:'AIScreen'
};

function Stub({name}){return <div className="card pad" style={{display:'grid',placeItems:'center',minHeight:320,color:'var(--ink-3)'}}>
  <div style={{textAlign:'center'}}><Icon n="telem" s={28}/><div style={{marginTop:10,fontWeight:600}}>{name} — em construção</div></div></div>;}

function App(){
  const [t,setTweak]=useTweaks(TWEAK_DEFAULTS);
  const [view,setView]=useState(()=>{try{return localStorage.getItem('pw_view')||'dashboard';}catch(e){return 'dashboard';}});
  const [mode,setMode]=useState('Distance');

  useEffect(()=>{try{localStorage.setItem('pw_view',view);}catch(e){}},[view]);

  // theme + accent
  useEffect(()=>{
    document.body.className='theme-'+(t.theme||'midnight');
    const r=document.documentElement;
    r.style.setProperty('--accent', t.accent);
  },[t.theme,t.accent]);

  const go=(v)=>setView(v);
  const Comp=window[SCREEN_COMPONENTS[view]];
  const curVar=FIXED_VAR[view]||'a';

  return <div className="app">
    <TopNav view={view} go={go}/>
    {view!=='dashboard' && <SessionStrip view={view} go={go}/>}
    <main className="stage">
      <div className="screen on">
        <div className="scr-head">
          <div>
            <h1 style={{fontFamily:'var(--font-display)',fontSize:24,fontWeight:800,margin:0,letterSpacing:'-.01em'}}>{VIEW_TITLES[view]}</h1>
            <div className="vt-desc">{VIEW_SUBTITLES[view]}</div>
          </div>
        </div>
        {Comp ? <Comp variation={curVar} mode={mode} setMode={setMode}/> : <Stub name={VIEW_TITLES[view]}/>}
      </div>
    </main>
    <StatusBar/>

    <TweaksPanel title="Tweaks">
      <TweakSection label="Tema"/>
      <TweakRadio label="Base" value={t.theme} options={['midnight','carbon','graphite']} onChange={(v)=>setTweak('theme',v)}/>
      <TweakSection label="Cor de destaque"/>
      <TweakColor label="Accent" value={t.accent} options={['#1FDE7E','#36C6E0','#F0573D','#9D7BFF','#E6A94A']} onChange={(v)=>setTweak('accent',v)}/>
    </TweaksPanel>
  </div>;
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "midnight",
  "accent": "#1FDE7E"
}/*EDITMODE-END*/;

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
