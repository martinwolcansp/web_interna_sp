# app/fuentes — Datos de NetSuite que usan varias areas (tablas comunes).
#
# Cada fuente sabe traer su consulta SuiteQL y guardarla en su tabla comun
# (ind_caso_*). Las areas (app/areas/*.py) llaman a las fuentes que usan;
# que area usa que tabla queda registrado en ind_tabla_area (Supabase).
#
# Regla para que las areas no se pisen: cada fuente reescribe y borra solo
# las filas de su alcance: los casos de la busqueda 2560 de un asignado
# (columna alcance: instalaciones = 133, ampliaciones = 232) y lo que cuelga
# de ellos. Ver app/fuentes/casos.py.
