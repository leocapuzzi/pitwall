import os
import sys

# Deixa os módulos do motor (src/) importáveis nos testes sem instalar o pacote.
_SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)
