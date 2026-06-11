/* screens-dashboard.jsx */

/* iRacing license-class colors */
const LIC_COLOR = { R: '#FF5656', D: '#F6871F', C: '#F4CE47', B: '#39C76B', A: '#3E83F0', P: '#D7DBE2' };
const LICENSES = [
{ cat: 'Sports Car', icon: 'car', cls: 'A', sr: 4.12, ir: '2,134', irWk: 84, srWk: 0.18, seed: 4 },
{ cat: 'Formula Car', icon: 'wheel', cls: 'B', sr: 3.68, ir: '1,540', irWk: 12, srWk: -0.22, seed: 9 },
{ cat: 'Oval', icon: 'oval', cls: 'C', sr: 2.95, ir: '1,180', irWk: 0, srWk: 0.05, seed: 6 },
{ cat: 'Dirt Road', icon: 'road', cls: 'D', sr: 3.40, ir: '980', irWk: -34, srWk: 0.41, seed: 2 }];

function Delta({ n, d = 0, suffix }) {
  const cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  const arrow = n > 0 ? '↑' : n < 0 ? '↓' : '–';
  const txt = (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d);
  return <span className={'delta ' + cls}>{arrow} {txt}{suffix}</span>;
}
function LicenseCard({ cat, icon, cls, sr, ir, irWk, srWk, seed }) {
  const color = LIC_COLOR[cls];
  return <div className="card pad liccard" style={{ '--lc': color }}>
    <div className="lic-top">
      <div className="lic-cat"><span className="licico"><Icon n={icon} s={17} /></span>
        <span className="lbl" style={{ fontSize: 11 }}>{cat}</span></div>
      <span className="licbadge">{cls}</span>
    </div>
    <div className="row between" style={{ alignItems: 'flex-end', margin: '15px 0 2px' }}>
      <div>
        <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>iRating</span>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-.02em', lineHeight: 1, marginTop: 3 }}>{ir}</div>
      </div>
      <Delta n={irWk} />
    </div>
    <Spark seed={seed} color={color} style={{ height: 40, margin: '8px 0 2px' }} />
    <div className="row between center" style={{ marginTop: 8 }}>
      <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>Safety · Class {cls}</span>
      <span className="num" style={{ fontSize: 14, fontWeight: 700 }}>{sr.toFixed(2)} <span className="dim" style={{ fontSize: 11, fontWeight: 500 }}>SR</span></span>
    </div>
    <div className="licbar"><i style={{ width: sr / 4.99 * 100 + '%' }}></i></div>
    <div className="row between center" style={{ marginTop: 7 }}>
      <span className="dim" style={{ fontSize: 11 }}>vs. last week</span>
      <Delta n={srWk} d={2} suffix=" SR" />
    </div>
  </div>;
}

function StatCard({ icon, label, value, sub, vclass }) {
  return <div className="card pad stat">
    <div className="row between center">
      <span className="lbl">{label}</span>
      {icon && <span className="ico"><Icon n={icon} s={18} /></span>}
    </div>
    <div className={"v" + (vclass ? " " + vclass : "")}>{value}</div>
    {sub && <span className="muted" style={{ fontSize: 12 }}>{sub}</span>}
  </div>;
}

/* hero carousel panels — each drives the season cards on the right */
const PANELS = [
{ key: 'driver', img: 'assets/hero-driver.png', objPos: 'center bottom', no: '64',
  title: 'L. Capuzzi', sub: 'Driver · BRA', status: 'All cars',
  stats: [{ icon: 'road', label: 'Season laps', value: '248' }, { icon: 'clock', label: 'Time driven', value: '14:22' },
  { icon: 'spark', label: 'iRating', value: '2.1k', sub: '↑ +84 this week' }],
  session: { car: 'Mazda MX5 Cup', track: 'Winton Motor Raceway', best: '1:34.241', pos: 'P12', green: true },
  donut: { label: 'Most used car', pct: 58, big: '58%', sub: 'SHARE', cap: 'Mazda MX5 Cup', glow: true },
  usage: [['Mazda MX5 Cup', 58, 'var(--accent)'], ['Porsche 911 GT3', 30, 'var(--cyan)'], ['Other GT3', 12, 'var(--ink-3)']],
  donutLabel: 'Car usage', rows: [['Mazda MX5 Cup', '58%', 'var(--accent)'], ['Porsche 911 GT3', '30%', 'var(--cyan)'], ['Other GT3', '12%', 'var(--ink-3)']],
  bars: [30, 20, 45, 25, 15, 35, 95] },
{ key: 'porsche', img: 'assets/hero-porsche.png', objPos: 'center bottom', no: '64',
  title: 'Porsche 911 GT3', sub: 'LIGMA Racing', status: 'In garage',
  stats: [{ icon: 'road', label: 'Porsche laps', value: '96' }, { icon: 'clock', label: 'Time driven', value: '06:48' },
  { icon: 'spark', label: 'Best lap', value: '2:18.114', sub: 'Spa-Francorchamps', vclass: 'sm' }],
  session: { car: 'Porsche 911 GT3', track: 'Spa-Francorchamps', best: '2:18.114', pos: 'P4', green: true },
  donut: { label: 'Podium rate', pct: 34, big: '34%', sub: 'PODIUM', cap: '11 of 32 races' },
  donutLabel: 'Podium rate', rows: [['Podium finishes', '11'], ['Wins', '3'], ['Races', '32']],
  bars: [12, 28, 18, 42, 22, 36, 30] },
{ key: 'mazda', img: 'assets/hero-mazda.png', objPos: 'center bottom', no: '64',
  title: 'Mazda MX5 Cup', sub: 'LIGMA Racing', status: 'In garage',
  stats: [{ icon: 'road', label: 'Mazda laps', value: '152' }, { icon: 'clock', label: 'Time driven', value: '07:34' },
  { icon: 'spark', label: 'Best lap', value: '1:31.990', sub: 'Winton Raceway', vclass: 'sm' }],
  session: { car: 'Mazda MX5 Cup', track: 'Winton Motor Raceway', best: '1:31.990', pos: 'P12', green: false },
  donut: { label: 'Top-5 rate', pct: 46, big: '46%', sub: 'TOP 5', cap: '21 of 46 races' },
  donutLabel: 'Top-5 rate', rows: [['Top-5 finishes', '21'], ['Best finish', 'P2'], ['Races', '46']],
  bars: [40, 30, 55, 35, 25, 48, 70] }];


/* multi-segment donut — one colored slice per label, sums to 100% */
function SegDonut({ segments, center, sub, size = 118 }) {
  const cx = size/2, R = size*0.441, sw = size*0.11, C = 2 * Math.PI * R, gap = size*0.021;
  let acc = 0;
  return <div className="ring-wrap" style={{ position: 'relative', width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={sw} />
      {segments.map(([name, pct, color]) => {
        const len = C * pct / 100;
        const dash = Math.max(0, len - gap);
        const off = -C * acc / 100;
        acc += pct;
        return <circle key={name} cx={cx} cy={cx} r={R} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={dash + ' ' + (C - dash)} strokeDashoffset={off} transform={'rotate(-90 ' + cx + ' ' + cx + ')'}
        style={{ filter: 'drop-shadow(0 0 5px ' + color + ')' }} />;
      })}
    </svg>
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div><b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size*0.205, letterSpacing: '-.02em' }}>{center}</b>
        {sub && <small style={{ display: 'block', fontSize: size*0.086, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '.04em' }}>{sub}</small>}</div>
    </div>
  </div>;
}

function DashboardA() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const [idx, setIdx] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const swipe = React.useRef(null);
  const go = (n) => setIdx((n + PANELS.length) % PANELS.length);
  React.useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % PANELS.length), 5000);
    return () => clearInterval(id);
  }, [paused]);
  const onDown = (e) => { swipe.current = e.clientX; };
  const onUp = (e) => { if (swipe.current == null) return; const dx = e.clientX - swipe.current; swipe.current = null; if (Math.abs(dx) > 40) { go(idx + (dx < 0 ? 1 : -1)); setPaused(true); } };
  const p = PANELS[idx];
  return <div>
    <div className="row resp" style={{ gap: 20, alignItems: 'stretch' }}>
      {/* left hero column */}
      <div className="col" style={{ flex: '1.05', gap: 14 }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="hero welcome" style={{ flex: 1, minHeight: 260 }} onPointerDown={onDown} onPointerUp={onUp}>
          <div className="wel-top">
            <img className="wel-logo" src="assets/ligma-wordmark.png" alt="LIGMA Racing" />
            <div className="wel-greet">
              <span className="wel-hi">Welcome back</span>
              <span className="wel-name">L. Capuzzi</span>
            </div>
          </div>
          <img key={p.key} className="herocar" src={p.img} alt={p.title} style={{ objectPosition: p.objPos }} />
          <div className="wel-foot">
            <div className="wel-car">
              <span className="wel-no">{p.no}</span>
              <div className="wel-cn"><b>{p.title}</b><span><span className="dot acc" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }}></span>{p.sub}</span></div>
            </div>
            <div className="wel-nav">
              <button className="wel-arw" onClick={() => go(idx - 1)} aria-label="Previous"><Icon n="chevL" s={15} /></button>
              <div className="wel-dots">{PANELS.map((q, i) => <span key={q.key} className={"wel-dot" + (i === idx ? ' on' : '')} onClick={() => setIdx(i)}></span>)}</div>
              <button className="wel-arw" onClick={() => go(idx + 1)} aria-label="Next"><Icon n="chevR" s={15} /></button>
            </div>
          </div>
        </div>
        <div className="card pad">
          <div className="row between center"><span className="lbl">Weekly activity</span><span className="chip">This week</span></div>
          <div className="bars" style={{ marginTop: 14, height: 92 }}>
            {p.bars.map((v, i) => <i key={i} className={i === 6 ? 'on' : ''} style={{ height: v + '%' }}></i>)}
          </div>
          <div className="row between" style={{ marginTop: 8 }}>{days.map((d) => <span key={d} className="muted" style={{ fontSize: 11, fontWeight: 600, flex: 1, textAlign: 'center' }}>{d}</span>)}</div>
        </div>
      </div>
      {/* right cards column — react to the active panel */}
      <div className="col" style={{ flex: '1.15' }}>
        <div className="grid3">
          {p.stats.map((s, i) => <StatCard key={i} icon={s.icon} label={s.label} value={s.value} sub={s.sub} vclass={s.vclass} />)}
        </div>
        <div className="row" style={{ gap: 12 }}>
          <div className="card pad grow" style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="lbl">Latest session</span>
            <div className="row center gap10" style={{ margin: '10px 0 8px' }}>
              <span className="cbadge"><Icon n="car" s={20} /></span>
              <div><div className="h3">{p.session.car}</div><span className="muted" style={{ fontSize: 12 }}>{p.session.track}</span></div>
            </div>
            <MiniMap accent="var(--accent)" style={{ flex: 1, minHeight: 150, margin: '4px 0' }} />
            <div className="col gap6" style={{ marginTop: 10 }}>
              <div className="row between"><span className="muted" style={{ fontSize: 12 }}>Best Lap</span><b className="num">{p.session.best}</b></div>
              <div className="row between"><span className="muted" style={{ fontSize: 12 }}>Leaderboard</span><b className={"num" + (p.session.green ? ' green' : '')}>{p.session.pos}</b></div>
            </div>
          </div>
          <div className="card pad grow" style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="lbl">{p.donutLabel}</span>
            <div style={{ display: 'grid', placeItems: 'center', margin: '6px 0', flex: 1 }}>{p.usage ? <SegDonut segments={p.usage} center="248" sub="LAPS" size={162} /> : <Donut pct={p.donut.pct} label={p.donut.big} sub={p.donut.sub} glow={p.donut.glow} size={162} />}</div>
            <div className="col" style={{ gap: 9 }}>
              {p.rows.map(([label, value, color]) =>
              <div key={label} className="row between center">
                  <span className="row center gap8">{color ? <span className="dot" style={{ background: color }}></span> : null}<span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span></span>
                  <b className="num" style={{ fontSize: 13 }}>{value}</b>
                </div>)}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* licenses & ratings — fills the lower half */}
    <div className="licsec">
      <div className="row between center" style={{ marginBottom: 13 }}>
        <div className="row center gap10">
          <span className="lbl">Licenses &amp; Ratings</span>
          <span className="muted" style={{ fontSize: 12 }}>iRacing · LIGMA Racing #64</span>
        </div>
        <span className="chip">This season</span>
      </div>
      <div className="grid4">
        {LICENSES.map((l) => <LicenseCard key={l.cat} {...l} />)}
      </div>
    </div>
  </div>;
}

function DashboardB() {
  const rows = [
  ['Mazda MX5 · Winton', '06-06 15:10', 'Race', '1:34.241', 'P12', 'green'],
  ['Mazda MX5 · Winton', '06-06 15:04', 'Qual', '1:32.584', '—', ''],
  ['Mazda MX5 · Winton', '06-06 14:40', 'Practice', '1:31.990', '—', 'purple'],
  ['Porsche 992 · Spa', '06-05 21:18', 'Race', '2:18.114', 'P4', 'green']];

  return <div className="col">
    <div className="grid4">
      <StatCard icon="road" label="Career laps" value="1,284" />
      <StatCard icon="clock" label="Hours driven" value="86h" />
      <StatCard icon="flag" label="Best finish" value="P2" />
      <StatCard icon="spark" label="iRating" value="2.1k" sub="↑ +84 this week" />
    </div>
    <div className="row resp" style={{ alignItems: 'stretch' }}>
      <div className="card pad" style={{ flex: 2 }}>
        <div className="row between center"><span className="lbl">Personal best progression</span>
          <div className="seg"><button className="on">30d</button><button>90d</button><button>All</button></div></div>
        <Prog seed={7} color="var(--accent)" style={{ height: 210, marginTop: 10 }} />
      </div>
      <div className="col" style={{ flex: 1 }}>
        <div className="card pad" style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="lbl">Consistency</span>
          <div style={{ display: 'grid', placeItems: 'center', margin: '10px 0 4px' }}><Donut pct={92} label="92%" sub="STABLE" /></div>
        </div>
        <div className="card pad grow">
          <span className="lbl">Car usage</span>
          <div className="col gap10" style={{ marginTop: 12 }}>
            {[['Mazda MX5', 62], ['Porsche Cup', 28], ['GT3 Field', 10]].map(([n, p]) =>
            <div key={n}><div className="row between" style={{ fontSize: 12 }}><span className="muted">{n}</span><b className="num">{p}%</b></div>
              <div className="barline" style={{ marginTop: 5 }}><div className="f" style={{ width: p + '%' }}></div></div></div>)}
          </div>
        </div>
      </div>
    </div>
    <div className="card pad">
      <div className="row between center" style={{ marginBottom: 6 }}><span className="lbl">Recent sessions</span><span className="chip"><Icon n="filter" s={13} /> Filter</span></div>
      <table className="tbl"><thead><tr><th>Car / Track</th><th>Date</th><th>Type</th><th>Best lap</th><th>Finish</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td className="lead">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td>
        <td className={"num " + r[5]}>{r[3]}</td><td className={r[4][0] === 'P' ? 'num green' : 'num'}>{r[4]}</td></tr>)}</tbody></table>
    </div>
  </div>;
}

window.DashboardScreen = function ({ variation }) {return variation === 'b' ? <DashboardB /> : <DashboardA />;};
window.DashboardScreen.variations = [
{ id: 'a', label: 'A', name: 'Hero + cards', desc: 'Próximo da ref: <b>hero do carro</b> + cards de resumo, donut de uso e atividade semanal.' },
{ id: 'b', label: 'B', name: 'Carreira densa', desc: 'Sem hero — foco em <b>estatísticas de carreira</b>, progressão do PB, consistência e tabela de sessões.' }];