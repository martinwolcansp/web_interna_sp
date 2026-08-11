# Guía de configuración — Supabase self-hosted (Coolify) + login Google Workspace

Complementa `Propuesta_Proyecto_Auth_Roles_CMS.docx` (Fase 0 y Fase 1).

## 0. Desplegar el stack de Supabase en Coolify

Asume que Coolify ya está instalado y el servidor de destino ya está agregado ahí (*Servers*). Si no, primero hay que agregar el servidor en Coolify antes de este paso.

1. En Coolify: **Add New Project** → nombrarlo (ej. `web-interna-sp`).
2. Dentro del proyecto: **Add New Resource → Services** → buscar **"Supabase"** y elegirlo. Coolify arma todo el stack (Postgres, Auth/GoTrue, Kong, PostgREST, Realtime, Storage, Studio, Supavisor) a partir de un docker-compose ya armado — no hace falta escribirlo a mano.
3. **Antes de tocar "Deploy"**, dos cosas que después no se pueden cambiar sin migrar la base:
   - **Dominio de Kong** (el gateway de la API): dentro del stack, click en el servicio `supabase-kong` → *Settings → General → Domains* → asignarle el subdominio que va a usar el sitio (ej. `https://api.tu-dominio.com`). Esto genera la variable `SERVICE_URL_SUPABASEKONG` de la que dependen el resto de los servicios.
   - **Pooler Tenant ID**: en el stack → *Service Stack → Edit Compose File*, buscar el servicio `supabase-supavisor` y cambiar `POOLER_TENANT_ID` (viene con el valor default `dev_tenant`, predecible) por un string random, por ejemplo generado con `openssl rand -base64 16 | tr -d '=' | tr '+/' '-_'`.
4. En **Environment Variables** del stack, cargar como mínimo el SMTP para los mails de Auth (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME`) — Supabase Auth los necesita aunque el login principal termine siendo con Google.
5. Click **Deploy** y esperar a que los 8 servicios queden en verde/healthy: `supabase-db`, `supabase-kong`, `supabase-auth`, `supabase-rest`, `supabase-realtime`, `supabase-storage`, `supabase-studio`, `supabase-supavisor`.
6. Entrar a Supabase Studio en la URL de Kong que configuraste; Coolify genera un usuario/contraseña para el dashboard (quedan guardados como secretos del stack) — con eso entrás la primera vez.

Con el Studio ya accesible, seguí con los pasos 1 a 3 de esta guía (aplicar el SQL, login de Google, primer superadmin).

**Nota de seguridad, para cuando quieras endurecerlo (no bloquea nada de lo anterior):** habilitar SSL obligatorio en las conexiones directas a Postgres, restringir el firewall a los puertos que realmente uses (443, y 5432/6543 solo si necesitás conectar `psql` desde afuera), y evitar exponer el puerto de Postgres si no lo necesitás. Esto es hardening de infraestructura y podés hacerlo cuando quieras, no es requisito para empezar a probar.

## 1. Aplicar el esquema SQL

Orden de archivos (cada uno depende del anterior):

1. `schema.sql` — tablas, funciones, triggers y políticas RLS.
2. `seed_areas.sql` — las 42 áreas del organigrama (generadas desde `js/organigrama-data.js`).
3. `seed_secciones.sql` — los mosaicos actuales + la pizarra, con permisos de ejemplo.
4. `rpc_home.sql` — funciones que usa el home dinámico (`js/home.js`) para saber qué mosaicos mostrar y traer las novedades de la pizarra con su estado de lectura.

Dos formas de correrlos:

- **Supabase Studio** (incluido en el template de Coolify): pestaña *SQL Editor* → pegar el contenido de cada archivo en orden → *Run*.
- **psql**, si tenés la connection string:
  ```
  psql "$DATABASE_URL" -f schema.sql
  psql "$DATABASE_URL" -f seed_areas.sql
  psql "$DATABASE_URL" -f seed_secciones.sql
  ```

Los tres se validaron corriéndolos contra un Postgres real antes de entregarlos — no deberían tirar errores.

**Importante:** los permisos que trae `seed_secciones.sql` son un ejemplo (Directorio y Mapa de Servicios abiertos a toda la empresa, pizarra editable por RRHH, Sector Comunicaciones visible para Ampliaciones). No están pensados para ir a producción tal cual — hay que revisarlos con cada responsable de área (Requisito previo #3 de la propuesta) y ajustar la tabla `permisos_area_seccion` antes de habilitar el acceso real.

## 2. Login con Google Workspace

### 2.1 Google Cloud Console

1. Crear (o reutilizar) un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. *APIs & Services → Credentials → Create Credentials → OAuth client ID*, tipo **Web application**.
3. En *Authorized redirect URIs* agregar:
   ```
   https://<tu-dominio-de-supabase>/auth/v1/callback
   ```
4. En *OAuth consent screen*, si la organización de Google Cloud coincide con el Workspace, se puede configurar como **Internal** — así solo cuentas `@spseguridad.com.ar` (o el dominio que corresponda) pueden autenticarse, sin depender de configuración adicional.
5. Guardar el **Client ID** y el **Client Secret**.

### 2.2 GoTrue (el servicio de Auth de Supabase, dentro de Coolify)

En las variables de entorno del servicio de Auth (GoTrue) del stack de Supabase en Coolify:

```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<client id de Google>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<client secret de Google>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://<tu-dominio-de-supabase>/auth/v1/callback
```

Reiniciar el servicio de Auth después de guardarlas.

### 2.3 Por qué no hace falta restringir el dominio "a mano" en el código

Se podría pasar `hd: 'spseguridad.com.ar'` como parámetro al iniciar sesión desde el frontend, pero eso es solo cosmético (un usuario externo podría igual completar el login si Google se lo permite). La restricción real ya está resuelta por diseño en `schema.sql`: el trigger `on_auth_user_created` da de alta el perfil con `activo = false`, y todas las políticas RLS exigen `activo = true` para tener cualquier permiso. Es decir: cualquiera puede loguearse, pero nadie ve ni edita nada hasta que un superadmin lo activa y le asigna área — así que si en el paso 2.1 dejás el consent screen como *Internal*, ya alcanza.

## 3. Dar de alta al primer superadmin

Hasta que exista un superadmin no hay quien active usuarios desde una interfaz. Para el primero, es manual:

1. Que esa persona inicie sesión una vez en el sitio (así se crea su fila en `perfiles` vía el trigger).
2. Correr en el SQL Editor:
   ```sql
   update perfiles
   set es_superadmin = true, activo = true
   where email = 'la-persona@spseguridad.com.ar';
   ```

De ahí en adelante, activar usuarios y asignarles área/rol es tarea del panel de superadministrador (Fase 5) — hasta que ese panel exista, se puede seguir haciendo con `UPDATE` directos sobre `perfiles`.

## 4. Próximos pasos técnicos (fuera de esta guía)

- Conectar el botón de login del sitio a `supabase.auth.signInWithOAuth({ provider: 'google' })`.
- Construir en el frontend la consulta que arma el home dinámico: qué mosaicos mostrar según `permisos_area_seccion` del área del usuario (Fase 3).
- Panel de edición de la pizarra y de administración de usuarios (Fases 4 y 5).
