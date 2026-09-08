-- Migración 8 — política de DELETE en perfiles para superadmin
--
-- Hoy `perfiles` sólo tiene policies de select/update; el botón
-- "Eliminar" del panel de usuarios (js/admin.js) hace un DELETE directo
-- via supabase-js, que sin esta policy RLS lo bloquea siempre (0 filas
-- afectadas, sin error visible). Ver [[project-web-interna-sp-auth-roles-cms]].
--
-- Nota de alcance: esto borra sólo la fila de `perfiles`. La cuenta de
-- Google del usuario sigue existiendo en `auth.users` — si esa persona
-- vuelve a loguearse, Supabase Auth le da sesión válida pero sin fila en
-- perfiles (el trigger on_auth_user_created sólo corre en el alta
-- original), así que el sitio le va a mostrar pantallas de "no se pudo
-- verificar tu acceso" en vez de recrearle un perfil solo. Si en algún
-- momento hace falta un borrado completo (perfil + cuenta de Auth), eso
-- requiere una Edge Function con la service role key — no se puede hacer
-- con la anon key desde el navegador.
--
-- Idempotente: safe de correr de nuevo.

drop policy if exists "perfiles: superadmin elimina" on perfiles;
create policy "perfiles: superadmin elimina" on perfiles
  for delete using (fn_es_superadmin() and id <> auth.uid());
