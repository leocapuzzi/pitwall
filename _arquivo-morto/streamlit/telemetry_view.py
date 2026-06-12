"""Visualizador de telemetria interativo (HTML + Plotly.js embutido).

Layout e logica no padrao Garage61:
- MAPA grande a esquerda; GRAFICOS empilhados a direita (eixo X = distancia em m).
- Canais: Velocidade, Acelerador, Freio, Marcha, Volante.
- SEM legenda de linhas. Cada grafico tem CAIXAS DE VALOR a direita que mostram o
  valor no cursor, com cor por volta.
- COR POR VOLTA (nao por canal): sua volta/BEST = VERMELHO, AVG/referencia = AZUL.
  Mesma logica em todas as comparacoes e no mapa.
- Volante rotulado Esq/Dir (iRacing: angulo positivo = esquerda).
- Cursor sincronizado nos dois sentidos; zoom por setor (abas) ou livre; eixos Y
  travados (zoom afeta so a distancia).

build_html() recebe dados ja prontos (listas) e devolve a string HTML.
"""
from __future__ import annotations

import json

import numpy as np


def clean(arr) -> list:
    """Converte um array numpy em lista JSON-safe (NaN/inf viram None)."""
    a = np.asarray(arr, dtype=float)
    return [None if not np.isfinite(v) else float(v) for v in a]


def steer_text(deg) -> list:
    """Rotula o angulo do volante como 'Esq N°' / 'Dir N°' (iRacing: + = esquerda)."""
    out = []
    for v in np.asarray(deg, dtype=float):
        if not np.isfinite(v):
            out.append(None)
        else:
            out.append(f"{'Esq' if v >= 0 else 'Dir'} {abs(v):.0f}°")
    return out


_TEMPLATE = r"""
<div id="pw-root" style="font-family:sans-serif;color:#ddd;background:#0e1117;">
  <div style="display:flex;gap:12px;align-items:flex-start;">
    <div style="flex:0 0 40%;">
      <div id="pw-map" style="width:100%;height:600px;"></div>
    </div>
    <div style="flex:1;min-width:0;">
      <div id="pw-telem" style="width:100%;height:600px;"></div>
    </div>
  </div>
  <div style="display:flex;gap:5px;align-items:stretch;margin-top:8px;">
    <button id="pw-reset" style="background:#1f2530;color:#ddd;border:1px solid #3a4350;
      border-radius:6px;padding:4px 14px;cursor:pointer;font-size:13px;white-space:nowrap;">
      ↺ Volta toda</button>
    <div id="pw-secbar" style="display:flex;flex:1;gap:5px;"></div>
  </div>
  <div style="opacity:.7;font-size:12px;margin-top:6px;">
    🗺️ <span style="color:#E8412A;">■</span> sua volta · <span style="color:#2E86FF;">■</span>
    referencia · cinza = pista. Passe o mouse no mapa ou nos graficos (ligados);
    arraste nos graficos p/ zoom (o mapa acompanha).
  </div>
</div>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<script>
(function(){
  var D = __DATA__;
  var C = __COLORS__;        // C.a = sua volta (vermelho), C.b = referencia (azul)
  var x = D.x;
  var N = x.length;
  var tEl = document.getElementById('pw-telem');
  var mEl = document.getElementById('pw-map');

  // ---------------- Graficos (1 cor por volta, sem legenda) ----------------
  // hoverinfo:'none' -> NAO mostra o tooltip flutuante (que reordena pelo valor e
  // confunde). O evento de hover ainda dispara; a leitura fica nas caixas fixas a
  // direita, sempre na ordem: sua volta em cima, referencia embaixo.
  function lap(y, axis, isRef, step){
    var t = {x:x, y:y, type:'scatter', mode:'lines', yaxis:axis, showlegend:false,
             hoverinfo:'none', line:{color:(isRef?C.b:C.a), width:(isRef?1.8:2)}};
    if(step) t.line.shape = 'hv';
    return t;
  }
  var telem = [];
  telem.push(lap(D.speedA, 'y', false));
  if(D.hasRef) telem.push(lap(D.speedRef, 'y', true));
  telem.push(lap(D.thrA, 'y2', false));
  if(D.hasRef) telem.push(lap(D.thrRef, 'y2', true));
  telem.push(lap(D.brkA, 'y3', false));
  if(D.hasRef) telem.push(lap(D.brkRef, 'y3', true));
  telem.push(lap(D.gearA, 'y4', false, true));
  if(D.hasRef) telem.push(lap(D.gearRef, 'y4', true, true));
  telem.push(lap(D.steerA, 'y5', false));
  if(D.hasRef) telem.push(lap(D.steerRef, 'y5', true));

  var baseShapes = [];
  D.sectors.forEach(function(s){
    if(s.lo > x[0]+0.001) baseShapes.push({type:'line', xref:'x', x0:s.lo, x1:s.lo,
      yref:'paper', y0:0, y1:1, line:{color:'rgba(255,140,46,0.5)', width:1}});
  });
  D.corners.forEach(function(c){
    baseShapes.push({type:'line', xref:'x', x0:c, x1:c, yref:'paper', y0:0, y1:1,
      line:{color:'rgba(150,150,150,0.28)', width:1, dash:'dot'}});
  });

  // Dados e formatadores por faixa, p/ o tooltip flutuante (ordem fixa).
  var dataA = [D.speedA, D.thrA, D.brkA, D.gearA, D.steerA];
  var dataB = [D.speedRef, D.thrRef, D.brkRef, D.gearRef, D.steerRef];
  var fmts = [
    function(v){return v==null?'':v.toFixed(0)+' km/h';},
    function(v){return v==null?'':v.toFixed(0)+' %';},
    function(v){return v==null?'':v.toFixed(0)+' %';},
    function(v){return v==null?'':'M'+v.toFixed(0);},
    null  // volante usa textos Esq/Dir
  ];

  var telemLayout = {
    height:600, margin:{t:14, l:54, r:14, b:30},
    hovermode:'x', showlegend:false,
    paper_bgcolor:'#0e1117', plot_bgcolor:'#0e1117', font:{color:'#ddd', size:11},
    // sem titulo no meio; eixo X ancorado embaixo (numeros sob o ultimo grafico).
    xaxis:{domain:[0,1], range:[x[0], x[N-1]], anchor:'y5',
           showspikes:true, spikemode:'across', spikesnap:'cursor',
           spikethickness:1.2, spikedash:'solid', spikecolor:'#bbb',
           gridcolor:'#222', zeroline:false},
    yaxis:{domain:[0.832,1.0], title:'Vel km/h', gridcolor:'#222', fixedrange:true},
    yaxis2:{domain:[0.624,0.792], title:'Acel %', gridcolor:'#222', range:[0,105], fixedrange:true},
    yaxis3:{domain:[0.416,0.584], title:'Freio %', gridcolor:'#222', range:[0,105], fixedrange:true},
    yaxis4:{domain:[0.208,0.376], title:'Marcha', gridcolor:'#222', fixedrange:true, dtick:1},
    yaxis5:{domain:[0,0.168], title:'Volante °', gridcolor:'#222', fixedrange:true, zeroline:true, zerolinecolor:'#555'},
    shapes: baseShapes.slice()
  };

  // ---------------- Mapa da pista ----------------
  function squareBox(xs, ys, pad){
    var xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    for(var i=0;i<xs.length;i++){
      var vx=xs[i], vy=ys[i];
      if(vx==null||vy==null) continue;
      if(vx<xmin)xmin=vx; if(vx>xmax)xmax=vx;
      if(vy<ymin)ymin=vy; if(vy>ymax)ymax=vy;
    }
    var cx=(xmin+xmax)/2, cy=(ymin+ymax)/2;
    var half=Math.max(xmax-xmin, ymax-ymin)/2 * (1+(pad||0.08));
    if(!isFinite(half)||half<=0) half=1;
    return {x:[cx-half, cx+half], y:[cy-half, cy+half]};
  }
  function boxForRange(lo, hi){
    var xs=[], ys=[];
    for(var i=0;i<N;i++){ if(x[i]>=lo && x[i]<=hi){
      xs.push(D.mapAx[i]); ys.push(D.mapAy[i]);
      if(D.hasRef){ xs.push(D.mapRefx[i]); ys.push(D.mapRefy[i]); }
    }}
    return squareBox(xs, ys, 0.18);
  }
  var fullBox = squareBox(D.mapAx.concat(D.hasRef?D.mapRefx:[]),
                          D.mapAy.concat(D.hasRef?D.mapRefy:[]), 0.06);

  var secMarkX=[], secMarkY=[], secMarkT=[];
  D.sectors.forEach(function(s){
    var idx=0; for(var i=0;i<N;i++){ if(x[i]>=s.lo){ idx=i; break; } }
    secMarkX.push(D.mapAx[idx]); secMarkY.push(D.mapAy[idx]); secMarkT.push('S'+s.n);
  });

  var mapTraces = [];
  mapTraces.push({x:D.mapAx, y:D.mapAy, type:'scatter', mode:'lines',
    line:{color:'#3a3f4a', width:14}, hoverinfo:'skip', showlegend:false});
  if(D.hasRef) mapTraces.push({x:D.mapRefx, y:D.mapRefy, type:'scatter',
    mode:'lines', line:{color:C.b, width:2.5}, hoverinfo:'skip', showlegend:false});
  var aIdx = mapTraces.length;
  mapTraces.push({x:D.mapAx, y:D.mapAy, type:'scatter', mode:'lines',
    line:{color:C.a, width:2.5}, customdata:x, showlegend:false,
    hovertemplate:'%{customdata:.0f} '+D.xUnit+'<extra></extra>'});
  mapTraces.push({x:secMarkX, y:secMarkY, text:secMarkT, type:'scatter',
    mode:'markers+text', textposition:'top center', textfont:{color:'#ffd84d', size:11},
    marker:{size:8, color:'#ffd84d', symbol:'circle-open', line:{width:2}},
    hoverinfo:'text', showlegend:false});
  mapTraces.push({x:[D.mapAx[0]], y:[D.mapAy[0]], name:'largada/chegada', type:'scatter',
    mode:'markers', marker:{size:13, color:'#34C759', symbol:'square', line:{color:'#fff',width:1.5}},
    hoverinfo:'name', showlegend:false});
  var hlIdx = mapTraces.length;
  mapTraces.push({x:[], y:[], type:'scatter', mode:'lines',
    line:{color:'#ffd84d', width:5}, hoverinfo:'skip', showlegend:false});
  var carIdx = mapTraces.length;
  mapTraces.push({x:[D.mapAx[0]], y:[D.mapAy[0]], type:'scatter', mode:'markers',
    marker:{size:14, color:'#fff', line:{color:'#111', width:2}}, hoverinfo:'skip', showlegend:false});

  var mapLayout = {
    height:600, margin:{t:10, l:10, r:10, b:10},
    paper_bgcolor:'#0e1117', plot_bgcolor:'#0e1117', font:{color:'#ddd'},
    hovermode:'closest', showlegend:false,
    xaxis:{visible:false, zeroline:false, autorange:false, range:fullBox.x.slice()},
    yaxis:{visible:false, zeroline:false, autorange:false, range:fullBox.y.slice(),
           scaleanchor:'x', scaleratio:1}
  };

  var cfg = {responsive:true, displaylogo:false, modeBarButtonsToRemove:['select2d','lasso2d']};
  Plotly.newPlot(tEl, telem, telemLayout, cfg);
  Plotly.newPlot(mEl, mapTraces, mapLayout, cfg);

  // ---------------- Tooltip flutuante (proprio, ordem fixa) ----------------
  // Um balao por faixa, seguindo o cursor, com sua volta (vermelho) SEMPRE em cima
  // e a referencia (azul) embaixo. Usamos coordenadas internas do Plotly (l2p) para
  // posicionar, independente do hoverinfo.
  tEl.style.position = 'relative';
  var tips = [];
  for(var p=0;p<5;p++){
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;pointer-events:none;display:none;z-index:6;'+
      'background:rgba(14,17,23,0.88);border-radius:4px;padding:1px 6px;font-size:11.5px;'+
      'line-height:1.35;white-space:nowrap;transform:translateY(-50%);box-shadow:0 1px 4px #000;';
    tEl.appendChild(d); tips.push(d);
  }
  function hideTips(){ tips.forEach(function(d){ d.style.display='none'; }); }
  function showTips(i){
    if(i==null){ hideTips(); return; }
    var fl = tEl._fullLayout;
    if(!fl || !fl.xaxis){ return; }
    var xa = fl.xaxis;
    var xpix = xa.l2p(x[i]) + xa._offset;
    for(var p=0;p<5;p++){
      var d = tips[p];
      var ya = fl['yaxis' + (p===0?'':(p+1))];
      var va = (p===4) ? (D.steerTextA[i]||'') : fmts[p](dataA[p][i]);
      var vb = !D.hasRef ? '' : ((p===4) ? (D.steerTextRef[i]||'') : fmts[p](dataB[p][i]));
      var valA = dataA[p][i];
      if(va==='' || valA==null || !ya){ d.style.display='none'; continue; }
      var html = '<div style="color:'+C.a+';font-weight:600;">'+va+'</div>';
      if(D.hasRef) html += '<div style="color:'+C.b+';">'+vb+'</div>';
      d.innerHTML = html;
      var ypix = ya.l2p(valA) + ya._offset;
      d.style.left = (xpix + 8) + 'px';
      d.style.top = ypix + 'px';
      d.style.display = 'block';
    }
  }

  // ---------------- Sincronizacao de cursor ----------------
  function moveCar(i){
    if(i==null || i<0 || i>=N) return;
    Plotly.restyle(mEl, {x:[[D.mapAx[i]]], y:[[D.mapAy[i]]]}, [carIdx]);
  }
  tEl.on('plotly_hover', function(ev){
    if(!ev.points || !ev.points.length) return;
    var i = ev.points[0].pointIndex;
    moveCar(i); showTips(i);
  });
  tEl.on('plotly_unhover', hideTips);
  mEl.on('plotly_hover', function(ev){
    if(!ev.points || !ev.points.length) return;
    var p = ev.points.find(function(q){ return q.curveNumber===aIdx; }) || ev.points[0];
    var i = p.pointIndex;
    moveCar(i); showTips(i);
    var sh = baseShapes.slice();
    sh.push({type:'line', xref:'x', x0:x[i], x1:x[i], yref:'paper', y0:0, y1:1,
             line:{color:'#fff', width:1.2}});
    Plotly.relayout(tEl, {shapes: sh});
  });
  mEl.on('plotly_unhover', hideTips);

  // ---------------- Zoom (abas de setor + selecao livre) ----------------
  var secbar = document.getElementById('pw-secbar');
  var secBtns = [];
  var programmatic = false;
  function setActive(k){
    secBtns.forEach(function(b, j){
      b.style.background = (j===k) ? '#3b4a5e' : '#1f2530';
      b.style.borderColor = (j===k) ? '#ffd84d' : '#3a4350';
    });
  }
  function zoomMapTo(lo, hi){
    var b = boxForRange(lo, hi);
    Plotly.relayout(mEl, {'xaxis.range':b.x, 'yaxis.range':b.y});
    var xs=[], ys=[];
    for(var i=0;i<N;i++){ if(x[i]>=lo && x[i]<=hi){ xs.push(D.mapAx[i]); ys.push(D.mapAy[i]); } }
    Plotly.restyle(mEl, {x:[xs], y:[ys]}, [hlIdx]);
  }
  function resetMap(){
    Plotly.relayout(mEl, {'xaxis.range':fullBox.x.slice(), 'yaxis.range':fullBox.y.slice()});
    Plotly.restyle(mEl, {x:[[]], y:[[]]}, [hlIdx]);
  }
  function zoomToSector(lo, hi, k){
    programmatic = true;
    Plotly.relayout(tEl, {'xaxis.range':[lo, hi]}).then(function(){ programmatic = false; });
    zoomMapTo(lo, hi); setActive(k);
  }
  function resetZoom(){
    programmatic = true;
    Plotly.relayout(tEl, {'xaxis.range':[x[0], x[N-1]]}).then(function(){ programmatic = false; });
    resetMap(); setActive(-1);
  }
  tEl.on('plotly_relayout', function(ev){
    if(programmatic) return;
    if(ev['xaxis.autorange'] || ev['autosize']){ resetMap(); setActive(-1); return; }
    var lo = ev['xaxis.range[0]'], hi = ev['xaxis.range[1]'];
    if((lo==null || hi==null) && ev['xaxis.range']){ lo = ev['xaxis.range'][0]; hi = ev['xaxis.range'][1]; }
    if(lo==null || hi==null) return;
    zoomMapTo(lo, hi); setActive(-1);
  });

  D.sectors.forEach(function(s, k){
    var b = document.createElement('button');
    var gapCor = (s.gap<=0) ? '#34C759' : '#FF5b52';
    var gapTxt = (s.gap>=0?'+':'') + s.gap.toFixed(3);
    b.innerHTML = '<div style="font-weight:600;">S'+s.n+'</div>'+
      '<div style="font-size:12px;">'+s.timeA.toFixed(3)+'s</div>'+
      '<div style="font-size:11px;color:'+gapCor+';">'+gapTxt+'</div>';
    b.title = 'Setor '+s.n;
    b.style.cssText = 'flex:'+(s.hi-s.lo)+' 1 0;background:#1f2530;color:#ddd;'+
      'border:1px solid #3a4350;border-radius:6px;padding:6px 0;cursor:pointer;line-height:1.35;';
    b.onclick = function(){ zoomToSector(s.lo, s.hi, k); };
    secbar.appendChild(b); secBtns.push(b);
  });
  document.getElementById('pw-reset').onclick = resetZoom;
})();
</script>
"""


def build_html(data: dict, colors: dict) -> str:
    """Monta o HTML do visualizador a partir dos dados (listas) e cores."""
    return (_TEMPLATE
            .replace("__DATA__", json.dumps(data))
            .replace("__COLORS__", json.dumps(colors)))
