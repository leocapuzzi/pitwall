"""Teste de conexao com a API /data do iRacing.

Roda com:  .venv\\Scripts\\python.exe src\\test_iracing.py
Confirma o login e mostra quem voce e. A senha NUNCA aparece (a lib envia um
hash, nao a senha em texto). As credenciais sao lidas do cofre seguro.
"""
from __future__ import annotations

import warnings

warnings.simplefilter("ignore")  # silencia aviso de "deprecation" da lib (nao e erro)

import config

email = config.get("iracing_email")
password = config.get("iracing_password")

if not email or not password:
    print("X  Faltam as credenciais do iRacing no cofre (.streamlit/secrets.toml).")
    print("   Preencha iracing_email e iracing_password e rode de novo.")
    raise SystemExit(1)

from iracingdataapi.client import irDataClient

print(f"Entrando como {email} ...")
idc = irDataClient(username=email, password=password)

try:
    info = idc.member_info()
except Exception as e:
    print("X  Nao consegui logar. Mensagem da iRacing:")
    print("  ", e)
    print("\nCausas comuns: senha errada, conta com 2FA, ou bloqueio temporario "
          "por muitas tentativas (CAPTCHA). Me mande essa mensagem que eu te ajudo.")
    raise SystemExit(1)

nome = info.get("display_name")
cust_id = info.get("cust_id")
print(f"OK! Login funcionou. Voce e: {nome}  (cust_id={cust_id})")
print("Esse cust_id e o seu 'numero' no iRacing — vou usar ele nas proximas consultas.")
