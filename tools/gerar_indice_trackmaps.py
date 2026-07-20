"""Gera tracks/iracing_track_maps_index.json — índice trackID -> SVGs oficiais do iRacing.

Fonte: clone esparso de github.com/meowmachine/racing-track-maps-vector (pasta
from-iracing/), esperado como pasta irmã do projeto. O clone NÃO é versionado no
PitWall; este índice guarda, por configuração, os metadados úteis + o caminho
local no vendor + a URL da pasta no CDN do iRacing (fallback/atualização).

Uso:
    python tools/gerar_indice_trackmaps.py [caminho-do-vendor]

Re-rodar após atualizar o clone do vendor (git -C <vendor> pull).
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR_PADRAO = os.path.join(os.path.dirname(RAIZ), "racing-track-maps-vector")
SAIDA = os.path.join(RAIZ, "tracks", "iracing_track_maps_index.json")
CAMADAS = ["background", "active", "inactive", "pitroad", "start-finish", "turns"]


def main() -> None:
    vendor = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else VENDOR_PADRAO
    base = os.path.join(vendor, "from-iracing")
    meta_path = os.path.join(base, "iracing-tracks-metadata.json")
    if not os.path.isfile(meta_path):
        sys.exit(f"metadata não encontrado: {meta_path}\n"
                 f"Clone o vendor primeiro (sparse, só from-iracing/):\n"
                 f"  git clone --depth 1 --filter=blob:none --sparse "
                 f"https://github.com/meowmachine/racing-track-maps-vector.git\n"
                 f"  git -C racing-track-maps-vector sparse-checkout set from-iracing")

    with open(meta_path, encoding="utf-8-sig") as f:  # o arquivo tem BOM
        meta = json.load(f)

    # semanas da temporada corrente, para marcar as pistas em uso
    temporada = {}
    temporada_path = os.path.join(RAIZ, "tracks", "temporada_2026s3.json")
    if os.path.isfile(temporada_path):
        with open(temporada_path, encoding="utf-8") as f:
            for p in json.load(f)["pistas"]:
                temporada[p["track_id"]] = {"semana": p["semana"], "slug": p["slug"]}

    configs = {}
    incompletas = []
    for t in meta["tracks"]:
        for c in t["configurations"]:
            tid = c["track_id"]
            local = c["svg_local_path"]
            faltando = [l for l in CAMADAS
                        if not os.path.isfile(os.path.join(base, local, f"{l}.svg"))]
            if faltando:
                incompletas.append((tid, faltando))
            entrada = {
                "track_name": t["track_name"],
                "config_name": c.get("track_name_and_config", t["track_name"]),
                "config_slug": c.get("config_name_short", ""),
                "category": t["category"],
                "location": t.get("location", ""),
                "latitude": t.get("latitude"),
                "longitude": t.get("longitude"),
                "length_km": round(c["track_config_length"] * 1.609344, 3)
                             if c.get("track_config_length") else None,
                "corners_per_lap": c.get("corners_per_lap"),
                "grid_stalls": c.get("grid_stalls"),
                "number_pitstalls": c.get("number_pitstalls"),
                "nominal_lap_time_s": c.get("nominal_lap_time"),
                "night_lighting": c.get("night_lighting"),
                "rain_enabled": c.get("rain_enabled"),
                "ai_enabled": c.get("ai_enabled"),
                "svg_local_path": local,          # relativo a <vendor>/from-iracing/
                "svg_cdn_url": c.get("svg_folder_url"),
            }
            if tid in temporada:
                entrada["temporada_2026s3"] = temporada[tid]
            configs[str(tid)] = entrada

    indice = {
        "fonte": "github.com/meowmachine/racing-track-maps-vector (from-iracing/)",
        "vendor_dir": os.path.relpath(base, RAIZ),
        "extraido_do_iracing_em": meta.get("generated_at"),
        "camadas": CAMADAS,
        "aviso_largura": "a faixa desenhada nos SVGs é estilizada (~40% mais larga que a real "
                         "em Winton) — NÃO usar como fonte de width_m",
        "total_configs": len(configs),
        "configs": configs,
    }
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(indice, f, ensure_ascii=False, indent=1)

    print(f"índice gravado: {SAIDA}")
    print(f"configs: {len(configs)} | camadas completas: {len(configs) - len(incompletas)}")
    if incompletas:
        print(f"⚠️ incompletas: {incompletas[:10]}")
    if temporada:
        sem_svg = [tid for tid in temporada if str(tid) not in configs]
        print(f"temporada 2026 S3: {len(temporada) - len(sem_svg)}/{len(temporada)} pistas no catálogo"
              + (f" — FALTAM: {sem_svg}" if sem_svg else ""))


if __name__ == "__main__":
    main()
