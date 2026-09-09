/**
 * versiones/comunicacion-receptoras.js — Receptoras disponibles dentro
 * del mosaico "Comunicación Receptoras".
 *
 * A diferencia de mapa-v*.js / informes-mkt.js (que versionan UN mismo
 * informe en el tiempo), acá cada entrada es una receptora/marca
 * DISTINTA, cada una con su propio informe autocontenido y permanente
 * (no se reemplaza mes a mes, salvo que la propia receptora pase a
 * actualizarse periódicamente — ver notas en cada informe).
 *
 * pages/comunicacion-receptoras.html (la vista general) lee este
 * arreglo para armar las tarjetas de resumen. Para agregar una
 * receptora nueva:
 *
 *   1. Soltar su informe en pages/comunicacion-receptoras/<id>/informe.html
 *   2. Crear pages/comunicacion-receptoras/<id>.html (copiar bosch.html
 *      o nanocomm.html como plantilla y cambiar el título/breadcrumb/src).
 *   3. Agregar UNA entrada acá con sus datos básicos (los mismos números
 *      que ya se muestran arriba del informe: clientes, señales, período).
 *
 * No hace falta tocar las demás receptoras ni ningún otro archivo del
 * sitio (el mosaico y sus permisos no cambian, ya que todas viven bajo
 * la misma sección 'comunicacion-receptoras').
 */

'use strict';

window.COMUNICACION_RECEPTORAS = [
  {
    id: 'bosch',
    nombre: 'Bosch D6600',
    via: 'Vía telefónica',
    periodo: '01/08/2026 – 31/08/2026',
    clientes: 2006,
    senales: 187873,
    href: 'comunicacion-receptoras/bosch.html',
  },
  {
    id: 'nanocomm',
    nombre: 'Nanocomm',
    via: 'Vía GPRS/IP',
    periodo: '01/08/2026 – 31/08/2026',
    clientes: 71,
    senales: 4828,
    href: 'comunicacion-receptoras/nanocomm.html',
  },
];
