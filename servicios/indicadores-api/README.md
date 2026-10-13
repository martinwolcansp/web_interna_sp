# indicadores-api

Servicio que actualiza **Indicadores por Área** de la web interna. Un módulo por área en `app/areas/`: **Posventa** (reemplaza el Power BI "Análisis Posventa V3") e **Instalaciones** (reemplaza "Análisis Instalaciones V2"). Los dos reemplazan el RESTlet `powerbi-netsuite-api`.

## Tablas comunes

Los datos que usan varias áreas se traen con `app/fuentes/` y se guardan en tablas comunes. Qué área usa cada tabla queda en `ind_tabla_area`, y de ahí salen los permisos (RLS): ve la tabla quien puede ver alguna de esas áreas.

| Tabla | Fuente | Búsqueda que replica | Áreas |
|---|---|---|---|
| `ind_caso_instalacion` | `fuentes/casos.py` | 2560, asignado 133 | posventa, instalaciones |
| `ind_caso_ov` | `fuentes/ov.py` | 2439 (facturación) | instalaciones |
| `ind_caso_ov_linea` | `fuentes/ov.py` | 2833 (artículos por caso) | instalaciones |

Cada área actualiza con su propio botón y solo reescribe lo de su alcance. Posventa e Instalaciones traen los mismos casos, así que actualizar cualquiera de las dos refresca `ind_caso_instalacion` para ambas.

## Qué hace una corrida de Instalaciones

1. Casos de instalación (la misma consulta que Posventa).
2. OV de productos de cada caso: el campo "OV de productos" del caso más las OV con alguna línea cuya "Orden de instalación" es el caso. Solo OV con tipo de orden de venta 1. Se consulta por listas de ids, lo que tarda unos segundos; con un único JOIN tardaba más de un minuto.
   De cada OV se guarda también si es comodato (`custbody_3k_comodato`), el presupuesto de origen (`custbody_3k_trans_orig_ov`) y la unidad comercial (`custbody_mw_sp_unidad_comercial`). La unidad comercial se toma de la OV; si no la tiene, del presupuesto; y si tampoco, de la oportunidad. El presupuesto y la oportunidad se consultan aparte, por ids, porque unidos a la consulta de OV la hacían 10 veces más lenta. Requiere la `migracion_27_indicadores_ov_comodato_unidad.sql`.
3. Líneas de esas OV, con categoría y subcategoría según las reglas de `PatronesCategorias` del Power BI, más dos patrones agregados: "Control remoto" y "Tarjeta memoria". `es_elemento` excluye IVA, descuentos, subtotales, mano de obra, cable (se vende por metro) y las categorías Servicios, Administrativo e Interno.
4. Los indicadores se calculan en `pages/indicadores-area/instalaciones.html`.

Validado el 13/10/2026: 520 de 528 pares caso-OV iguales a la búsqueda 2833.

Prueba sin tocar Supabase: `python probar_instalaciones.py`.

## Qué hace una corrida de Posventa

1. Trae de NetSuite por **SuiteQL** los casos de instalación (replica la búsqueda **2560**, filtrada por el asignado **133**) y los relevamientos posventa (búsqueda **2557**). Validado el 07/10/2026 contra las búsquedas: 459 casos y 356 relevamientos, con las mismas fechas, tipo de proyecto y tipo de posventa.
2. Trae de GHL los contactos con etiqueta `enviar_encuesta` / `enviar_encuesta_finalizada` y las respuestas del objeto personalizado de encuestas.
3. Hace upsert en `ind_caso_instalacion` (tabla común), `ind_posventa_relevamiento` e `ind_posventa_encuesta` y borra lo que ya no vino. Si GHL falla, se conservan las encuestas anteriores y la corrida termina con aviso.
4. Registra la corrida en `ind_corrida`. La página `pages/indicadores-area/posventa.html` lee las tablas directo de Supabase.

Trae todo desde las fechas de corte de las búsquedas (`CASOS_INSTALACION_DESDE` (acepta el nombre viejo `POSVENTA_CASOS_DESDE`), `POSVENTA_RELEV_DESDE`). Son pocos cientos de registros, así que no hace falta rango.

Diferencias con el Power BI:

- **Nro de cuenta**: el Power BI lo recortaba del texto de Empresa (": 42xxxx"). Ahora se lee del campo del cliente, que da lo mismo y cubre también las cuentas "B42…".
- **Tipo de posventa del relevamiento**: se toma de su caso directamente, no sólo cuando el caso está en la búsqueda 2560.
- **Instalaciones finalizadas**: cuenta instalaciones distintas (fecha inicio + fecha fin + cliente). El Power BI mostraba `Mín(Número)`.

## Puesta en marcha

### 1. Supabase

Correr `supabase/migracion_21_indicadores_area_posventa.sql` y después `migracion_26_indicadores_instalaciones.sql` en el SQL Editor. La 26 renombra `ind_posventa_caso` a `ind_caso_instalacion`: correrla y desplegar enseguida el servicio y las páginas. No volver a correr la 21 después de la 26, porque recrearía la tabla vieja vacía. Crea las secciones `indicadores-area` (mosaico) e `indicadores-posventa`, las tablas y las políticas RLS.

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
3. Variables de entorno (solo Production): las del `.env.example`, con dos diferencias respecto de la PC:
   - `SUPABASE_URL=http://supabase-kong-v110q1hu5ftsmc0zxn2pxrxs:8000` (dirección interna). Con la URL pública el contenedor falla con `SSLV3_ALERT_HANDSHAKE_FAILURE`.
   - `NETSUITE_PRIVATE_KEY`: cargarla sola con **+ Add**, no en el Developer view (ahí se corta en el primer salto de línea). Valor: el mismo de informe-mkt-api, o la salida de `clave_una_linea.py`. No cargar `NETSUITE_PRIVATE_KEY_PATH`.
4. Poner el dominio en `API_BASE_URL` de `pages/indicadores-area/posventa.html`. Hoy dice `https://indicadores-api.200.5.196.50.sslip.io`.
5. Watch Paths: `servicios/indicadores-api/**`.

**Tarea programada** (opcional; por ahora no se usa, la actualización es manual con el botón). Para activarla, Scheduled Tasks → Add:

- Command: `python -m app.corrida_programada`
- Frequency: `0 16 * * 1-5` si el servidor está en hora de Argentina, `0 19 * * 1-5` si está en UTC.

Necesita un usuario técnico de Supabase (`INDICADORES_BOT_EMAIL` / `INDICADORES_BOT_PASSWORD`) con permiso **editar** en *Indicadores - Posventa*. Puede ser el mismo usuario técnico del Informe MKT.

## Sumar un área

1. `app/areas/<area>.py` con `SECCION` y `actualizar(token, corrida_id, log, paso)`; registrarlo en `app/areas/__init__.py`.
2. Migración con la sección `indicadores-<area>` y sus tablas `ind_<area>_*` (mismo esquema de RLS).
3. Si usa tablas comunes, insertar en `ind_tabla_area` las filas (tabla, área).
4. `pages/indicadores-area/<area>.html` y una entrada en `INDICADORES_AREAS` de `js/indicadores-area.js`.
