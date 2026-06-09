"""Inspeciona um arquivo .ibt: lista canais disponiveis, numero de amostras,
taxa de amostragem e uma previa dos canais que vamos usar na Fase 1."""
import sys
import irsdk


def main(path: str) -> None:
    ibt = irsdk.IBT()
    ibt.open(path)
    try:
        names = ibt.var_headers_names or []
        print(f"Arquivo: {path}")
        print(f"Total de canais: {len(names)}")

        # Quantas amostras tem o arquivo (usa SessionTime como referencia)
        session_time = ibt.get_all("SessionTime")
        n = len(session_time) if session_time else 0
        print(f"Total de amostras: {n}")
        if n > 1 and session_time:
            dur = session_time[-1] - session_time[0]
            hz = (n - 1) / dur if dur else 0
            print(f"Duracao: {dur:.1f} s   |   Taxa media: {hz:.1f} Hz")

        # Canais que pretendemos usar na Fase 1
        wanted = [
            "SessionTime", "Lap", "LapDist", "LapDistPct",
            "Speed", "Throttle", "Brake", "Clutch",
            "Gear", "RPM", "SteeringWheelAngle",
            "Lat", "Lon", "LapCurrentLapTime", "LapLastLapTime",
            "VelocityX", "VelocityY",
        ]
        print("\nCanais desejados (presente? / valor de exemplo):")
        for w in wanted:
            present = w in names
            sample = ibt.get(n // 2, w) if present and n else None
            print(f"  {w:22} {'OK ' if present else 'FALTA'}  ex={sample}")

        print("\n--- Lista completa de canais ---")
        for nm in sorted(names):
            print(f"  {nm}")
    finally:
        ibt.close()


if __name__ == "__main__":
    main(sys.argv[1])
