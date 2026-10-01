# clave_una_linea.py — Copia al portapapeles la clave privada en una sola linea
# (con \\n), lista para pegar en la variable NETSUITE_PRIVATE_KEY de Coolify.
# La copia directo al portapapeles para evitar que la consola de PowerShell
# corte la linea (eso deja la clave ilegible).
#
# Uso:  python clave_una_linea.py
import subprocess
from pathlib import Path

clave = Path("certificados/informe_mkt_private.pem").read_text(encoding="utf-8").strip()
una_linea = clave.replace("\r\n", "\n").replace("\n", "\\n")
try:
    subprocess.run("clip", input=una_linea.encode("ascii"), check=True, shell=True)
    print(f"Clave copiada al portapapeles ({len(una_linea)} caracteres). Pegala en NETSUITE_PRIVATE_KEY.")
except Exception:
    print(una_linea)
