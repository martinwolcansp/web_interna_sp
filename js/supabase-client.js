/**
 * supabase-client.js — Cliente de Supabase compartido por todo el sitio.
 *
 * Requiere que el SDK ya esté cargado antes (ver el <script> de
 * cdn.jsdelivr.net en cada página), que expone el objeto global `supabase`.
 * Este archivo crea el cliente configurado y lo deja disponible como
 * `window.supabaseClient` para que lo usen js/auth.js y el resto de las
 * páginas (home dinámico, pizarra, etc.).
 *
 * La "anon key" es pública por diseño (así la nombra Supabase): no es un
 * secreto, es la clave que identifica al proyecto para pedidos desde el
 * navegador. La seguridad real la dan las políticas RLS configuradas en
 * supabase/schema.sql, no el secreto de esta clave. La "service_role key"
 * sí es secreta y jamás debe aparecer en código de frontend.
 */

const SUPABASE_URL = 'https://supabase.200.5.196.50.sslip.io';
const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4NjM4MTA4MCwiZXhwIjo0OTQyMDU0NjgwLCJyb2xlIjoiYW5vbiJ9.eaoMMz2s1LH_YHn2qHfOV4eKbIHxjdcwUfpd_maoxZc';

// Desactiva el "navigator.locks" que supabase-js usa por defecto para
// serializar getSession()/refresh de token entre pestañas del mismo
// origen. Es un mecanismo con bugs de deadlock documentados (queda
// esperando para siempre un lock que nunca se libera si otra pestaña lo
// tiene tomado y el navegador la puso en pausa por estar en segundo
// plano) -- ver supabase/supabase-js issues #2013, #2111, #1517. Efecto
// en este sitio: entrar a Usuarios / Editor de pizarra / Editor de
// fichas a veces no mostraba nada (se quedaba esperando ese lock) hasta
// volver a entrar. No hace falta la coordinación entre pestañas para
// una intranet donde cada usuario normalmente tiene una sola pestaña
// abierta, así que se reemplaza por un "lock" que no bloquea nada.
function lockSinCoordinacionEntrePestanas(_name, _acquireTimeout, fn) {
  return fn();
}

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    lock: lockSinCoordinacionEntrePestanas,
  },
});
