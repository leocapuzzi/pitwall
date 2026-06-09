"""PitWall - Dashboard da Fase 1 (so com seus dados, sem APIs).

Roda com:  streamlit run src/app.py
Le um arquivo .ibt da pasta de telemetria do iRacing, separa as voltas e mostra um
visualizador integrado (cursor sincronizado entre os graficos e o mapa, traçado
sobreposto, zoom por setor) + delta e tempo por setor OFICIAL + consistencia.
Tudo em portugues.
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import streamlit.components.v1 as components

import analysis as A
import calibration as CAL
import coaching as CO
import corners as C
import ibt_reader
import lapdata as L
import signatures as S
import store
import telemetry_view as TV
import track_model as TM

# --------------------------------------------------------------------------- #
# Configuracao da pagina
# --------------------------------------------------------------------------- #
st.set_page_config(page_title="PitWall", page_icon="🏁", layout="wide")

# Pasta da telemetria real (PC com iRacing). Pode ser trocada pela variavel de
# ambiente PITWALL_TELEMETRY_DIR (util ao rodar de outra maquina/servidor).
TELEMETRY_DIR = Path(os.environ.get("PITWALL_TELEMETRY_DIR")
                     or Path(os.path.expanduser("~")) / "Documents" / "iRacing" / "telemetry")
PROJ_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # raiz do projeto
# Amostras versionadas (vao no GitHub): usadas quando nao ha telemetria real
# (ex.: Mac em desenvolvimento, sem a pasta do iRacing).
SAMPLES_DIR = Path(PROJ_DIR) / "samples"

# Paleta por VOLTA (nao por canal), igual ao Garage61:
# sua volta / BEST / voce = VERMELHO; media / referencia = AZUL.
COR_A = "#E8412A"   # sua volta (BEST / voce)
COR_B = "#2E86FF"   # referencia (AVG / outro)


# --------------------------------------------------------------------------- #
# Carregamento (com cache por arquivo+data de modificacao)
# --------------------------------------------------------------------------- #
@st.cache_data(show_spinner="Lendo telemetria...")
def carregar(path: str, _mtime: float) -> pd.DataFrame:
    return ibt_reader.load_ibt(path)


@st.cache_data(show_spinner=False)
def carregar_sessao(path: str, _mtime: float) -> dict:
    return ibt_reader.load_session_info(path)


def listar_ibt(dir_: Path) -> list[Path]:
    if not dir_.exists():
        return []
    return sorted(dir_.glob("*.ibt"), key=lambda p: p.stat().st_mtime, reverse=True)


def setores_genericos(starts) -> bool:
    """True se os 'setores' forem fracoes IGUAIS (fallback do iRacing p/ sessoes
    offline), e nao os setores oficiais da pista. Ex.: [0, .25, .5, .75]."""
    if not starts or len(starts) < 2:
        return False
    difs = np.diff(list(starts) + [1.0])
    return bool(np.allclose(difs, difs[0], atol=0.01))


# --------------------------------------------------------------------------- #
# Sidebar: escolha do arquivo e das voltas
# --------------------------------------------------------------------------- #
st.sidebar.title("🏁 PitWall")
st.sidebar.caption("Debriefing de telemetria — Fase 1")

arquivos = listar_ibt(TELEMETRY_DIR)
dir_usado = TELEMETRY_DIR
if not arquivos:
    amostras = listar_ibt(SAMPLES_DIR)
    if amostras:
        arquivos, dir_usado = amostras, SAMPLES_DIR
        st.sidebar.info("Sem telemetria real aqui — usando as amostras de exemplo (samples/).")
if arquivos:
    nomes = [p.name for p in arquivos]
    escolha = st.sidebar.selectbox("Sessao (.ibt)", nomes, index=0)
    path = str(dir_usado / escolha)
else:
    st.sidebar.warning(f"Nenhum .ibt em {TELEMETRY_DIR}")
    path = st.sidebar.text_input("Caminho do arquivo .ibt", value="")

path_manual = st.sidebar.text_input("...ou cole um caminho", value="")
if path_manual.strip():
    path = path_manual.strip()

if not path or not os.path.exists(path):
    st.title("PitWall")
    st.info("Escolha um arquivo de telemetria (.ibt) na barra lateral para comecar.")
    st.stop()

mtime = os.path.getmtime(path)
df = carregar(path, mtime)
sessao = carregar_sessao(path, mtime)
setores = ibt_reader.sector_starts(sessao)      # inicios dos setores OFICIAIS (0..1)
resumo = ibt_reader.session_summary(sessao)      # pista, carro, etc.

# Modelo da pista (curvas reais numeradas), achado pelo TrackID. None = modo auto.
try:
    modelo_pista = TM.load_model(resumo.get("track_id"), resumo.get("config"))
except Exception:
    modelo_pista = None

max_off = st.sidebar.slider(
    "Tolerancia p/ volta limpa (% acima da melhor)", 100, 120, 107, 1,
    help="Voltas mais lentas que este limite saem da media (erros, saidas).",
) / 100.0

infos = A.split_laps(df)
validas = [i for i in infos if i.valid]

if not validas:
    st.title("PitWall")
    st.error("Nenhuma volta completa/valida encontrada neste arquivo. "
             "Pode ser uma sessao muito curta ou so de pit/treino parado.")
    st.dataframe(A.laps_table(infos))
    st.stop()

best = A.best_lap(infos)
limpas = A.clean_laps(infos, max_off)
avg = A.build_average_lap(df, limpas)

# Histórico: salva a sessão (idempotente). Nunca quebra o dashboard.
try:
    _meta = ibt_reader.session_meta(sessao)
    _res = store.save_session(PROJ_DIR, path, mtime, _meta, infos, df)
    if _res.get("new"):
        st.sidebar.caption(f"📁 Sessão salva no histórico ({_res['n_valid']} voltas).")
    else:
        st.sidebar.caption("📁 Sessão já no histórico.")
except Exception:
    st.sidebar.caption("⚠️ Histórico indisponível nesta sessão.")

# --- Selecao de comparacao ---
st.sidebar.divider()
modo = st.sidebar.radio(
    "Análise",
    ["BEST vs AVG", "Comparar duas voltas"],
    help="BEST vs AVG: sua melhor volta (vermelho) vs sua média (azul). "
         "Comparar duas voltas: escolha A (vermelho) e B (azul). "
         "(Comparar com outro piloto chega na Fase 2 com o Garage61.)",
)

opcoes_voltas = [i.lap for i in validas]
def rotulo(lap: int) -> str:
    info = next(x for x in infos if x.lap == lap)
    extra = " (melhor)" if lap == best else ""
    return f"Volta {lap} — {A.fmt_laptime(info.lap_time)}{extra}"

if modo == "Comparar duas voltas":
    lap_a = st.sidebar.selectbox("Volta A (azul)", opcoes_voltas,
                                 index=opcoes_voltas.index(best), format_func=rotulo)
    outras = [l for l in opcoes_voltas if l != lap_a]
    lap_b = st.sidebar.selectbox("Volta B (laranja)", outras, format_func=rotulo)
    usar_media = False
else:
    lap_a = best
    lap_b = None
    usar_media = True

mostrar_curvas = st.sidebar.checkbox("Marcar curvas detectadas", value=True)
n_set = len(setores) if setores else 0
set_genericos = setores_genericos(setores)
if n_set and not set_genericos:
    st.sidebar.caption(f"Setores oficiais da pista: **{n_set}** (SplitTimeInfo)")
elif n_set and set_genericos:
    st.sidebar.caption(f"⚠️ O arquivo traz só **{n_set} setores genéricos** (frações iguais), "
                       "não os oficiais. Os 3 setores reais serão cadastrados no modelo da pista.")
else:
    st.sidebar.caption("Sem setores no arquivo — usando 3 iguais.")

# --------------------------------------------------------------------------- #
# Preparo dos dados de A e da referencia (B ou media)
# --------------------------------------------------------------------------- #
grid = A.GRID
seg_a = A.lap_frame(df, lap_a)
info_a = next(x for x in infos if x.lap == lap_a)
canais_a = {c: A.resample_channel(seg_a, c, grid) for c in A.TRACE_CHANNELS if c in df.columns}

if usar_media:
    ref_label = f"Media ({len(avg.laps_used)} voltas)"
    ref_time = avg.lap_time
    ref_canais = avg.channels
    delta = A.delta_vs_average(df, lap_a, avg, grid)
else:
    info_b = next(x for x in infos if x.lap == lap_b)
    ref_label = f"Volta {lap_b}"
    ref_time = info_b.lap_time
    seg_b = A.lap_frame(df, lap_b)
    ref_canais = {c: A.resample_channel(seg_b, c, grid) for c in A.TRACE_CHANNELS if c in df.columns}
    delta = A.delta_by_distance(df, lap_a, lap_b, grid)

a_label = f"Volta {lap_a}" + (" (melhor)" if lap_a == best else "")
# Marcadores de curva no mapa: usa as curvas REAIS do modelo da pista se houver;
# senao, detecta pelo tracado de velocidade.
if not mostrar_curvas:
    curvas = []
elif modelo_pista and modelo_pista.get("corners"):
    curvas = TM.apex_pcts(modelo_pista)
else:
    curvas = A.detect_corners(canais_a.get("SpeedKph", np.array([])))

# --------------------------------------------------------------------------- #
# Cabecalho com metricas
# --------------------------------------------------------------------------- #
st.title("🏁 PitWall — Debriefing")
pista = resumo.get("track") or "?"
if resumo.get("config"):
    pista += f" ({resumo['config']})"
carro = resumo.get("car") or "?"
comp = f" · {resumo['length']}" if resumo.get("length") else ""
st.caption(f"🏎️ **{carro}**  ·  📍 **{pista}**{comp}")
st.caption(f"Arquivo: `{os.path.basename(path)}`  ·  {len(infos)} voltas gravadas  ·  "
           f"{len(validas)} validas")

c1, c2, c3, c4 = st.columns(4)
c1.metric(f"🟥 {a_label}", A.fmt_laptime(info_a.lap_time))
c2.metric(f"🟦 {ref_label}", A.fmt_laptime(ref_time))
c3.metric("Diferenca total", f"{delta[-1]:+.3f}s",
          help="Negativo = A mais rapida que a referencia.")
c4.metric("Voltas limpas", f"{len(limpas)}",
          help=f"Usadas na media: {limpas}")


# --------------------------------------------------------------------------- #
# Visualizador integrado: graficos (delta/vel/acel-freio/volante) + mapa,
# com cursor sincronizado, traçado sobreposto e zoom por setor.
# --------------------------------------------------------------------------- #
def _proj(lat, lon, lat0, lon0):
    """Projeta lat/lon (graus) para metros centrados, p/ o mapa sair sem distorcer."""
    R = 111320.0
    mx = (np.asarray(lon, float) - lon0) * np.cos(np.radians(lat0)) * R
    my = (np.asarray(lat, float) - lat0) * R
    return mx, my


# Eixo X em DISTANCIA real (metros) quando disponivel; senao, % da volta.
if "LapDist" in df.columns:
    x_axis = A.resample_channel(seg_a, "LapDist", grid)
    x_unit = "m"
else:
    x_axis = grid * 100.0
    x_unit = "%"
length_x = float(x_axis[-1]) if np.isfinite(x_axis[-1]) else 100.0

# Coordenadas do mapa: sua volta (A) e referencia, na mesma origem.
lat_a = A.resample_channel(seg_a, "Lat", grid)
lon_a = A.resample_channel(seg_a, "Lon", grid)
lat0, lon0 = float(np.nanmean(lat_a)), float(np.nanmean(lon_a))
ax, ay = _proj(lat_a, lon_a, lat0, lon0)
ref_lat, ref_lon = ref_canais.get("Lat"), ref_canais.get("Lon")
if ref_lat is not None and ref_lon is not None:
    rx, ry = _proj(ref_lat, ref_lon, lat0, lon0)
else:
    rx, ry = ax, ay

# Tempos e gaps por setor (alimentam as abas de setor embaixo).
t_a = A.sector_times(A.time_to_distance(seg_a, grid), setores, grid)
if usar_media:
    t_ref = A.sector_times(avg.time_to_dist, setores, grid)
else:
    t_ref = A.sector_times(A.time_to_distance(A.lap_frame(df, lap_b), grid), setores, grid)

# Setores e curvas nas unidades do eixo X (metros ou %).
edges = A.sector_edges(setores, 3)
sectors_x = []
for i in range(len(edges) - 1):
    sectors_x.append({
        "n": i + 1,
        "lo": float(edges[i] * length_x),
        "hi": float(edges[i + 1] * length_x),
        "timeA": float(t_a[i]) if i < len(t_a) else 0.0,
        "gap": float(t_a[i] - t_ref[i]) if (i < len(t_a) and i < len(t_ref)) else 0.0,
    })
corners_x = [float(c * length_x) for c in curvas]


def _ch(d, key, scale=1.0):
    """Canal escalado, ou array vazio se ausente."""
    return d[key] * scale if key in d else np.array([])


steerA_deg = np.degrees(canais_a["SteeringWheelAngle"]) if "SteeringWheelAngle" in canais_a else np.array([])
steerRef_deg = np.degrees(ref_canais["SteeringWheelAngle"]) if "SteeringWheelAngle" in ref_canais else np.array([])

dados = {
    "x": TV.clean(x_axis),
    "xUnit": x_unit,
    "speedA": TV.clean(_ch(canais_a, "SpeedKph")),
    "speedRef": TV.clean(_ch(ref_canais, "SpeedKph")),
    "thrA": TV.clean(_ch(canais_a, "Throttle", 100)),
    "thrRef": TV.clean(_ch(ref_canais, "Throttle", 100)),
    "brkA": TV.clean(_ch(canais_a, "Brake", 100)),
    "brkRef": TV.clean(_ch(ref_canais, "Brake", 100)),
    "gearA": TV.clean(np.round(_ch(canais_a, "Gear"))),
    "gearRef": TV.clean(np.round(_ch(ref_canais, "Gear"))),
    "steerA": TV.clean(steerA_deg),
    "steerRef": TV.clean(steerRef_deg),
    "steerTextA": TV.steer_text(steerA_deg),
    "steerTextRef": TV.steer_text(steerRef_deg),
    "mapAx": TV.clean(ax), "mapAy": TV.clean(ay),
    "mapRefx": TV.clean(rx), "mapRefy": TV.clean(ry),
    "sectors": sectors_x,
    "corners": corners_x,
    "labelA": a_label,
    "labelRef": ref_label,
    "hasRef": True,
}
cores = {"a": COR_A, "b": COR_B}
components.html(TV.build_html(dados, cores), height=740, scrolling=False)

# --------------------------------------------------------------------------- #
# Delta por setor oficial (visao em barras)
# --------------------------------------------------------------------------- #
if setores and not set_genericos:
    titulo_set = "Delta por setor oficial"
elif setores:
    titulo_set = f"Delta por setor (genérico — {len(setores)} frações iguais)"
else:
    titulo_set = "Delta por setor (3 iguais)"
st.subheader(titulo_set)
seg_df = A.segment_deltas(delta, setores, grid)
cores_bar = ["#FF3B30" if d > 0 else "#34C759" for d in seg_df["delta_s"]]
bar = go.Figure(go.Bar(
    x=[f"S{n}" for n in seg_df["setor"]], y=seg_df["delta_s"], marker_color=cores_bar,
    text=[f"{d:+.3f}" for d in seg_df["delta_s"]], textposition="outside",
    hovertemplate="Setor %{x}<br>Δ=%{y:+.3f}s<extra></extra>"))
bar.add_hline(y=0, line=dict(color="#aaa", width=1))
bar.update_layout(height=300, xaxis_title="Setor",
                  yaxis_title="Δ tempo (s)  (vermelho = perdeu)",
                  margin=dict(t=20, b=40, l=50, r=20))
st.plotly_chart(bar, width="stretch")

# --------------------------------------------------------------------------- #
# Analise por curva (coaching) — onde a volta mais lenta perde para a referencia
# --------------------------------------------------------------------------- #
st.subheader("Análise por curva (coaching)")

# Quais voltas sao a REFERENCIA (mais rapida) e a "aluna" (mais lenta).
if usar_media:
    fast_laps, fast_label = [best], a_label
    slow_laps, slow_label = list(avg.laps_used), ref_label
elif info_a.lap_time <= info_b.lap_time:
    fast_laps, fast_label, slow_laps, slow_label = [lap_a], a_label, [lap_b], ref_label
else:
    fast_laps, fast_label, slow_laps, slow_label = [lap_b], ref_label, [lap_a], a_label

length_m = length_x if x_unit == "m" else None
sig_fast = S.signals_from_laps(df, fast_laps, grid)
sig_slow = S.signals_from_laps(df, slow_laps, grid)
# Calibra os sinais (regra de ouro) na volta de referencia e aplica aos dois,
# para body slip / under-oversteer nunca virem com a polaridade trocada.
_signs = CAL.calibrate_signs(sig_fast)
sig_fast = S.enrich(CAL.apply_signs(sig_fast, _signs))
sig_slow = S.enrich(CAL.apply_signs(sig_slow, _signs))

spd_ref = sig_fast.get("SpeedKph")
if modelo_pista and modelo_pista.get("corners"):
    regioes = C.regions_from_apexes(spd_ref, grid, TM.apex_pcts(modelo_pista),
                                    TM.corner_names(modelo_pista))
    origem = f"modelo da pista — {len(regioes)} curvas reais"
else:
    regioes = C.detect_corner_regions(spd_ref, grid)
    origem = f"{len(regioes)} curvas detectadas automaticamente"

if not regioes:
    st.info("Não consegui detectar curvas claras nesta volta (sessão curta ou sem variação de velocidade).")
else:
    delta_coach = sig_slow["time_to_dist"] - sig_fast["time_to_dist"]  # + = mais lenta perde
    linhas = S.analyze_corners(sig_slow, sig_fast, regioes, delta_coach, length_m)
    st.caption(f"Comparando **{slow_label}** (mais lenta) com **{fast_label}** (referência) "
               f"— {origem}. Cada curva cruza freio, volante, guinada, deriva, "
               "velocidade por roda, ABS e zebra. Δ tempo positivo = onde a mais lenta perde; "
               "Entrada/Saída mostram em que fase da curva.")

    piores = sorted(linhas, key=lambda r: r["dt"], reverse=True)[:3]
    cols = st.columns(len(piores))
    for col, r in zip(cols, piores):
        col.metric(f"🔴 {r['name']} (ápice {r['apex_pct']:.0f}%)",
                   f"{r['dt']:+.2f}s", help=r["coach"])

    st.dataframe(S.corner_table(linhas), width="stretch", hide_index=True)

    # Scorecard da volta (medias por fase, DIAG-07).
    sc = CO.lap_scorecard(linhas)
    if sc:
        scol = st.columns(5)
        scol[0].metric("Agressão de freio", f"{sc.get('brake_aggression', 0)*100:.0f}%",
                       help="Quão perto do máximo de frenagem do carro (100% = no limite).")
        scol[1].metric("Trail-braking", f"{sc.get('trail_overlap', 0)*100:.0f}%",
                       help="Fração do turn-in com freio ainda aplicado (gera rotação).")
        scol[2].metric("Uso do grip", f"{sc.get('circle_use', 0)*100:.0f}%",
                       help="Uso médio do círculo de atrito nas curvas (100% = no limite).")
        scol[3].metric("Rotação", f"{sc.get('rotation_eff', 0):.2f}",
                       help="Guinada por unidade de volante (maior = o carro roda melhor).")
        scol[4].metric("Tempo morto", f"{sc.get('coasting_total_s', 0):.1f}s",
                       help="Soma de coasting (sem freio nem acelerador) nas curvas. Alvo: ~0.")

    # Insights priorizados (DIAG-06 + DIAG-05).
    insights = CO.build_insights(linhas, regioes, length_m)
    st.markdown("**🎯 Onde focar — insights priorizados** (por tempo perdido × reta seguinte):")
    if not insights:
        st.markdown("- Volta muito consistente com a referência. 👏")
    for ins in insights[:6]:
        st.markdown(f"**{ins['what']}** · ápice {ins['apex_pct']:.0f}% · "
                    f"custo **{ins['cost_s']:.2f}s**"
                    + (f" · reta seguinte ~{ins['straight_m']:.0f} m" if ins['straight_m'] > 5 else ""))
        st.markdown(f"&nbsp;&nbsp;• **Por quê:** {ins['why']}")
        st.markdown(f"&nbsp;&nbsp;• **Como corrigir:** {ins['fix']}")
        st.markdown(f"&nbsp;&nbsp;• **Como validar:** {ins['validate']}")

    with st.expander("🔍 Detalhe por curva (fase + sinais cruzados)"):
        for r in linhas:
            sinais = S.flags_label(r["flags"]) if r["flags"] else "—"
            st.markdown(
                f"**{r['name']}** · ápice {r['apex_pct']:.0f}%  ·  "
                f"Δ **{r['dt']:+.2f}s** (entrada {r['dt_entry']:+.2f} · saída {r['dt_exit']:+.2f})  ·  "
                f"sinais: {sinais}")
            st.caption(r["coach"])

    if modelo_pista and modelo_pista.get("corners"):
        st.caption(f"Curvas reais da pista (modelo de {modelo_pista.get('n_corners', len(regioes))} "
                   "curvas). Sinais detectados cruzando vários canais a 60 Hz — ver ANALISES.md.")
    else:
        st.caption("Curvas detectadas pelo traçado de velocidade. Esta pista ainda não tem modelo cadastrado.")

# --------------------------------------------------------------------------- #
# Consistencia: tempos de todas as voltas
# --------------------------------------------------------------------------- #
st.subheader("Consistencia — tempo por volta")
tbl = A.laps_table(infos)
val = tbl[tbl["valid"]]
cores_v = [COR_A if l == best else ("#bbb" if l not in limpas else COR_B)
           for l in val["lap"]]
cons = go.Figure(go.Bar(
    x=val["lap"], y=val["lap_time"], marker_color=cores_v,
    text=[A.fmt_laptime(t) for t in val["lap_time"]], textposition="outside",
    hovertemplate="Volta %{x}<br>%{text}<extra></extra>"))
cons.add_hline(y=avg.lap_time, line=dict(color=COR_B, dash="dash"),
               annotation_text=f"media {A.fmt_laptime(avg.lap_time)}")
cons.update_layout(height=320, xaxis_title="Volta", yaxis_title="Tempo (s)",
                   margin=dict(t=20, b=40, l=50, r=20))
st.plotly_chart(cons, width="stretch")
st.caption("Vermelho = melhor volta · Azul = entrou na média · Cinza = fora da média (mais lenta que o limite)")

# --------------------------------------------------------------------------- #
# Tabela de voltas (detalhe)
# --------------------------------------------------------------------------- #
with st.expander("Tabela de voltas (detalhe)"):
    show = tbl.copy()
    show["tempo"] = show["lap_time"].map(A.fmt_laptime)
    show = show[["lap", "tempo", "n_samples", "complete", "on_pit", "valid"]]
    show.columns = ["Volta", "Tempo", "Amostras", "Completa", "No pit", "Valida"]
    st.dataframe(show, width="stretch", hide_index=True)

# --------------------------------------------------------------------------- #
# Historico de sessoes (fundacao p/ evolucao ao longo do tempo)
# --------------------------------------------------------------------------- #
with st.expander("📁 Histórico de sessões (acumulando para a Fase 2)"):
    try:
        hist = store.list_sessions(PROJ_DIR)
        if hist is not None and not hist.empty:
            st.dataframe(hist, width="stretch", hide_index=True)
            st.caption("Cada sessão guarda carro, pista, condições e o setup do carro. "
                       "Isso vira a base de progresso/PB e do coach de IA.")
        else:
            st.info("Ainda sem sessões guardadas.")
    except Exception:
        st.info("Histórico indisponível.")
