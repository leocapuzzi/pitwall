/* ai-pro.jsx — premium interactive Race Engineer AI.
   The chat is live: suggestion chips and the text input post messages, the
   engineer replies (contextual canned answers, optionally with an inline trace),
   a typing indicator shows while it "thinks", and the thread auto-scrolls.
   Opportunity rows are clickable and repin the headline insight.
   Overrides window.AIScreen. */
const {useState:useStateAP, useRef:useRefAP, useEffect:useEffectAP, useCallback:useCbAP} = React;

const AP_SKILLS=[['Braking',72,'B−'],['Throttle',88,'A−'],['Racing line',79,'B+'],['Consistency',81,'B']];
const AP_OPPS=[
  {id:'t3', rank:1, title:'Sector 3 — braking too early', desc:'Trail to the apex instead of releasing early', gain:'+0.6s', note:'brake +12 m later',
   pin:{h:'Brake later into T3', p:'Move your brake point ~12 m deeper and trail off to the apex. Worth roughly +0.6s.'}},
  {id:'t5', rank:2, title:'T5 exit — early throttle', desc:'Wait for rotation before full throttle', gain:'+0.4s', note:'reduce wheelspin',
   pin:{h:'Be patient on T5 exit', p:'Wait for the car to rotate before going to full throttle — you\'re lighting up the rears and scrubbing exit speed.'}},
  {id:'cons', rank:3, title:'Lap-to-lap consistency', desc:'Repeat the same reference marks', gain:'+0.3s', note:'σ 0.4s → 0.2s',
   pin:{h:'Tighten your consistency', p:'Your σ is 0.4s. Lock in repeatable braking and turn-in marks to bring it under 0.2s and bank the easy time.'}},
];
/* contextual canned replies keyed by intent */
function apReply(q){
  const s=q.toLowerCase();
  if(/t3|sector 3|sector3|brak/.test(s)) return {text:"You're braking 12 m early into T3 and bleeding too much speed before the apex. Trail the brake in and let the car roll to the apex — here's your brake trace vs the reference:", chart:['brake',33,'var(--red)']};
  if(/t5|throttle|exit|wheelspin/.test(s)) return {text:"On T5 exit you're getting to full throttle before the car has rotated, so the rears light up. Feed it in ~0.3s later and you'll carry more speed onto the back straight. Throttle trace:", chart:['throttle',22,'var(--accent)']};
  if(/consist|variance|repeat/.test(s)) return {text:"Your lap-to-lap σ is 0.41s — the pace is there but it's not repeatable. Pick fixed braking markers for T3 and T5 and you'll halve that. Tightening it is worth about +0.3s on your average."};
  if(/fuel|stop|strateg/.test(s)) return {text:"Fuel's healthy: 0.67 L/lap with ~2 laps of margin, so no stop required. If you push the entries harder in S3 you'll cost maybe 0.02 L/lap — still well inside the window."};
  if(/lead|p1|compar|gap/.test(s)) return {text:"The leader is ~1.2s a lap up, and about 0.8s of that is purely Sector 3. Fix your T3 entry and you're fighting for the podium — the rest of the lap is already competitive."};
  if(/speed|fast|where.*time|lose|lost/.test(s)) return {text:"You're leaving ~1.6s on the table and almost all of it is in Sector 3 (T3 entry) and T5 exit. Nail those two corners and the lap drops to about 1:32.6.", chart:['speed',44,'var(--cyan)']};
  return {text:"Good question. Across the 8 laps your strongest area is throttle application on the power-down zones; your biggest opportunity is corner entry in the slow stuff. Want me to break down T3, T5, or your consistency?"};
}

function APMsg({m}){
  return <div className={"msg "+(m.role==='me'?'me':'eng')}>
    {m.role==='eng' && <span className="av mascot"><img src="assets/engineer-mascot.png" alt="Engineer"/></span>}
    <div className="bubble">{m.role==='eng'&&<b>Engineer</b>}{m.text}
      {m.chart && <div className="inlinechart" dangerouslySetInnerHTML={{__html:window.channelSVG(m.chart[0],m.chart[1],m.chart[2],0.5)}}></div>}
    </div>
  </div>;
}

function AIPro(){
  const [msgs,setMsgs]=useStateAP([
    {role:'eng', text:"I've analyzed your 8 laps. You're leaving ~1.6s on the table, almost all of it in Sector 3. Want me to break down T3?"},
  ]);
  const [typing,setTyping]=useStateAP(false);
  const [draft,setDraft]=useStateAP('');
  const [pin,setPin]=useStateAP(AP_OPPS[0]);
  const [activeOpp,setActiveOpp]=useStateAP('t3');
  const scrollRef=useRefAP();
  const timer=useRefAP();

  useEffectAP(()=>{const el=scrollRef.current; if(el) el.scrollTop=el.scrollHeight;},[msgs,typing]);
  useEffectAP(()=>()=>clearTimeout(timer.current),[]);

  const send=useCbAP((text)=>{
    const q=(text||'').trim(); if(!q||typing) return;
    setDraft(''); setMsgs(m=>[...m,{role:'me',text:q}]); setTyping(true);
    timer.current=setTimeout(()=>{ setTyping(false); setMsgs(m=>[...m,{role:'eng',...apReply(q)}]); }, 700+Math.random()*500);
  },[typing]);

  const pickOpp=useCbAP((o)=>{ setActiveOpp(o.id); setPin(o); send('How do I improve '+o.title.split('—')[0].trim()+'?'); },[send]);

  return <div className="ap-page">
    <div className="card ap-hero">
      <span className="ap-hero-av"><img src="assets/engineer-mascot.png" alt="Race Engineer"/></span>
      <div className="ap-hero-txt">
        <div className="row center gap8"><span className="lbl" style={{letterSpacing:'.12em'}}>Your AI Race Engineer</span><span className="ap-live"><i className="ap-dot"></i>live</span></div>
        <h2 className="ap-hero-name">Race Engineer</h2>
        <p className="ap-hero-tag">“I've crunched all 8 laps — you're leaving about 1.6s on the table, mostly in Sector 3. Let's go get it. Ask me anything.”</p>
      </div>
      <div className="ap-hero-meta">
        <div><span className="lbl">Session</span><b className="num">8 laps</b></div>
        <div><span className="lbl">Potential</span><b className="num purple">1:32.6</b></div>
        <span className="chip solid"><Icon n="refresh" s={13}/> Re-analyze</span>
      </div>
    </div>
    <div className="row resp ap-wrap" style={{alignItems:'stretch',gap:16,flex:1,minHeight:0}}>
    {/* LEFT — report + coach */}
    <div className="col ap-left" style={{flex:1.6,minWidth:0,gap:14}}>
      <div className="card pad" style={{background:'linear-gradient(120deg,var(--accent-soft),var(--surface) 55%)',borderColor:'var(--accent-line)'}}>
        <div className="row between center"><span className="lbl">Summary · post-session</span><span className="muted" style={{fontSize:11.5}}>Mazda MX5 · Winton · 8 laps</span></div>
        <div className="h2" style={{margin:'8px 0',lineHeight:1.25}}>You're <span className="num">~1.6s</span> off your potential — most of it in Sector 3.</div>
        <p className="muted" style={{fontSize:13.5,margin:0,lineHeight:1.55}}>Strong pace on the power-down zones, but you're consistently braking early into the slow corners. Tidy up T3 and T5 entry and the lap is right there.</p>
      </div>
      <div className="grid4">
        {AP_SKILLS.map(([k,v,g])=><div key={k} className="card pad stat">
          <div className="row between center"><span className="lbl">{k}</span><span className="grade" style={{fontSize:20}}>{g}</span></div>
          <div className="v" style={{fontSize:24,marginTop:2}}>{v}<span style={{fontSize:12,color:'var(--ink-3)'}}>/100</span></div>
          <div className="barline" style={{marginTop:6}}><div className="f" style={{width:v+'%'}}></div></div>
        </div>)}
      </div>
      <div className="card pad" style={{flex:1,display:'flex',flexDirection:'column'}}>
        <div className="row between center"><span className="lbl">Biggest time gains available</span><span className="muted" style={{fontSize:11}}>click to ask the engineer</span></div>
        <div style={{marginTop:6}}>{AP_OPPS.map(o=><button key={o.id} className={"opp ap-opp"+(activeOpp===o.id?' on':'')} onClick={()=>pickOpp(o)}>
          <span className={"rank"+(o.rank===1?" r1":"")}>{o.rank}</span>
          <div className="grow"><div className="ob">{o.title}</div><div className="od">{o.desc}</div></div>
          <div className="gain redt">{o.gain}<div className="od" style={{fontWeight:500}}>{o.note}</div></div>
        </button>)}</div>
        <div className="row between center" style={{marginTop:'auto',paddingTop:12}}>
          <span className="lbl">Skill trend</span><span className="muted num" style={{fontSize:11}}>last 14 sessions</span></div>
        <Prog seed={9} color="var(--accent)" style={{height:96,marginTop:8}}/>
      </div>
    </div>

    {/* RIGHT — live engineer chat */}
    <div className="col ap-right" style={{flex:1,minWidth:0,gap:14}}>
      <div className="card chatwrap ap-chat" style={{flex:1,minHeight:0,display:'flex',flexDirection:'column'}}>
        <div className="row between center" style={{marginBottom:2,flex:'none'}}>
          <div className="row center gap8"><span className="av mascot" style={{width:32,height:32}}><img src="assets/engineer-mascot.png" alt="Engineer"/></span><b style={{fontSize:13.5}}>Chat with your engineer</b></div>
          <span className="ap-live"><i className="ap-dot"></i>live</span>
        </div>
        <div className="ap-thread" ref={scrollRef}>
          {msgs.map((m,i)=><APMsg key={i} m={m}/>)}
          {typing && <div className="msg eng"><span className="av mascot"><img src="assets/engineer-mascot.png" alt="Engineer"/></span><div className="bubble ap-typing"><span></span><span></span><span></span></div></div>}
        </div>
        <div className="ap-suggest">
          {['Where did I lose time?','How do I improve T3?','Fuel strategy?','Compare to the leader'].map(q=>
            <button key={q} className="chip" onClick={()=>send(q)}>{q}</button>)}
        </div>
        <form className="chatinput ap-input" onSubmit={(e)=>{e.preventDefault(); send(draft);}}>
          <input placeholder="Ask the engineer about your lap…" value={draft} onChange={(e)=>setDraft(e.target.value)}/>
          <button type="submit" className="chip solid" style={{padding:'7px 14px',border:0,cursor:'pointer'}}><Icon n="send" s={13}/> Send</button>
        </form>
      </div>
      <div className="card pad" style={{background:'linear-gradient(120deg,var(--accent-soft),var(--surface) 60%)',borderColor:'var(--accent-line)'}} key={pin.id}>
        <div className="row between center"><span className="lbl">Pinned insight</span><Icon n="pin" s={15}/></div>
        <div className="h3 ap-pinh" style={{margin:'6px 0 8px'}}>{pin.pin.h}</div>
        <p className="muted" style={{fontSize:13,margin:0,lineHeight:1.5}}>{pin.pin.p}</p>
      </div>
    </div>
  </div>
  </div>;
}
window.AIScreen=function(){return <AIPro/>;};
