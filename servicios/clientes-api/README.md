# clientes-api

Servicio que actualiza el mosaico **Clientes activos** de la web interna. Dos informes, cada uno con su botón y su corrida (`cli_corrida`):

| Informe | Endpoint | Sección de permisos | Tablas |
|---|---|---|---|
| Segmentación Clientes | `POST /clientes/segmentacion/actualizar` | `clientes-segmentacion` | `cli_cliente`, `cli_establecimiento` |
| Análisis Bajas | `POST /clientes/bajas/actualizar?periodo=AAAA-MM` | `clientes-bajas` | `cli_baja` |

Las páginas (`pages/clientes-activos/segmentacion.html` y `bajas.html`) leen las tablas directo de Supabase; el servicio solo escribe.

## Modelo de datos (`supabase/migracion_42_clientes_activos.sql`)

- **`cli_cliente`**: un registro por cliente principal de NetSuite (sin parent, ej. `C00404`). Es la tabla maestra: lo que se sume más adelante va en tablas hijas `cli_<tema>` con FK a `cli_cliente.ns_id` (como `cli_establecimiento`), o en `datos` (jsonb) si es un atributo suelto.
- **`cli_establecimiento`**: subclientes (`C00404-1`), uno por cuenta ByKom, con estado de servicio y si cuenta como activo.
- **`v_cli_cliente`**: vista con totales de establecimientos activos/inactivos y el `contacto.id` de la integración NetSuite ↔ GHL (enlace por `ghl_contact_id`, sin FK dura).
- **`cli_baja`**: foto de las bajas, una fila por establecimiento y fecha de suspensión.

Nada se borra: lo que deja de venir de NetSuite queda con `vigente = false`.

## Por qué las bajas se guardan como foto

La búsqueda "SP Clientes Suspendidos por Baja" filtra por el estado **actual** del establecimiento (suspensión por baja, deuda o solicitud). Diagnóstico del 30/10/2026:

- Una "SUSPENSION POR BAJA" pasa después a **BAJA** definitiva (2.573 establecimientos en ese estado) y la búsqueda guardada la pierde: septiembre tenía 117 bajas el 05/10 y 116 el 30/10. Por eso el servicio busca también el estado BAJA (`CRITERIO_BAJAS`).
- Las cuentas ByKom se reutilizan creando un **establecimiento nuevo**: 1.274 números de establecimiento tienen 2 o 3 registros en NetSuite (13.795 establecimientos, 12.416 números distintos). El registro del cliente que se dio de baja queda.
- El historial de cambios (notas del sistema) no se puede leer por SuiteQL con el rol de la integración.

Así, el informe por fecha de suspensión es casi estable, pero un establecimiento reactivado o con otra fecha de suspensión sale del mes. Por eso cada actualización de un mes suma a la foto (no pisa el estado de la primera captura) y las bajas que ya no figuran quedan `vigente = false` con su estado actual.

## Plan de acción (`app/plan_accion.py`)

Misma clasificación que el informe manual: por motivo de baja y, para "Otro", por el comentario ("fallec" → baja definitiva). Validado con septiembre 2026: mismas cantidades por categoría. La prioridad y la acción recomendada de cada categoría están en la página (`PLAN`).

## Puesta en marcha

1. **Supabase**: correr `supabase/migracion_42_clientes_activos.sql`. Después, en Permisos por Área, dar **ver** en *Clientes activos* (mosaico) y **ver/editar** en *Clientes activos - Segmentacion* y *- Analisis Bajas* a las áreas que correspondan.
2. **Diagnóstico desde la PC** (una vez, con el `.env` completo):
   ```
   python diagnostico_clientes.py
   ```
   Ya se corrió el 30/10/2026: los ids de los campos quedaron como valores por defecto en `app/config.py`. Con `--rapido` repite solo los conteos (estados, cuentas reutilizadas, bajas de septiembre por estado).
3. **Prueba sin Supabase**:
   ```
   python probar.py segmentacion
   python probar.py bajas 2026-09
   ```
   Bajas de septiembre debería dar 116 (lo que trae hoy la búsqueda guardada).
4. **Coolify**: otra aplicación del mismo repo, igual que indicadores-api. Build Pack Dockerfile, Base Directory `/servicios/clientes-api`, puerto 8000, health check `/health`, Watch Paths `servicios/clientes-api/**`. Variables: las del `.env.example`, con `SUPABASE_URL` interna y `NETSUITE_PRIVATE_KEY` cargada sola con **+ Add** (ver README de indicadores-api).
5. Poner el dominio en `API_BASE_URL` de `pages/clientes-activos/segmentacion.html` y `bajas.html` (hoy `https://clientes-api.200.5.196.50.sslip.io`).
