"""Historico local de sessoes e voltas (SQLite + Parquet).

Fundacao para a evolucao de performance ao longo do tempo (PB, tendencias, e o
coach de IA da Fase 3). Guarda, para CADA sessao:
  - metadados que nao voltam: carro, pista, condicoes e SETUP do carro;
  - uma linha por volta (tempo, valida, pit) no SQLite;
  - os canais de cada volta valida, ja alinhados por distancia, num Parquet
    (compacto, pronto para sobrepor/comparar entre sessoes).

E idempotente: a mesma sessao (arquivo + data de modificacao) nao e duplicada.
Qualquer erro aqui NAO deve quebrar o dashboard (o app chama dentro de try/except).
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import sqlite3

import pandas as pd

import lapdata as L

# Canais guardados por volta (alinhados por distancia).
_STORE_CHANNELS = [
    "SpeedKph", "Throttle", "Brake", "Gear", "RPM",
    "SteeringWheelAngle", "Lat", "Lon", "LongAccel", "LatAccel",
]


def _paths(base_dir: str):
    data = os.path.join(base_dir, "data")
    laps = os.path.join(data, "laps")
    os.makedirs(laps, exist_ok=True)
    return os.path.join(data, "pitwall.db"), laps


def _connect(base_dir: str) -> sqlite3.Connection:
    db_path, _ = _paths(base_dir)
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions(
            id INTEGER PRIMARY KEY,
            file TEXT, mtime REAL, recorded_at TEXT,
            track TEXT, track_config TEXT, track_length TEXT,
            car TEXT, driver TEXT,
            conditions_json TEXT, setup_json TEXT,
            n_laps INTEGER, n_valid INTEGER, best_lap REAL,
            UNIQUE(file, mtime)
        )""")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS laps(
            id INTEGER PRIMARY KEY,
            session_id INTEGER,
            lap_number INTEGER, lap_time REAL, valid INTEGER, on_pit INTEGER,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )""")
    return conn


def save_session(base_dir: str, file_path: str, mtime: float,
                 meta: dict, infos: list, df) -> dict:
    """Salva a sessao no historico (idempotente). Devolve {id, new, ...}."""
    conn = _connect(base_dir)
    try:
        cur = conn.execute("SELECT id FROM sessions WHERE file=? AND mtime=?",
                           (file_path, mtime))
        row = cur.fetchone()
        if row:
            return {"id": row[0], "new": False}

        valid = [i for i in infos if i.valid]
        best = min((i.lap_time for i in valid), default=None)
        recorded = _dt.datetime.fromtimestamp(mtime).isoformat(timespec="seconds")
        cur = conn.execute(
            """INSERT INTO sessions(file, mtime, recorded_at, track, track_config,
               track_length, car, driver, conditions_json, setup_json,
               n_laps, n_valid, best_lap)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (file_path, mtime, recorded, meta.get("track"), meta.get("config"),
             str(meta.get("length")), meta.get("car"), meta.get("driver"),
             json.dumps(meta.get("conditions") or {}, default=str),
             json.dumps(meta.get("setup") or {}, default=str),
             len(infos), len(valid), best))
        sid = cur.lastrowid

        for i in infos:
            lt = i.lap_time if (i.lap_time == i.lap_time) else None  # NaN -> None
            conn.execute(
                "INSERT INTO laps(session_id, lap_number, lap_time, valid, on_pit) VALUES(?,?,?,?,?)",
                (sid, int(i.lap), lt, int(i.valid), int(i.on_pit)))
        conn.commit()

        # Canais das voltas validas, alinhados por distancia -> Parquet.
        frames = []
        for i in valid:
            lap = L.build_lap(df, i.lap, meta, lap_time=i.lap_time)
            d = {"lap_number": i.lap, "pct": lap.grid * 100.0,
                 "time_to_dist": lap.time_to_dist}
            for c in _STORE_CHANNELS:
                if c in lap.channels:
                    d[c] = lap.channels[c]
            frames.append(pd.DataFrame(d))
        if frames:
            _, laps_dir = _paths(base_dir)
            pd.concat(frames, ignore_index=True).to_parquet(
                os.path.join(laps_dir, f"{sid}.parquet"), index=False)

        return {"id": sid, "new": True, "n_laps": len(infos), "n_valid": len(valid)}
    finally:
        conn.close()


def list_sessions(base_dir: str) -> pd.DataFrame:
    """Lista as sessoes guardadas (mais recentes primeiro)."""
    db_path, _ = _paths(base_dir)
    if not os.path.exists(db_path):
        return pd.DataFrame()
    conn = sqlite3.connect(db_path)
    try:
        return pd.read_sql_query(
            """SELECT recorded_at AS Data, car AS Carro, track AS Pista,
                      n_valid AS 'Voltas válidas', best_lap AS 'Melhor (s)'
               FROM sessions ORDER BY mtime DESC""", conn)
    except Exception:
        return pd.DataFrame()
    finally:
        conn.close()


def load_session_laps(base_dir: str, session_id: int) -> pd.DataFrame:
    """Carrega os canais (alinhados por distancia) de uma sessao guardada."""
    _, laps_dir = _paths(base_dir)
    fp = os.path.join(laps_dir, f"{session_id}.parquet")
    return pd.read_parquet(fp) if os.path.exists(fp) else pd.DataFrame()
