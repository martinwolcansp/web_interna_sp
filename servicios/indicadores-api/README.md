# indicadores-api

Servicio que actualiza **Indicadores por Área** de la web interna. Un módulo por área en `app/areas/`; la primera es **Posventa**, que reemplaza el Power BI "Análisis Posventa V3" y el RESTlet `powerbi-netsuite-api`.

## Qué hace una corrida de Posventa

1. Trae de NetSuite por **SuiteQL** los casos de instalación (replica la búsqueda **2560**, filtrada por el asignado **133**) y los relevamientos posventa (búsqueda **2557**). Validado el 07/10/2026 contra las búsquedas: 459 casos y 356 relevamientos, con las mismas fechas, tipo de proyecto y tipo de posventa.
2. Trae de GHL los contactos con etiqueta `enviar_encuesta` / `enviar_encuesta_finalizada` y las respuestas del objeto personalizado de encuestas.
3. Hace upsert en `ind_posventa_caso`, `ind_posventa_relevamiento` e `ind_posventa_encuesta` y borra lo que ya no vino. Si GHL falla, se conservan las encuestas anteriores y la corrida termina con aviso.
4. Registra la corrida en `ind_corrida`. La página `pages/indicadores-area/posventa.html` lee las tablas directo de Supabase.

Trae todo desde las fechas de corte de las búsquedas (`POSVENTA_CASOS_DESDE`, `POSVENTA_RELEV_DESDE`). Son pocos cientos de registros, así que no hace falta rango.

Diferencias con el Power BI:

- **Nro de cuenta**: el Power BI lo recortaba del texto de Empresa (": 42xxxx"). Ahora se lee del campo del cliente, que da lo mismo y cubre también las cuentas "B42…".
- **Tipo de posventa del relevamiento**: se toma de su caso directamente, no sólo cuando el caso está en la búsqueda 2560.
- **Instalaciones finalizadas**: cuenta instalaciones distintas (fecha inicio + fecha fin + cliente). El Power BI mostraba `Mín(Número)`.

## Puesta en marcha

### 1. Supabase

Correr `supabase/migracion_21_indicadores_area_posventa.sql` en el SQL Editor. Crea las secciones `indicadores-area` (mosaico) e `indicadores-posventa`, las tablas y las políticas RLS.

Permisos (Permisos por Área):

- **ver** en *Indicadores por Área* → ve el mosaico.
- **ver** en *Indicadores - Posventa* → ve los indicadores de Posventa.
- **editar** en *Indicadores - Posventa* → botón **Actualizar ahora** e historial.

### 2. NetSuite

Misma integración M2M que informe-mkt-api ("SP Servicios internos M2M", rol **SP WEB SERVICE INTEGRATION**). Se puede reutilizar su certificado o subir uno propio. El rol necesita además, en Ver:

- **Casos** (Listas > Casos / Soporte).
- El registro personalizado **Relevamiento Posventa** (`customrecord_ap_sp_relevamiento_posventa`): en el tipo de registro, Permisos, agregar el rol.

### 3. GHL

- Contactos con etiqueta de encuesta: `GHL_API_TOKEN`, el mismo de informe-mkt-api (`contacts.readonly`).
- Respuestas de las encuestas (objeto `custom_objects.encuestas`, campos `contact_id`, `cliente_nombre`, `encuesta`, `nro_pregunta`, `respuesta`): `GHL_OBJETOS_API_TOKEN`, de la integración que tiene `objects/record.readonly`. El token de informe-mkt-api responde 401 sobre objetos aunque la integración muestre el scope.

### 4. Prueba desde la PC

Con el `.env` completo (copiar `.env.example`):

```
python probar_posventa.py
```

Muestra los totales por mes, las propiedades del objeto de encuestas de GHL y deja todo en `salida_prueba/`. No toca Supabase.

Números de referencia de NetSuite al 07/10/2026 (para comparar con la página después de la primera carga):

| Mes | Relevamientos | Instalaciones finalizadas |
|---|---|---|
| 2026-07 | 35 | 33 |
| 2026-08 | 40 | 64 |
| 2026-09 | 48 | 69 |

Acciones (total): Control de calidad 240, Evaluación de satisfacción 134, Comunicación Técnico 132, Instrucción Cliente 70, Asistencia Ventas 46.

### 5. Coolify

Igual que informe-mkt-api: **otra aplicación** del mismo repo.

1. New Resource → repo `web_interna_sp`, rama `main`.
2. Build Pack **Dockerfile**, Base Directory **`/servicios/indicadores-api`**, puerto **8000**, health check `/health`.
3. Variables de entorno: las del `.env.example`. En `NETSUITE_PRIVATE_KEY` pegar la clave en una línea (`clave_una_linea.py` de informe-mkt-api).
4. Poner el dominio en `API_BASE_URL` de `pages/indicadores-area/posventa.html`. Hoy dice `https://indicadores-api.200.5.196.50.sslip.io`.
5. Watch Paths: `servicios/indicadores-api/**`.

**Tarea programada** (Scheduled Tasks → Add):

- Command: `python -m app.corrida_programada`
- Frequency: `0 16 * * 1-5` si el servidor está en hora de Argentina, `0 19 * * 1-5` si está en UTC.

Necesita un usuario técnico de Supabase (`INDICADORES_BOT_EMAIL` / `INDICADORES_BOT_PASSWORD`) con permiso **editar** en *Indicadores - Posventa*. Puede ser el mismo usuario técnico del Informe MKT.

## Sumar un área

1. `app/areas/<area>.py` con `SECCION` y `actualizar(token, corrida_id, log, paso)`; registrarlo en `app/areas/__init__.py`.
2. Migración con la sección `indicadores-<area>` y sus tablas `ind_<area>_*` (mismo esquema de RLS).
3. `pages/indicadores-area/<area>.html` y una entrada en `INDICADORES_AREAS` de `js/indicadores-area.js`.
