/* screens-ai.jsx */
function OppRow({rank, title, desc, gain, note, top}){
  return <div className="opp">
    <span className={"rank"+(top?" r1":"")}>{rank}</span>
    <div className="grow"><div className="ob">{title}</div><div className="od">{desc}</div></div>
    <div className="gain redt">{gain}{note&&<div className="od" style={{fontWeight:500}}>{note}</div>}</div>
  </div>;
}

function AIReport(){
  return <div>
    <div className="row between center" style={{marginBottom:16}}>
      <div className="row center gap10"><span className="cbadge" style={{background:'var(--accent-soft)',borderColor:'var(--accent-line)',color:'var(--accent)'}}><Icon n="spark" s={20}/></span>
        <div><div className="h2">Race Engineer report</div><span className="muted" style={{fontSize:12.5}}>Mazda MX5 · Winton · 8 laps · analyzed post-session</span></div></div>
      <span className="chip"><Icon n="refresh" s={13}/> Re-analyze</span></div>
    <div className="row resp" style={{alignItems:'stretch'}}>
      <div className="col" style={{flex:1.5}}>
        <div className="card pad" style={{background:'linear-gradient(120deg,var(--accent-soft),var(--surface) 55%)',borderColor:'var(--accent-line)'}}>
          <span className="lbl">Summary</span>
          <div className="h2" style={{margin:'6px 0',lineHeight:1.25}}>You're <span className="num">~1.6s</span> off your potential — most of it in Sector 3.</div>
          <p className="muted" style={{fontSize:13.5,margin:0,lineHeight:1.55}}>Your pace is strong on power-down zones, but you're consistently braking early into the slow corners. Tidy up entry in T3 and T5 and the lap is there.</p>
        </div>
        <div className="card pad"><span className="lbl">Top opportunities</span>
          <OppRow rank="1" top title="T3 — braking too early" desc="Brake 12 m later, trail to apex" gain="+0.6s"/>
          <OppRow rank="2" title="T5 — early throttle on exit" desc="Wait for rotation before full throttle" gain="+0.4s"/>
          <OppRow rank="3" title="Consistency — lap-to-lap variance" desc="Repeat the same reference marks" gain="+0.3s"/>
        </div>
        <div className="chatinput"><Icon n="spark" s={16}/><input placeholder="Ask the engineer about this report…"/><span className="chip solid" style={{padding:'7px 14px'}}><Icon n="send" s={13}/> Ask</span></div>
      </div>
      <div className="col" style={{flex:1}}>
        <div className="grid2">
          {[['Braking','B−'],['Throttle','A−'],['Racing line','B+'],['Consistency','B']].map(([k,g])=>
            <div key={k} className="card pad"><span className="lbl">{k}</span><div className="grade" style={{marginTop:6}}>{g}</div></div>)}
        </div>
        <div className="card" style={{padding:12,flex:1}}><div className="row between center"><span className="lbl" style={{marginLeft:4}}>Focus corners</span><span className="muted" style={{fontSize:11}}>tap to replay</span></div>
          <MiniMap accent="var(--accent)" style={{height:180,marginTop:6}}/></div>
      </div>
    </div>
  </div>;
}

function AIChat(){
  return <div>
    <div className="row resp" style={{alignItems:'stretch'}}>
      <div className="col" style={{flex:1.6}}>
        <div className="card chatwrap">
          <div className="msg eng"><span className="av"><Icon n="spark" s={15}/></span>
            <div className="bubble"><b>Engineer</b>I dug into your 8 laps. The headline: you're leaving ~1.6s on the table, almost all of it in Sector 3. Want me to break down T3?</div></div>
          <div className="msg me"><div className="bubble">Yeah — what am I doing wrong in T3?</div></div>
          <div className="msg eng"><span className="av"><Icon n="spark" s={15}/></span>
            <div className="bubble"><b>Engineer</b>You're hitting the brakes 12 m early and bleeding off too much speed before the apex. Here's your brake trace vs the reference:
              <div className="inlinechart" dangerouslySetInnerHTML={{__html:window.channelSVG('brake',33,'var(--red)',0.5)}}></div></div></div>
          <div className="chatinput"><input placeholder="Ask about your lap…"/><span className="chip solid" style={{padding:'7px 14px'}}><Icon n="send" s={13}/> Send</span></div>
        </div>
        <div className="suggest"><span className="chip">Where did I lose time?</span><span className="chip">How do I improve T3?</span><span className="chip">Fuel strategy?</span><span className="chip">Compare to the leader</span></div>
      </div>
      <div className="col" style={{flex:1}}>
        <div className="card pad" style={{background:'linear-gradient(120deg,var(--accent-soft),var(--surface) 60%)',borderColor:'var(--accent-line)'}}>
          <div className="row between center"><span className="lbl">Pinned insight</span><Icon n="pin" s={15}/></div>
          <div className="h2" style={{margin:'6px 0'}}>Brake later into T3</div>
          <p className="muted" style={{fontSize:13,margin:0,lineHeight:1.5}}>Move your brake point ~12 m deeper and trail off to the apex. Worth roughly +0.6s.</p></div>
        <div className="card pad"><span className="lbl">Session</span>
          <div className="col gap8" style={{marginTop:8}}>
            <div className="row between"><span className="muted" style={{fontSize:12.5}}>Best lap</span><b className="num">1:34.241</b></div>
            <div className="row between"><span className="muted" style={{fontSize:12.5}}>Potential</span><b className="num purple">1:32.6</b></div>
            <div className="row between"><span className="muted" style={{fontSize:12.5}}>Leaderboard</span><b className="num green">P12</b></div></div></div>
        <div className="card pad grow"><span className="lbl">Focus map</span><MiniMap accent="var(--accent)" style={{height:140,marginTop:6}}/></div>
      </div>
    </div>
  </div>;
}

function AICoach(){
  const skills=[['Braking',72],['Throttle',88],['Racing line',79],['Consistency',81]];
  return <div>
    <div className="row between center" style={{marginBottom:16}}>
      <div className="h2">Driver coach</div>
      <div className="seg"><button>This stint</button><button>vs last session</button><button className="on">vs reference</button></div></div>
    <div className="grid4" style={{marginBottom:16}}>
      {skills.map(([k,v])=><div key={k} className="card pad stat"><span className="lbl">{k}</span>
        <div className="v" style={{fontSize:32}}>{v}<span style={{fontSize:14,color:'var(--ink-3)'}}>/100</span></div>
        <div className="barline" style={{marginTop:4}}><div className="f" style={{width:v+'%'}}></div></div></div>)}
    </div>
    <div className="row resp" style={{alignItems:'stretch'}}>
      <div className="card pad" style={{flex:1.4}}><span className="lbl">Biggest time gains available</span>
        <OppRow rank="1" top title="Sector 3 — corner entry" desc="Late braking + trail" gain="+0.6s" note="brake +12 m later"/>
        <OppRow rank="2" title="T5 exit — throttle application" desc="Smoother on-throttle" gain="+0.4s" note="reduce wheelspin"/>
        <OppRow rank="3" title="Lap consistency" desc="Repeatable reference marks" gain="+0.3s" note="σ 0.4s → 0.2s"/>
      </div>
      <div className="card pad" style={{flex:1}}><div className="row between center"><span className="lbl">Skill trend</span><span className="muted num" style={{fontSize:11}}>last 14 sessions</span></div>
        <Prog seed={9} color="var(--accent)" style={{height:160,marginTop:8}}/></div>
    </div>
  </div>;
}

/* ===== Combined Engineer AI: report + coach scorecards + conversational chat ===== */
function AICombined(){
  const skills=[['Braking',72,'B−'],['Throttle',88,'A−'],['Racing line',79,'B+'],['Consistency',81,'B']];
  return <div className="row resp" style={{alignItems:'stretch',gap:16}}>
    {/* LEFT — generated report + skill coach */}
    <div className="col" style={{flex:1.65}}>
      <div className="card pad" style={{background:'linear-gradient(120deg,var(--accent-soft),var(--surface) 55%)',borderColor:'var(--accent-line)'}}>
        <div className="row between center"><span className="lbl">Summary · post-session</span>
          <span className="muted" style={{fontSize:11.5}}>Mazda MX5 · Winton · 8 laps</span></div>
        <div className="h2" style={{margin:'8px 0',lineHeight:1.25}}>You're <span className="num">~1.6s</span> off your potential — most of it in Sector 3.</div>
        <p className="muted" style={{fontSize:13.5,margin:0,lineHeight:1.55}}>Your pace is strong on the power-down zones, but you're consistently braking early into the slow corners. Tidy up entry in T3 and T5 and the lap is right there.</p>
      </div>
      <div className="grid4">
        {skills.map(([k,v,g])=><div key={k} className="card pad stat">
          <div className="row between center"><span className="lbl">{k}</span><span className="grade" style={{fontSize:20}}>{g}</span></div>
          <div className="v" style={{fontSize:25,marginTop:2}}>{v}<span style={{fontSize:12,color:'var(--ink-3)'}}>/100</span></div>
          <div className="barline" style={{marginTop:4}}><div className="f" style={{width:v+'%'}}></div></div>
        </div>)}
      </div>
      <div className="card pad"><div className="row between center"><span className="lbl">Biggest time gains available</span>
        <span className="muted" style={{fontSize:11}}>tap to replay segment</span></div>
        <OppRow rank="1" top title="Sector 3 — braking too early" desc="Trail to the apex instead of releasing early" gain="+0.6s" note="brake +12 m later"/>
        <OppRow rank="2" title="T5 exit — early throttle" desc="Wait for rotation before full throttle" gain="+0.4s" note="reduce wheelspin"/>
        <OppRow rank="3" title="Lap-to-lap consistency" desc="Repeat the same reference marks" gain="+0.3s" note="σ 0.4s → 0.2s"/>
      </div>
      <div className="card pad"><div className="row between center"><span className="lbl">Skill trend</span><span className="muted num" style={{fontSize:11}}>last 14 sessions</span></div>
        <Prog seed={9} color="var(--accent)" style={{height:140,marginTop:8}}/></div>
    </div>

    {/* RIGHT — conversational engineer */}
    <div className="col" style={{flex:1}}>
      <div className="card chatwrap" style={{flex:1,minHeight:430}}>
        <div className="row between center" style={{marginBottom:2}}>
          <div className="row center gap8"><span className="av" style={{width:28,height:28}}><Icon n="spark" s={14}/></span><b style={{fontSize:13.5}}>Race Engineer</b></div>
          <span className="chip" style={{padding:'4px 10px'}}><Icon n="refresh" s={12}/> Re-analyze</span></div>
        <div className="msg eng"><span className="av"><Icon n="spark" s={15}/></span>
          <div className="bubble">I've analyzed your 8 laps. You're leaving ~1.6s on the table, almost all of it in Sector 3. Want me to break down T3?</div></div>
        <div className="msg me"><div className="bubble">Yeah — what am I doing wrong in T3?</div></div>
        <div className="msg eng"><span className="av"><Icon n="spark" s={15}/></span>
          <div className="bubble">You're braking 12 m early and bleeding too much speed before the apex. Here's your brake trace vs the reference:
            <div className="inlinechart" dangerouslySetInnerHTML={{__html:window.channelSVG('brake',33,'var(--red)',0.5)}}></div></div></div>
        <div className="chatinput"><input placeholder="Ask about your lap…"/><span className="chip solid" style={{padding:'7px 14px'}}><Icon n="send" s={13}/> Send</span></div>
      </div>
      <div className="suggest"><span className="chip">Where did I lose time?</span><span className="chip">How do I improve T3?</span><span className="chip">Fuel strategy?</span></div>
      <div className="card pad" style={{background:'linear-gradient(120deg,var(--accent-soft),var(--surface) 60%)',borderColor:'var(--accent-line)'}}>
        <div className="row between center"><span className="lbl">Pinned insight</span><Icon n="pin" s={15}/></div>
        <div className="h3" style={{margin:'6px 0 8px'}}>Brake later into T3</div>
        <div className="row gap8">
          <div className="grow"><span className="muted" style={{fontSize:12}}>Best lap</span><div className="num" style={{fontWeight:700}}>1:34.241</div></div>
          <div className="grow"><span className="muted" style={{fontSize:12}}>Potential</span><div className="num purple" style={{fontWeight:700}}>1:32.6</div></div>
          <div className="grow"><span className="muted" style={{fontSize:12}}>Board</span><div className="num green" style={{fontWeight:700}}>P12</div></div>
        </div>
      </div>
    </div>
  </div>;
}

window.AIScreen=function(){return <AICombined/>;};
