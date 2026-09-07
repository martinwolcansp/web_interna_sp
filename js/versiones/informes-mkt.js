/**
 * versiones/informes-mkt.js — Períodos disponibles del informe mensual
 * de MKT ("Informes e indicadores de MKT").
 *
 * A diferencia de mapa-v*.js, cada informe NO es un objeto de datos:
 * es un HTML autocontenido (estilo + tablas + tabs propios) que vive en
 * pages/informes-mkt/<periodo>.html. Para agregar un mes nuevo:
 *
 *   1. Soltar el archivo nuevo en pages/informes-mkt/, ej. "2026-09.html".
 *   2. Agregar UNA entrada acá arriba de todo (orden más reciente primero).
 *
 * No hace falta tocar los meses anteriores ni ningún otro archivo del
 * sitio — pages/informes-mkt.html lee este arreglo para armar el
 * selector y mostrar el más reciente por defecto.
 */

'use strict';

window.INFORMES_MKT_PERIODOS = [
  { id: '2026-08', label: 'Agosto 2026', archivo: '2026-08.html' },
];
