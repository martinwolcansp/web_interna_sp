# app/contactos — Pestaña "Clientes activos + contactos" (migracion_55).
#
#   lectura.py    lee los exports de ByKom (.XLS Clientes cuenta, .xlsx Clientes
#                 contactos) y reconoce cual es cada uno por sus columnas
#   telefonos.py  normaliza los telefonos de ByKom al formato de NetSuite
#                 (caracteristica y numero por separado, sin 54, 9, 0 ni 15)
#   carga.py      guarda una carga en cnt_bykom_cuenta / cnt_bykom_contacto y
#                 registra los cambios respecto de la carga anterior (cnt_evento)
#
# Seccion de permisos: clientes-contactos (ver / editar).

SECCION = "clientes-contactos"
