/**
 * Datos del organigrama institucional.
 * Fuente: Organigrama_SP_2025_1_0B.pptx (versión 11/8/25)
 *
 * Cómo cargar contenido:
 * - "funcionesGenerales": funciones generales del área (array de strings).
 * - "funcionesCargo": funciones específicas del cargo del responsable (array de strings).
 * Dejar [] mientras no estén redactadas: el modal muestra un placeholder automáticamente.
 *
 * type: "box"  -> nodo con marco propio en el diagrama (área/gerencia con responsable)
 * type: "item" -> nodo hoja sin marco (equipo/función listada bajo un área)
 */

export const ORGANIGRAMA_DATA = {
  id: "directorio",
  area: "Directorio",
  type: "box",
  responsable: "Fernando Ordoqui",
  cargo: "Presidente",
  funcionesGenerales: [],
  funcionesCargo: [],
  children: [
    {
      id: "gerencia-general",
      area: "Gerencia General",
      type: "box",
      responsable: "Federico Ordoqui",
      cargo: "Gerente General",
      funcionesGenerales: [],
      funcionesCargo: [],
      children: [
        {
          id: "asesoria-legal",
          area: "Asesoría Legal",
          type: "box",
          responsable: "Externo",
          cargo: "",
          funcionesGenerales: [],
          funcionesCargo: [],
          children: []
        },
        {
          id: "comite-ejecutivo",
          area: "Comité Ejecutivo",
          type: "box",
          responsable: "",
          cargo: "",
          funcionesGenerales: [],
          funcionesCargo: [],
          children: []
        },
        {
          id: "consultor-staff",
          area: "Consultor Staff",
          type: "box",
          responsable: "A. Petrikovich",
          cargo: "",
          funcionesGenerales: [],
          funcionesCargo: [],
          children: []
        },
        {
          id: "admin-finanzas-ger",
          area: "Administración y Finanzas",
          type: "box",
          responsable: "Belén Amar",
          cargo: "Gte. Admin. y Finanzas",
          funcionesGenerales: [],
          funcionesCargo: [],
          children: [
            {
              id: "admin-finanzas",
              area: "Admin y Finanzas",
              type: "box",
              responsable: "M. L. Juliano",
              cargo: "",
              funcionesGenerales: [],
              funcionesCargo: [],
              children: [
                { id: "facturacion", area: "Facturación", type: "item", funcionesGenerales: [], children: [] },
                { id: "cobranzas", area: "Cobranzas", type: "item", funcionesGenerales: [], children: [] },
                { id: "pago-proveedores", area: "Pago a Proveedores", type: "item", funcionesGenerales: [], children: [] },
                { id: "atencion-cliente", area: "Atención al Cliente", type: "item", funcionesGenerales: [], children: [] },
                { id: "tesoreria", area: "Tesorería", type: "item", funcionesGenerales: [], children: [] }
              ]
            },
            { id: "precios", area: "Precios", type: "item", funcionesGenerales: [], children: [] },
            { id: "estudio-contable", area: "Estudio Contable", type: "item", responsable: "Externo", funcionesGenerales: [], children: [] },
            { id: "admin-rrhh", area: "Admin. de RRHH", type: "item", funcionesGenerales: [], children: [] }
          ]
        },
        {
          id: "ventas-marketing",
          area: "Ventas y Marketing",
          type: "box",
          responsable: "Federico Ordoqui",
          cargo: "Gte. Ventas y Marketing",
          funcionesGenerales: [],
          funcionesCargo: [],
          children: [
            {
              id: "ventas-sp",
              area: "Ventas SP",
              type: "box",
              responsable: "Martin Ramos",
              cargo: "",
              funcionesGenerales: [],
              funcionesCargo: [],
              children: [
                { id: "vendedores-sp", area: "Vendedores SP", type: "item", funcionesGenerales: [], children: [] }
              ]
            },
            {
              id: "marketing",
              area: "Marketing",
              type: "box",
              responsable: "Externo",
              cargo: "",
              funcionesGenerales: [],
              funcionesCargo: [],
              children: []
            },
            {
              id: "proyectos-licitaciones",
              area: "Proyectos Esp. y Licitaciones",
              type: "box",
              responsable: "Federico Ordoqui",
              cargo: "",
              funcionesGenerales: [],
              funcionesCargo: [],
              children: [
                { id: "vendedores-atempo", area: "Vendedores Atempo", type: "item", funcionesGenerales: [], children: [] },
                { id: "preventa-sp", area: "Preventa SP", type: "item", funcionesGenerales: [], children: [] }
              ]
            }
          ]
        },
        {
          id: "compras-operaciones",
          area: "Compras y Operaciones Internas",
          type: "box",
          responsable: "Gonzalo Ordoqui",
          cargo: "Gte. Compras y Ops. Internas",
          funcionesGenerales: [],
          funcionesCargo: [],
          children: [
            { id: "compras-deposito", area: "Compras y Depósito", type: "box", responsable: "Gonzalo Ordoqui", cargo: "", funcionesGenerales: [], funcionesCargo: [], children: [] },
            { id: "operadores", area: "Operadores", type: "box", responsable: "Orlando De la Serna", cargo: "", funcionesGenerales: [], funcionesCargo: [], children: [] },
            {
              id: "vigiladores-acuda",
              area: "Vigiladores y Acuda",
              type: "box",
              responsable: "Osvaldo Suarez",
              cargo: "",
              funcionesGenerales: [],
              funcionesCargo: [],
              children: [
                { id: "mantenimiento-moviles", area: "Mantenimiento Móviles", type: "item", funcionesGenerales: [], children: [] }
              ]
            }
          ]
        },
        {
          id: "operaciones-tecnicas",
          area: "Operaciones Técnicas",
          type: "box",
          responsable: "Gonzalo Ordoqui",
          cargo: "Gte. Operaciones Técnicas",
          funcionesGenerales: [],
          funcionesCargo: [],
          children: [
            { id: "instalaciones", area: "Instalaciones", type: "box", responsable: "Eduardo / Walter", cargo: "", funcionesGenerales: [], funcionesCargo: [], children: [] },
            {
              id: "ampliaciones",
              area: "Ampliaciones",
              type: "box",
              responsable: "Federico Champané",
              cargo: "",
              funcionesGenerales: [],
              funcionesCargo: [],
              children: [
                { id: "operacion-tecnica-ampliaciones", area: "Operación Técnica de Ampliaciones", type: "item", funcionesGenerales: [], children: [] },
                { id: "comunicaciones-renovacion-tecnologias", area: "Comunicaciones y Renovación de Tecnologías", type: "item", funcionesGenerales: [], children: [] }
              ]
            },
            { id: "servicio-tecnico", area: "Servicio Técnico", type: "box", responsable: "Alejandro Pesce", cargo: "", funcionesGenerales: [], funcionesCargo: [], children: [] }
          ]
        },
        {
          id: "infraestructura-it",
          area: "Infraestructura Tecnológica e Innovación",
          type: "box",
          responsable: "Fernando Ordoqui",
          cargo: "Gte. Inf. Tecnología e Innovación",
          funcionesGenerales: [],
          funcionesCargo: [],
          children: [
            {
              id: "it-comunicaciones",
              area: "Infraestructura y Tecnología en Comunicaciones",
              type: "box",
              responsable: "Gunther Block",
              cargo: "",
              funcionesGenerales: [],
              funcionesCargo: [],
              children: [
                { id: "soporte-it", area: "Soporte de IT", type: "item", funcionesGenerales: [], children: [] }
              ]
            },
            { id: "nuevas-tecnologias", area: "Nuevas Tecnologías y Productos", type: "box", responsable: "Facundo Salas", cargo: "", funcionesGenerales: [], funcionesCargo: [], children: [] },
            {
              id: "operaciones-atempo",
              area: "Operaciones Atempo",
              type: "box",
              responsable: "Fernando Ordoqui",
              cargo: "",
              funcionesGenerales: [],
              funcionesCargo: [],
              children: [
                { id: "teleasistentes-atempo", area: "Teleasistentes Atempo", type: "item", funcionesGenerales: [], children: [] },
                { id: "instalador-atempo", area: "Instalador Atempo", type: "item", funcionesGenerales: [], children: [] }
              ]
            }
          ]
        },
        {
          id: "procesos-mejora",
          area: "Procesos y Mejora Continua",
          type: "box",
          responsable: "Martin Wolcan",
          cargo: "Gte. Procesos y Mejora Continua",
          funcionesGenerales: [],
          funcionesCargo: [],
          children: [
            { id: "posventa-sp", area: "Posventa SP", type: "item", funcionesGenerales: [], children: [] }
          ]
        }
      ]
    }
  ]
};
