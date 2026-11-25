# app/contactos/telefonos.py — Telefonos de ByKom en el formato de NetSuite.
#
# ByKom guarda '(0221) 5341935 / (0221) 5885556': caracteristica entre
# parentesis y, a veces, dos numeros separados por '/'. NetSuite guarda la
# caracteristica en un campo aparte y el numero sin 54, 9, 0 ni 15 (igual que
# split_phone() del servicio de citas de la integracion GHL).
#
# Calidad de cada numero:
#   valido              caracteristica + numero = 10 digitos
#   sin_caracteristica  '(00) 4234567', '() 4234567'
#   invalido            caracteristica '(99)', numero de un solo digito repetido
#   largo_invalido      no suma 10 digitos
#
# Celular o fijo: ByKom no lo distingue. Se infiere: un numero con 15 adelante
# es celular; si no, en Argentina los fijos empiezan casi siempre con 4 o 2.
# Es una regla a validar con una muestra (definicion D2 de la propuesta).

import re
import unicodedata

_PARTE = re.compile(r"\(\s*(\d*)\s*\)\s*([\d\s-]+)")


def normalizar(texto):
    """'(0221) 5341935 / (0221) 155885556' -> lista de
    {car, num, tipo, calidad, original}."""
    salida = []
    for parte in str(texto or "").split("/"):
        parte = parte.strip()
        if not parte:
            continue
        m = _PARTE.search(parte)
        if not m:
            digitos = re.sub(r"\D", "", parte)
            if digitos:
                salida.append({"car": None, "num": digitos, "tipo": None, "calidad": "sin_caracteristica", "original": parte})
            continue
        car = m.group(1).lstrip("0")
        num = re.sub(r"\D", "", m.group(2))
        movil = False
        if car and num.startswith("15") and len(car) + len(num) - 2 == 10:
            num, movil = num[2:], True
        item = {"car": car or None, "num": num or None, "tipo": None, "calidad": "valido", "original": parte}
        if not num:
            item["calidad"] = "invalido"
        elif not car:
            item["calidad"] = "sin_caracteristica"
        elif set(car) == {"9"} or len(set(num)) == 1:
            item["calidad"] = "invalido"
        elif len(car) + len(num) != 10:
            item["calidad"] = "largo_invalido"
        else:
            item["tipo"] = "celular" if movil or not num.startswith(("4", "2")) else "fijo"
        salida.append(item)
    return salida


def solo_digitos(texto):
    return re.sub(r"\D", "", str(texto or ""))


def palabras(texto):
    """Palabras de 3 letras o mas, sin acentos ni numeros (para reconocer al titular)."""
    s = unicodedata.normalize("NFD", str(texto or "")).encode("ascii", "ignore").decode().upper()
    return {w for w in re.sub(r"[^A-Z0-9 ]", " ", s).split() if len(w) >= 3 and not w.isdigit()}


def cuenta_de(nombre_dos):
    """Convencion de ByKom: el numero de cuenta va al final de nombre_dos
    ('ANDREA 7005' -> '7005', 'C146' -> 'C146')."""
    partes = str(nombre_dos or "").strip().upper().split()
    return partes[-1] if partes else None
