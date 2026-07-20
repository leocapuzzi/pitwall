"""Leitura de arquivos .ibt do iRacing para um DataFrame do pandas.

Usa a classe IBT do pyirsdk (le offline, sem o sim aberto).
"""
from __future__ import annotations

import os
import re

import irsdk
import pandas as pd
import yaml

# Codificacao do YAML de sessao dentro do .ibt (definida pelo iRacing).
_YAML_CODE_PAGE = "cp1252"
# Mantem so caracteres imprimiveis (o bloco YAML pode ter lixo binario no fim).
_NON_PRINTABLE = re.compile(r"[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]")

# Canais que a Fase 1 usa. Lemos so o que existe no arquivo (alguns carros
# nao expoem todos). A ordem aqui e so organizacional.
CHANNELS = [
    "SessionTime",          # tempo absoluto da sessao (s) -> base p/ tempos de volta
    "Lap",                  # numero da volta (incrementa na linha de chegada)
    "LapDist",              # distancia percorrida na volta (m)
    "LapDistPct",           # fracao da volta percorrida (0..1) -> eixo de alinhamento
    "LapCurrentLapTime",    # tempo decorrido da volta atual (s)
    "LapLastLapTime",       # tempo oficial da ultima volta fechada (s)
    "Speed",                # velocidade (m/s)
    "Throttle",             # acelerador (0..1)
    "Brake",                # freio (0..1)
    "Clutch",               # embreagem (0..1)
    "Gear",                 # marcha
    "RPM",                  # rotacao do motor
    "SteeringWheelAngle",   # angulo do volante (rad)
    "Lat",                  # latitude (graus) -> mapa da pista
    "Lon",                  # longitude (graus)
    "VelocityX",            # velocidade no eixo X do carro (m/s)
    "VelocityY",            # velocidade no eixo Y do carro (m/s)
    "LongAccel",            # aceleracao longitudinal (m/s2)
    "LatAccel",             # aceleracao lateral (m/s2)
    "OnPitRoad",            # 1 se estiver no pit lane -> exclui out/in-lap
    "IsOnTrack",            # 1 se o carro esta na pista (nao no box/garagem)
    "LapBestLapTime",       # melhor volta da sessao segundo o iRacing (s)
    "PlayerTrackSurface",   # superficie (pista/grama/areia) -> detecta saidas
    # --- Canais avancados (motor de "assinatura por curva", ver ANALISES.md) ---
    "YawRate",              # taxa de guinada (rad/s) -> rotacao do carro
    "VelocityZ",            # 3o eixo (completa o vetor velocidade)
    "SteeringWheelTorque",  # torque no volante (N*m) -> sentir grip dianteiro (FFB)
    "VertAccel",            # aceleracao vertical (m/s2) -> zebra/buraco/crista
    "Pitch", "Roll", "RollRate",  # atitude do chassi (mergulho/rolagem/transicao)
    "BrakeABSactive",       # 1 quando o ABS esta cortando -> freou alem do limite
    "LFspeed", "RFspeed", "LRspeed", "RRspeed",  # velocidade por roda -> trava/patina
    "LFbrakeLinePress", "RFbrakeLinePress",      # pressao de freio por roda -> bias
    "LRbrakeLinePress", "RRbrakeLinePress",
    "TireLF_RumblePitch", "TireRF_RumblePitch",  # vibracao de zebra (Hz) -> comeu zebra
    "TireLR_RumblePitch", "TireRR_RumblePitch",
    # --- Canais p/ operacionalizar a base de conhecimento (pitwall_pilotagem.md) ---
    "ThrottleRaw", "BrakeRaw",  # inputs BRUTOS (pe) -> brusquidao, processamento/ABS
    "PitchRate",                # arfagem -> transient de transferencia long.
    "ShiftIndicatorPct",        # proximidade do shift ideal -> short-shift
    "LapDeltaToBestLap", "LapDeltaToSessionBestLap",  # delta vivo do proprio iRacing
    "FuelLevel",                # combustivel (estrategia/stint)
    # Temperatura de SUPERFICIE por roda (interno/meio/externo) -> camber/pressao/janela
    "LFtempL", "LFtempM", "LFtempR", "RFtempL", "RFtempM", "RFtempR",
    "LRtempL", "LRtempM", "LRtempR", "RRtempL", "RRtempM", "RRtempR",
    # Pressao ao vivo por roda
    "LFpressure", "RFpressure", "LRpressure", "RRpressure",
    # Amortecedores e altura por roda -> transferencia de carga, transient, bottoming
    "LFshockVel", "RFshockVel", "LRshockVel", "RRshockVel",
    "LFshockDefl", "RFshockDefl", "LRshockDefl", "RRshockDefl",
    "LFrideHeight", "RFrideHeight", "LRrideHeight", "RRrideHeight",
]


def load_ibt(path: str) -> pd.DataFrame:
    """Le um .ibt e devolve um DataFrame com uma linha por amostra (~60 Hz).

    Apenas os canais presentes no arquivo sao incluidos.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    ibt = irsdk.IBT()
    ibt.open(path)
    try:
        names = set(ibt.var_headers_names or [])
        data: dict[str, list] = {}
        for ch in CHANNELS:
            if ch in names:
                values = ibt.get_all(ch)
                if values is not None:
                    data[ch] = values
        if not data:
            raise ValueError("Nenhum canal conhecido encontrado no arquivo.")
        df = pd.DataFrame(data)
    finally:
        ibt.close()

    # Converte velocidade para km/h num canal extra, mais intuitivo.
    if "Speed" in df.columns:
        df["SpeedKph"] = df["Speed"] * 3.6
    # Fracao da volta em porcentagem, mais legivel nos eixos.
    if "LapDistPct" in df.columns:
        df["LapPct"] = df["LapDistPct"] * 100.0
    return df


def list_channels(path: str) -> list[str]:
    """Lista os nomes de canais disponiveis num arquivo .ibt."""
    ibt = irsdk.IBT()
    ibt.open(path)
    try:
        return sorted(ibt.var_headers_names or [])
    finally:
        ibt.close()


def load_session_info(path: str) -> dict:
    """Le e parseia o YAML de sessao gravado no cabecalho do .ibt.

    A classe IBT do pyirsdk NAO parseia esse YAML sozinha (so a versao 'ao vivo'
    faz). Aqui lemos os bytes do bloco (offset/comprimento no header) e parseamos
    com PyYAML. Devolve {} se nao for possivel.

    Contem, entre outras coisas:
      - SplitTimeInfo.Sectors -> setores OFICIAIS da pista (inicio de cada setor em %)
      - WeekendInfo           -> pista, comprimento, etc.
      - DriverInfo            -> carros e pilotos
    """
    ibt = irsdk.IBT()
    ibt.open(path)
    try:
        h = ibt._header
        start = h.session_info_offset
        end = start + h.session_info_len
        raw = ibt._shared_mem[start:end].rstrip(b"\x00")
        text = _NON_PRINTABLE.sub("", raw.decode(_YAML_CODE_PAGE, errors="replace"))
        data = yaml.safe_load(text)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}
    finally:
        ibt.close()


def sector_starts(session_info: dict) -> list[float]:
    """Inicio de cada setor OFICIAL (fracao 0..1), a partir do SplitTimeInfo.

    Ex.: Interlagos -> [0.0, 0.278, 0.431, 0.609, 0.725]. Sempre comeca em 0.0.
    Devolve [] se o arquivo nao trouxer setores.
    """
    try:
        sectors = session_info["SplitTimeInfo"]["Sectors"]
        starts = sorted(float(s["SectorStartPct"]) for s in sectors)
        if starts and starts[0] > 1e-6:
            starts = [0.0] + starts
        return starts
    except (KeyError, TypeError, ValueError):
        return []


def session_summary(session_info: dict) -> dict:
    """Resumo legivel: pista, configuracao, comprimento e carro do piloto."""
    wk = session_info.get("WeekendInfo", {}) or {}
    di = session_info.get("DriverInfo", {}) or {}
    drivers = di.get("Drivers", []) or []
    my_idx = di.get("DriverCarIdx")
    car = None
    car_id = None
    for d in drivers:
        if d.get("CarIdx") == my_idx:
            car = d.get("CarScreenName")
            car_id = d.get("CarID")
            break
    return {
        "track": wk.get("TrackDisplayName"),
        "config": wk.get("TrackConfigName"),
        "length": wk.get("TrackLength"),
        "track_id": wk.get("TrackID"),
        "car": car,
        "car_id": car_id,
    }


# Chaves de condicao climatica/pista que valem guardar (as presentes serao salvas).
_COND_KEYS = [
    "TrackAirTemp", "TrackSurfaceTemp", "TrackSkies", "TrackCleanup",
    "TrackWetness", "TrackAirPressure", "TrackWindVel", "TrackWindDir",
    "TempUnits", "WeatherType",
]


def session_meta(session_info: dict) -> dict:
    """Metadados ricos da sessao para o historico: pista, carro, piloto,
    condicoes e SETUP do carro. Tudo que e caro reconstruir depois."""
    s = session_summary(session_info)
    di = session_info.get("DriverInfo", {}) or {}
    drivers = di.get("Drivers", []) or []
    my_idx = di.get("DriverCarIdx")
    driver = None
    for d in drivers:
        if d.get("CarIdx") == my_idx:
            driver = d.get("UserName")
            break
    wk = session_info.get("WeekendInfo", {}) or {}
    conditions = {k: wk.get(k) for k in _COND_KEYS if wk.get(k) is not None}
    return {
        "track": s["track"], "config": s["config"], "length": s["length"],
        "car": s["car"], "driver": driver,
        "conditions": conditions,
        "setup": session_info.get("CarSetup"),
    }
