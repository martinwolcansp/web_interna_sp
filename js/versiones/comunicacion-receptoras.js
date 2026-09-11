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
 * arreglo para armar tanto las tarjetas por receptora como el resumen
 * general de arriba (KPIs + distribución de señales), que se recalcula
 * solo a partir de estos datos — no hace falta tocar el resumen a mano
 * al agregar una receptora.
 *
 * Para agregar una receptora nueva:
 *
 *   1. Soltar su informe en pages/comunicacion-receptoras/<id>/informe.html
 *   2. Crear pages/comunicacion-receptoras/<id>.html (copiar bosch.html
 *      o nanocomm.html como plantilla y cambiar el título/breadcrumb/src).
 *   3. Agregar UNA entrada acá con sus datos básicos: los mismos números
 *      que ya se muestran arriba del informe (clientes, señales, período)
 *      más el desglose por categoría (cat_counts), que también se
 *      muestra dentro de cada informe individual ("Señales por tipo de
 *      evento") — mismas 8 claves siempre, para que el resumen general
 *      sea comparable entre receptoras.
 *
 * No hace falta tocar las demás receptoras ni ningún otro archivo del
 * sitio (el mosaico y sus permisos no cambian, ya que todas viven bajo
 * la misma sección 'comunicacion-receptoras').
 */

'use strict';

// Cantidad aproximada de receptoras que se espera terminar cargando en
// total (informativo, para el "X de ~15" del resumen general). Ajustar
// si cambia la previsión — no afecta ninguna otra lógica del sitio.
window.COMUNICACION_RECEPTORAS_TOTAL_ESPERADO = 15;

window.COMUNICACION_RECEPTORAS = [
  {
    id: 'bosch',
    nombre: 'Bosch D6600',
    via: 'Vía telefónica',
    periodo: '01/08/2026 – 31/08/2026',
    clientes: 2006,
    senales: 187873,
    href: 'comunicacion-receptoras/bosch.html',
    cat_counts: {
      apertura_cierre: 74049,
      test: 60613,
      anulacion: 41820,
      alarma: 4773,
      restauracion: 3204,
      falla_energia: 2730,
      falla_comunicacion: 492,
      otros: 192,
    },
  },
  {
    id: 'nanocomm',
    nombre: 'Nanocomm',
    via: 'Vía GPRS/IP',
    periodo: '01/08/2026 – 31/08/2026',
    clientes: 71,
    senales: 4828,
    href: 'comunicacion-receptoras/nanocomm.html',
    cat_counts: {
      apertura_cierre: 2374,
      test: 1940,
      falla_comunicacion: 284,
      falla_energia: 102,
      alarma: 76,
      restauracion: 43,
      anulacion: 2,
      otros: 7,
    },
  },
  {
    id: 'dx',
    nombre: 'DX',
    via: 'Vía telefónica (Radio, Internet y Receptora)',
    periodo: '01/08/2026 – 31/08/2026',
    clientes: 1925,
    senales: 1105656,
    href: 'comunicacion-receptoras/dx.html',
    cat_counts: {
      test: 706807,
      apertura_cierre: 214034,
      anulacion: 142008,
      restauracion: 18952,
      falla_energia: 11661,
      falla_comunicacion: 5424,
      alarma: 4688,
      otros: 2082,
    },
  },
  {
    id: 'garnet',
    nombre: 'Garnet',
    via: 'Vía GPRS/IP (3G/4G, WiFi y Botón)',
    periodo: '01/08/2026 – 31/08/2026',
    clientes: 4088,
    senales: 1948374,
    href: 'comunicacion-receptoras/garnet.html',
    cat_counts: {
      apertura_cierre: 737446,
      restauracion: 491196,
      anulacion: 377931,
      test: 236121,
      falla_comunicacion: 76300,
      alarma: 24395,
      otros: 4985,
      falla_energia: 0,
    },
  },
];
