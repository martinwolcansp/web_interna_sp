/* ============================================================
   documentos-externos.js — Config centralizada de links a
   documentos fuente (contratos, ejes del proyecto, comunicaciones
   internas, etc.)

   Por qué existe este archivo: la Ficha de Producto y los módulos
   de Unidad de Negocio (Eje 1) y Procesos (Eje 2) referencian los
   mismos documentos fuente. Centralizar los links acá evita repetir
   URLs sueltas en cada versión de ficha/eje y deja un solo lugar
   para cargar la URL real el día que el documento se suba a un
   repositorio interno (Nextcloud, Drive, SharePoint).

   Cómo completar un link real:
   cambiar `url: null` por la URL final del documento. Mientras
   `url` sea null, la UI (ver _docLink() en js/ficha-renderer.js)
   muestra el documento como "pendiente", con el motivo en `nota`
   a modo de tooltip.
   ============================================================ */

'use strict';

window.DOCUMENTOS_EXTERNOS = {

  'contrato-hellgrun': {
    label: 'Contrato de comodato — Hellgrun',
    url:   null,
    nota:  'Pendiente: cargar el link al repositorio interno (Nextcloud / Drive / SharePoint) donde vaya a alojarse el contrato firmado con el cliente.',
  },

  'estructura-roles': {
    label: 'Estructura y Roles — Sector Comunicaciones',
    url:   null,
    nota:  'Pendiente: cargar el link al documento fuente una vez definido el repositorio de documentos.',
  },

  'comunicacion-creacion': {
    label: 'Comunicación interna — Creación del Sector Comunicaciones',
    url:   null,
    nota:  'Pendiente: cargar el link al documento fuente una vez definido el repositorio de documentos.',
  },

  'proyecto-sector-comunicaciones': {
    label: 'Proyecto Sector Comunicaciones — documento general',
    url:   null,
    nota:  'Pendiente: cargar el link al documento fuente una vez definido el repositorio de documentos.',
  },

};
