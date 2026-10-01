# clave_una_linea.py — Imprime la clave privada en una sola linea (con \n), lista
# para pegar en la variable NETSUITE_PRIVATE_KEY de Coolify.
#
# Uso:  python clave_una_linea.py
from pathlib import Path

clave = Path("certificados/informe_mkt_private.pem").read_text(encoding="utf-8").strip()
print(clave.replace("\r\n", "\n").replace("\n", "\\n"))
