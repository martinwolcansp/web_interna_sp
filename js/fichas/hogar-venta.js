/* ============================================================
   fichas/hogar-venta.js — Datos de la ficha SP Hogar Seguro (Venta)
   Skeleton listo para completar. No contiene lógica ni HTML.
   ============================================================ */

'use strict';

const FICHA_HOGAR_VENTA = {
  id:      'hogar-venta',
  badge:   'Hogar',
  name:    'SP Hogar Seguro — Venta',
  version: '—',
  date:    '—',
  author:  '—',

  /* ── GENERAL ─────────────────────────────────────────── */
  general: {
    descripcion: '— Completar descripción del producto —',
    infocards: [
      { icon: 'ti-home',          title: 'Cliente objetivo',  body: '— Completar —' },
      { icon: 'ti-contract',      title: 'Plazo de contrato', body: '— Completar —' },
      { icon: 'ti-device-mobile', title: 'Plataforma',        body: 'App SP Ajax Security · Smartphone y Apple Watch' },
    ],
    comercializacion: [
      '— Completar modalidad de venta —',
    ],
    checklist: [
      { label: 'Nombre',               status: 'rev' },
      { label: 'Alcance detallado',    status: 'rev' },
      { label: 'Preguntas Frecuentes', status: 'rev' },
      { label: 'Contrato',             status: 'rev' },
      { label: 'Artículo en Netsuite', status: 'rev' },
      { label: 'Material Marketing',   status: 'rev' },
      { label: 'Proceso Ventas',       status: 'rev' },
      { label: 'Proceso Instaladores', status: 'rev' },
      { label: 'Proceso Operadores',   status: 'rev' },
      { label: 'Proceso Serv. Técnico',status: 'rev' },
    ],
  },

  /* ── EQUIPAMIENTO ────────────────────────────────────── */
  equipamiento: {
    kits: {
      cols: ['Componente', 'Kit 1', 'Kit 2'],
      grupos: [
        {
          label: 'Equipamiento instalado',
          filas: [
            ['— Completar equipamiento —', '—', '—'],
          ],
        },
        {
          label: 'Adicionales opcionales',
          filas: [
            ['— Completar adicionales —', '—', '—'],
          ],
        },
      ],
    },
    servicios: [
      { icon: 'ti-shield-check',  label: 'Monitoreo 7/24',         desc: 'Central SP + aviso a Policía' },
      { icon: 'ti-car',           label: 'SP Acuda',                desc: 'La Plata, Gonnet, City Bell y Villa Elisa' },
      { icon: 'ti-device-mobile', label: 'App SP Ajax Security',    desc: 'Smartphone, Apple Watch y versión PC' },
      { icon: 'ti-tool',          label: 'Servicio técnico',        desc: '— Completar condiciones para modalidad venta —' },
      { icon: 'ti-bolt',          label: 'Aviso corte de luz',      desc: 'Por mail y SMS al cortar y al restablecer' },
    ],
  },

  /* ── PRECIOS ─────────────────────────────────────────── */
  precios: {
    cards: [
      { label: '— Completar producto —', value: '$ —', sub: 'Completar con precio vigente', featured: false },
      { label: '— Completar producto —', value: '$ —', sub: 'Completar con precio vigente', featured: true, featuredLabel: 'Más contratado' },
    ],
    alerta: '— Completar condiciones de ajuste de precios —',
    cancelacion: [
      { momento: '— Completar —', penalidad: '— Completar —' },
    ],
    notas: [
      { icon: 'ti-info-circle', color: null, text: '— Completar notas sobre precios de venta —' },
    ],
  },

  /* ── PROCESO ─────────────────────────────────────────── */
  proceso: {
    secciones: [
      {
        label: 'Ventas',
        pasos: [
          { title: '— Completar proceso de ventas —', note: '' },
        ],
      },
      {
        label: 'Instalaciones',
        pasos: [
          { title: '— Completar proceso de instalaciones —', note: '' },
        ],
      },
    ],
    netsuite: [
      { articulo: '— Completar —', codigo: '—', desc: '—' },
    ],
  },

  /* ── FAQ ─────────────────────────────────────────────── */
  faq: [
    { q: '— Completar preguntas frecuentes —', a: '—' },
  ],

  /* ── COMPETENCIA ─────────────────────────────────────── */
  competencia: {
    competidores: ['Competidor 1', 'Competidor 2', 'Competidor 3'],
    filas: [
      { criterio: '— Completar análisis competitivo —', sp: '—', valores: ['—', '—', '—'] },
    ],
    nota: '— Completar fuente y fecha de los datos —',
  },

  /* ── ÁREAS ───────────────────────────────────────────── */
  areas: [
    { area: 'Ventas y Mktg',    responsable: '—', comentarios: '—', estado: 'rev', fecha: '' },
    { area: 'Vendedor',         responsable: '—', comentarios: '—', estado: 'rev', fecha: '' },
    { area: 'Operaciones',      responsable: '—', comentarios: '—', estado: 'rev', fecha: '' },
    { area: 'Instalaciones',    responsable: '—', comentarios: '—', estado: 'rev', fecha: '' },
    { area: 'Servicio Técnico', responsable: '—', comentarios: '—', estado: 'rev', fecha: '' },
    { area: 'Operadores',       responsable: '—', comentarios: '—', estado: 'rev', fecha: '' },
    { area: 'Admin y Precios',  responsable: '—', comentarios: '—', estado: 'rev', fecha: '' },
    { area: 'Facturación',      responsable: '—', comentarios: '—', estado: 'rev', fecha: '' },
    { area: 'Procesos',         responsable: '—', comentarios: '—', estado: 'rev', fecha: '' },
  ],
};
