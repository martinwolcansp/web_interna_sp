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

const SUPABASE_URL = 'https://supabasekong-v110q1hu5ftsmc0zxn2pxrxs.20.0.20.138.sslip.io';
const SUPABASE_ANON_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4NjM4MTA4MCwiZXhwIjo0OTQyMDU0NjgwLCJyb2xlIjoiYW5vbiJ9.eaoMMz2s1LH_YHn2qHfOV4eKbIHxjdcwUfpd_maoxZc';

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
