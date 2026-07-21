"""Smoke test dos .ibt de exemplo em samples/.

Trava o LEITOR + separador de voltas contra regressões (não quebrar ao ler os
arquivos versionados). NÃO afirma que os samples geram uma sessão completa — hoje
eles não têm voltas válidas (P0 conhecido); quando um sample bom de 3+ voltas
entrar, dá para promover este teste para exigir um payload válido.
"""
import glob
import os

import pytest

import analysis as A
import ibt_reader

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES = sorted(glob.glob(os.path.join(_ROOT, "samples", "*.ibt")))


@pytest.mark.skipif(not SAMPLES, reason="sem samples versionados")
@pytest.mark.parametrize("path", SAMPLES, ids=[os.path.basename(p) for p in SAMPLES])
def test_sample_loads_and_splits(path):
    df = ibt_reader.load_ibt(path)
    assert len(df) > 0
    infos = A.split_laps(df)
    assert isinstance(infos, list) and len(infos) >= 1
    # off_track (Bloco 2) computa sem erro para toda volta
    for i in infos:
        assert isinstance(i.off_track, bool)
