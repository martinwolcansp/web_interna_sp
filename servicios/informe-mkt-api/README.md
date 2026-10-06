# informe-mkt-api

Servicio que actualiza el **Informe MKT** desde la web interna: botón **Actualizar** con rango **Desde / Hasta**.
Reemplaza los pasos manuales de `Actualizacion_Informe_MKT.docx` y trae NetSuite por API en vez del Excel.

## Qué hace una corrida

1. Descarga de GHL los contactos (por fecha de alta) y las oportunidades (por "Actualizado el") del rango.
2. Trae de NetSuite las oportunidades por **SuiteQL** (API REST), replicando la búsqueda guardada 2933 "SP- Fede Oportunidades por Vendedor (Detalle)" con las mismas columnas que el Excel. Validado el 01/10/2026 contra el Excel del 21/09 (`comparar_netsuite_excel.py`).
3. Hace upsert de `contacto` y `oportunidad` en Supabase, con el mismo mapeo que `generar_sql.py`.
4. Calcula el Resumen ejecutivo con la misma lógica que `actualizar_resumen_ejecutivo.py`: NetSuite manda y GHL completa lo que falta.
5. Guarda el resultado en `informe_mkt_corrida`. La página `pages/informes-mkt/actualizable.html` muestra la última corrida OK y la fecha hasta la que están actualizados los datos.

Los días se cortan en hora de Argentina; los scripts manuales cortaban en UTC.

## Puesta en marcha

### 1. Supabase

Correr `web_interna_sp/supabase/migracion_17_informe_mkt_corridas.sql` en el SQL Editor de Supabase Studio.

Quien apriete el botón necesita permiso **editar** en *Informes de MKT*. Para que también se actualicen las tablas `contacto` y `oportunidad`, necesita además permiso **editar** en *Integración NetSuite-GHL*. Sin este segundo permiso, el informe se calcula igual y la corrida termina con un aviso.

### 2. NetSuite (hecho el 01/10/2026)

- **Integración** "SP Servicios internos M2M": Client Credentials (M2M), scopes RESTlets y Servicios web REST. Es la integración única para los servicios de servidor; cada servicio usa su propio certificado.
- **Certificado** en `certificados/` (vence 30/09/2028), asociado en "Configuración de credenciales de cliente OAuth 2.0" a Martin Wolcan con el rol **SP WEB SERVICE INTEGRATION**.
- **Permisos que necesita el rol** además de los que ya tenía: *SuiteAnalytics Workbook* (Informes), *Buscar transacción* (Transacciones) y *Clases* (Listas), todos en Ver.
- **No se usa RESTlet**: los RESTlets de la cuenta rechazan el token M2M (`INVALID_LOGIN_ATTEMPT`, probado también con el de Power BI), mientras que la API REST lo acepta. El script `netsuite/RL_SP_Informe_MKT_Oportunidades.js` (2569) queda sin uso y se puede desactivar.
- Si cambia la búsqueda guardada (vendedores, subsidiaria, columnas), actualizar `VENDEDORES`, `SUBSIDIARIA` o la consulta en `app/netsuite.py`.

Pruebas desde la PC: `python probar_conexiones.py --desde AAAA-MM-DD --hasta AAAA-MM-DD` y `python comparar_netsuite_excel.py`.

### 3. Coolify

El servicio vive en el mismo repo que la web (`web_interna_sp/servicios/informe-mkt-api`), pero corre como **otra aplicación** de Coolify, porque la web es estática (`serve .`) y este servicio es Python.

1. New Resource → mismo repo `web_interna_sp`, rama `main`.
2. Build Pack: **Dockerfile**. Base Directory: **`/servicios/informe-mkt-api`**. Puerto: **8000**. Health check: `/health`.
3. Variables de entorno: las del `.env` (que no está en el repo), sin `NETSUITE_PRIVATE_KEY_PATH`. En `NETSUITE_PRIVATE_KEY` pegar la salida de `python clave_una_linea.py`.
4. Anotar el dominio y ponerlo en `API_BASE_URL` de `pages/informes-mkt/actualizable.html`. Hoy dice `https://informe-mkt-api.200.5.196.50.sslip.io`.
5. Si Coolify redespliega esta aplicación con cada push del repo, se puede limitar a cambios en `servicios/informe-mkt-api/**` (Watch Paths), para que los cambios de la web no la reinicien.

La web no expone el código del servicio: `serve.json` en la raíz redirige `/servicios/**` al inicio, y `.env` y `certificados/` están en `.gitignore`.

### 4. Web interna

`js/versiones/informes-mkt.js` ya tiene la entrada **Actualizable** primera en el selector. Hacer commit y push de `web_interna_sp`. Los informes mensuales estáticos (`2026-09.html`) quedan como estaban.

## Actualización automática (lunes a viernes, 16 hs)

`app/corrida_programada.py` hace lo mismo que el botón, con el rango calculado en hora de Argentina:

- Siempre corre del 1 del mes en curso a hoy.
- En los primeros 3 días hábiles del mes (`DIAS_HABILES_MES_ANTERIOR`), antes corre el mes anterior completo para tomar los cierres tardíos. Lo corre primero para que la página muestre el mes en curso.
- Si hay una actualización manual en curso, espera hasta 20 minutos (`MINUTOS_ESPERA_EN_CURSO`).
- En el historial figura como **Automática** (columna `origen`, migración 20).
- Sale con código 1 si algo falla, así Coolify marca la ejecución como fallida.

Como no hay un usuario de la web, inicia sesión con un **usuario técnico** de Supabase (`INFORME_BOT_EMAIL` / `INFORME_BOT_PASSWORD`). Ese usuario necesita permiso **editar** en *Informes de MKT* y en *Integración NetSuite-GHL*.

**Tarea en Coolify:** aplicación `informe-mkt-api` → **Scheduled Tasks** → **Add**.

- Command: `python -m app.corrida_programada`
- Frequency: `0 16 * * 1-5` si la zona horaria del servidor en Coolify es `America/Argentina/Buenos_Aires`, o `0 19 * * 1-5` si es UTC.

Pruebas:

```
python -m app.corrida_programada --simular
python -m app.corrida_programada --desde 2026-10-01 --hasta 2026-10-06
```

`--simular` muestra los rangos que correría sin ejecutar nada. `--forzar` corre aunque sea sábado o domingo.

## Prueba rápida sin la web

```
curl -X POST "https://<dominio-coolify>/informe-mkt/actualizar" -H "Authorization: Bearer <access token de Supabase>" -H "Content-Type: application/json" -d "{\"desde\":\"2026-10-01\",\"hasta\":\"2026-10-01\"}"
```

El avance queda en la tabla `informe_mkt_corrida`, en las columnas `estado`, `paso`, `mensaje` y `log`.
