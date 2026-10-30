/* ============================================================
   clientes-informe.js — Funciones comunes de los informes del mosaico
   "Clientes activos" (pages/clientes-activos/segmentacion.html y
   bajas.html): formato, filtros con casillas, barras, barra de
   actualizacion (boton + seguimiento de la corrida + historial) y
   descarga a Excel.

   Mismo comportamiento que pages/indicadores-area/posventa.html.
   Expone window.CI.
   ============================================================ */
(function () {
  "use strict";

  // URL del servicio clientes-api en Coolify.
  var API_BASE_URL = "https://clientes-api.200.5.196.50.sslip.io";
  // Direccion de la web interna habilitada en ALLOWED_ORIGINS del servicio.
  var ORIGEN_WEB = "https://portal.blogdns.com";
  var TZ = "America/Argentina/Buenos_Aires";
  var POLL_MS = 4000;
  var HISTORIAL = 20;
  var MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  var URL_CLIENTE_NS = "https://7138551.app.netsuite.com/app/common/entity/custjob.nl?id=";
  var URL_CONTACTO_GHL = "https://app.gohighlevel.com/v2/location/goympjLjeLIBzCFxsbFM/contacts/detail/";
  var EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
  var XL_NAVY = "FF1F3864", XL_GRIS = "FF52514E", XL_LINK = "FF2A78D6", XL_TOTAL = "FFDFE6F2";

  var sb = window.supabaseClient;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDia(s) { if (!s) return ""; var p = String(s).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function fmtDiaLocal(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function fmtFechaHora(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " + d.toLocaleTimeString("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }) + " hs";
  }
  function num(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    return Number(n).toLocaleString("es-AR", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  function pct(a, b, dec) { return b ? num(100 * a / b, dec || 0) + "%" : "–"; }
  function contar(lista, clave) {
    var m = {};
    lista.forEach(function (x) { var k = clave(x); m[k] = (m[k] || 0) + 1; });
    return m;
  }
  function paresOrdenados(mapa) {
    return Object.keys(mapa).map(function (k) { return [k, mapa[k]]; })
      .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
  }
  function hace(iso) {
    var min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return "recién";
    if (min < 60) return "hace " + min + " min";
    var h = Math.floor(min / 60);
    if (h < 24) return "hace " + h + (h === 1 ? " hora" : " horas");
    var d = Math.floor(h / 24);
    return "hace " + d + (d === 1 ? " día" : " días");
  }
  function linkNS(id, texto) {
    return id ? '<a href="' + URL_CLIENTE_NS + encodeURIComponent(id) + '" target="_blank" rel="noopener">' + esc(texto || id) + "</a>" : esc(texto || "");
  }
  function linkGHL(id, texto) {
    return id ? '<a href="' + URL_CONTACTO_GHL + encodeURIComponent(id) + '" target="_blank" rel="noopener">' + esc(texto || id) + "</a>" : "";
  }
  function kpis(lista) {
    return lista.map(function (k) {
      return '<div class="kpi-card"><div class="kpi-num">' + k.num + "</div>" +
        '<div class="kpi-label">' + esc(k.label) + "</div>" + (k.det ? '<div class="kpi-det">' + k.det + "</div>" : "") + "</div>";
    }).join("");
  }
  // Barras horizontales. pares: [[etiqueta, n]]; total para el %; opciones.clic: data-valor clickeable.
  function barras(pares, total, opciones) {
    opciones = opciones || {};
    if (!pares.length) return '<p class="vacio">Sin datos.</p>';
    var max = Math.max.apply(null, pares.map(function (p) { return p[1]; })) || 1;
    return '<div class="barras">' + pares.map(function (p) {
      return '<div class="barra' + (opciones.clic ? ' barra--clic" data-valor="' + esc(p[0]) : "") + '">' +
        '<span class="barra-et" title="' + esc(p[0]) + '">' + esc(p[0]) + "</span>" +
        '<span class="barra-pista"><span class="barra-relleno' + (opciones.sec ? " barra-relleno--sec" : "") +
        '" style="width:' + (100 * p[1] / max).toFixed(1) + '%"></span></span>' +
        '<span class="barra-n"><strong>' + num(p[1]) + "</strong>" + (total ? " · " + pct(p[1], total, 1) : "") + "</span></div>";
    }).join("") + "</div>";
  }

  // ---------- Filtros con casillas (vacio = todos) ----------
  function crearFiltro(contenedor, id, nombre, opciones, alCambiar) {
    var estado = { elegidos: new Set() };
    var cont = document.createElement("div");
    cont.className = "chk-filtro";
    cont.innerHTML =
      '<button type="button" class="chk-btn" aria-expanded="false" aria-haspopup="true" id="' + id + '-btn">' +
      '<span class="chk-nombre">' + esc(nombre) + ':</span> <span class="chk-valor">Todos</span> &#9662;</button>' +
      '<div class="chk-panel" id="' + id + '-panel" hidden role="group" aria-label="' + esc(nombre) + '">' +
      '<label class="chk-op chk-op--todos"><input type="checkbox" data-todos="1" checked> Seleccionar todo</label>' +
      opciones.map(function (o) {
        return '<label class="chk-op"><input type="checkbox" value="' + esc(o.valor) + '" checked> ' + esc(o.etiqueta) + "</label>";
      }).join("") + "</div>";
    contenedor.appendChild(cont);
    var btn = cont.querySelector(".chk-btn");
    var panel = cont.querySelector(".chk-panel");
    var todos = panel.querySelector("[data-todos]");
    var casillas = Array.prototype.slice.call(panel.querySelectorAll("input:not([data-todos])"));
    function pintarBoton() {
      var marcadas = casillas.filter(function (c) { return c.checked; });
      btn.querySelector(".chk-valor").textContent = marcadas.length === casillas.length ? "Todos"
        : marcadas.length === 0 ? "Ninguno"
        : marcadas.length === 1 ? marcadas[0].parentNode.textContent.trim()
        : marcadas.length + " elegidos";
      btn.classList.toggle("chk-activo", marcadas.length !== casillas.length);
      todos.checked = marcadas.length === casillas.length;
      todos.indeterminate = marcadas.length > 0 && marcadas.length < casillas.length;
    }
    function leer() {
      var marcadas = casillas.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      estado.elegidos = marcadas.length === casillas.length ? new Set() : new Set(marcadas.length ? marcadas : ["__ninguno__"]);
      pintarBoton();
      alCambiar();
    }
    todos.addEventListener("change", function () { casillas.forEach(function (c) { c.checked = todos.checked; }); leer(); });
    casillas.forEach(function (c) { c.addEventListener("change", leer); });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = panel.hidden;
      document.querySelectorAll(".chk-panel").forEach(function (p) { p.hidden = true; });
      document.querySelectorAll(".chk-btn").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
      panel.hidden = !abrir;
      btn.setAttribute("aria-expanded", abrir ? "true" : "false");
    });
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    return {
      pasa: function (valor) { return estado.elegidos.size === 0 || estado.elegidos.has(String(valor)); },
      activo: function () { return estado.elegidos.size > 0; },
      // Elegir un solo valor desde afuera (click en una barra).
      solo: function (valor) { casillas.forEach(function (c) { c.checked = c.value === String(valor); }); leer(); },
      limpiar: function () { casillas.forEach(function (c) { c.checked = true; }); estado.elegidos = new Set(); pintarBoton(); },
      etiquetas: function () {
        if (!estado.elegidos.size) return null;
        return casillas.filter(function (c) { return c.checked; }).map(function (c) { return c.parentNode.textContent.trim(); });
      },
    };
  }
  document.addEventListener("click", function () {
    document.querySelectorAll(".chk-panel").forEach(function (p) { p.hidden = true; });
    document.querySelectorAll(".chk-btn").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") document.querySelectorAll(".chk-panel").forEach(function (p) { p.hidden = true; });
  });
  function opcionesDe(lista, clave, orden) {
    var vals = Array.from(new Set(lista.map(clave)));
    vals.sort(orden || function (a, b) { return String(a).localeCompare(String(b), "es"); });
    return vals.map(function (v) { return { valor: v, etiqueta: v }; });
  }

  // ---------- Lectura paginada de Supabase ----------
  // filtros: [[metodo, columna, valor]] (ej. ["eq", "vigente", true])
  async function leerTodo(tabla, select, orden, filtros) {
    var filas = [], desde = 0, PAG = 1000;
    for (;;) {
      var q = sb.from(tabla).select(select);
      (filtros || []).forEach(function (f) { q = q[f[0]](f[1], f[2]); });
      var r = await q.order(orden, { ascending: true }).range(desde, desde + PAG - 1);
      if (r.error) throw new Error(tabla + ": " + r.error.message);
      filas = filas.concat(r.data);
      if (r.data.length < PAG) return filas;
      desde += PAG;
    }
  }

  // ---------- Pestañas ----------
  function iniciarPestanas() {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-tab");
        document.querySelectorAll(".tab-btn").forEach(function (b) {
          b.classList.toggle("active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.toggle("active", p.id === "panel-" + id); });
      });
    });
  }

  function sinAcceso(mensaje) {
    document.querySelector(".wrap").innerHTML = '<div class="aviso-acceso">' + esc(mensaje) + "</div>";
  }

  async function permisos(seccion) {
    var s = await sb.auth.getSession();
    if (!s.data || !s.data.session) return { sesion: false };
    var r = await Promise.all([
      sb.rpc("fn_tiene_permiso", { p_seccion_id: seccion, p_nivel: "ver" }),
      sb.rpc("fn_tiene_permiso", { p_seccion_id: seccion, p_nivel: "editar" }),
    ]);
    return { sesion: true, ver: r[0].data === true, editar: r[1].data === true };
  }

  // ---------- Barra de actualizacion ----------
  // cfg: { informe, puedeEditar, periodo() -> "AAAA-MM" | null, alTerminar() async,
  //        detalleCorrida(c) -> texto, filtroCorridas(q) -> q }
  function barraActualizacion(cfg) {
    var pollTimer = null;
    var textoBoton = $("upd-btn").textContent;
    function setEstado(texto, tipo) {
      var el = $("upd-estado");
      el.textContent = texto || "";
      el.className = "upd-estado" + (tipo ? " upd-estado--" + tipo : "");
    }
    function bloquear(b) {
      $("upd-btn").disabled = b;
      $("upd-btn").textContent = b ? "Actualizando…" : textoBoton;
    }
    function textoBotonNuevo(t) { textoBoton = t; if (!$("upd-btn").disabled) $("upd-btn").textContent = t; }
    async function cargarHistorial() {
      var r = await sb.from("cli_corrida").select("id,estado,origen,periodo,iniciado_en,finalizado_en,mensaje,paso,stats")
        .eq("informe", cfg.informe).order("iniciado_en", { ascending: false }).limit(HISTORIAL);
      var body = $("upd-hist-body");
      if (r.error) { body.innerHTML = '<tr><td colspan="4">No se pudo leer el historial: ' + esc(r.error.message) + "</td></tr>"; return; }
      if (!r.data.length) { body.innerHTML = '<tr><td colspan="4">Todavía no hay actualizaciones.</td></tr>'; return; }
      var etiquetas = { ok: "OK", error: "Error", en_curso: "En curso" };
      body.innerHTML = r.data.map(function (c) {
        var detalle = c.estado === "en_curso" ? (c.paso || "") : c.estado === "error" ? (c.mensaje || "")
          : [cfg.detalleCorrida ? cfg.detalleCorrida(c) : "", c.mensaje].filter(Boolean).join(" · ");
        if (detalle.length > 220) detalle = detalle.slice(0, 220) + "…";
        return "<tr><td>" + esc(fmtFechaHora(c.finalizado_en || c.iniciado_en)) + "</td>" +
          "<td>" + (c.origen === "automatica" ? "Automática" : "Manual") + "</td>" +
          '<td><span class="upd-tag upd-tag--' + esc(c.estado) + '">' + esc(etiquetas[c.estado] || c.estado) + "</span></td>" +
          '<td class="upd-det">' + esc(detalle) + "</td></tr>";
      }).join("");
    }
    function seguir(id) {
      bloquear(true);
      setEstado("Actualizando…");
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async function () {
        var r = await sb.from("cli_corrida").select("estado,paso,mensaje").eq("id", id).single();
        if (r.error) { setEstado("No se pudo consultar el avance: " + r.error.message, "error"); return; }
        var c = r.data;
        if (c.estado === "en_curso") { setEstado("Actualizando: " + (c.paso || "…")); return; }
        clearInterval(pollTimer); pollTimer = null;
        bloquear(false);
        if (c.estado === "ok") {
          setEstado(c.mensaje ? "Actualización terminada con avisos: " + c.mensaje : "Actualización terminada.", c.mensaje ? "error" : "ok");
          await cfg.alTerminar();
        } else {
          setEstado("La actualización falló: " + (c.mensaje || "error desconocido") + ". Se siguen mostrando los datos anteriores.", "error");
        }
        if (!$("upd-panel").hidden) cargarHistorial();
      }, POLL_MS);
    }
    async function diagnosticoConexion(e) {
      var alcanzable = true;
      try { await fetch(API_BASE_URL + "/health", { mode: "no-cors", cache: "no-store" }); }
      catch (x) { alcanzable = false; }
      if (!alcanzable) {
        return "No hay conexión con el servicio de actualización desde esta PC. Puede estar reiniciándose " +
          "(probá de nuevo en un minuto) o la red de esta PC bloquea " + API_BASE_URL + ".";
      }
      if (location.origin !== ORIGEN_WEB) {
        return "Abriste la web interna desde " + location.origin + " y el servicio de actualización sólo acepta " +
          ORIGEN_WEB + ". Ingresá desde esa dirección y volvé a intentar.";
      }
      return "El servicio responde pero el navegador bloqueó la llamada (" + e.message + ").";
    }
    async function actualizar() {
      bloquear(true);
      setEstado("Iniciando actualización…");
      var s = await sb.auth.getSession();
      var token = s.data && s.data.session && s.data.session.access_token;
      if (!token) { bloquear(false); setEstado("Tu sesión venció: volvé a ingresar a la web interna.", "error"); return; }
      var url = API_BASE_URL + "/clientes/" + cfg.informe + "/actualizar";
      var periodo = cfg.periodo ? cfg.periodo() : null;
      if (periodo) url += "?periodo=" + encodeURIComponent(periodo);
      var pedir = function () { return fetch(url, { method: "POST", headers: { Authorization: "Bearer " + token } }); };
      try {
        var resp;
        try { resp = await pedir(); }
        catch (e1) {
          setEstado("Reintentando la conexión con el servicio…");
          await new Promise(function (r) { setTimeout(r, 3000); });
          resp = await pedir();
        }
        var body = await resp.json().catch(function () { return {}; });
        if (resp.status === 409 && body.detail && body.detail.corrida_id) {
          setEstado("Ya había una actualización en curso; se muestra su avance.");
          seguir(body.detail.corrida_id);
          return;
        }
        if (!resp.ok) {
          var det = body.detail;
          bloquear(false);
          setEstado("No se pudo iniciar la actualización: " + (typeof det === "string" ? det : (det && det.mensaje) || "error " + resp.status), "error");
          return;
        }
        seguir(body.corrida_id);
      } catch (e) {
        bloquear(false);
        setEstado(await diagnosticoConexion(e), "error");
      }
    }
    $("upd-btn").hidden = !cfg.puedeEditar;
    $("upd-menu-btn").hidden = !cfg.puedeEditar;
    $("upd-btn").addEventListener("click", actualizar);
    $("upd-menu-btn").addEventListener("click", function () {
      var abrir = $("upd-panel").hidden;
      $("upd-panel").hidden = !abrir;
      $("upd-menu-btn").setAttribute("aria-expanded", abrir ? "true" : "false");
      if (abrir) cargarHistorial();
    });
    return {
      setEstado: setEstado,
      textoBoton: textoBotonNuevo,
      seguirSiHayEnCurso: async function () {
        if (!cfg.puedeEditar) return;
        var r = await sb.from("cli_corrida").select("id").eq("informe", cfg.informe).eq("estado", "en_curso").limit(1);
        if (r.data && r.data.length) seguir(r.data[0].id);
      },
    };
  }

  // ---------- Excel ----------
  function cargarExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!window.__exceljsCarga) {
      window.__exceljsCarga = new Promise(function (ok, mal) {
        var s = document.createElement("script");
        s.src = EXCELJS_URL;
        s.onload = function () { ok(window.ExcelJS); };
        s.onerror = function () { window.__exceljsCarga = null; mal(new Error("no se pudo cargar la librería de Excel")); };
        document.head.appendChild(s);
      });
    }
    return window.__exceljsCarga;
  }
  function xlFecha(s) {
    if (!s) return null;
    var p = String(s).slice(0, 10).split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function xlLink(texto, url) { return texto && url ? { text: String(texto), hyperlink: url } : (texto || null); }
  // Hoja con titulo en las filas 1-3 y una tabla desde la fila 5.
  // columnas: [{titulo, ancho, fmt, ajustar}]; filas: arrays de valores.
  function xlHoja(wb, nombre, titulo, subtitulo, columnas, filas) {
    var ws = wb.addWorksheet(nombre);
    ws.getCell("A1").value = titulo;
    ws.getCell("A1").font = { bold: true, size: 14, color: { argb: XL_NAVY } };
    ws.getCell("A2").value = subtitulo || "";
    ws.getCell("A3").value = "Exportado el " + fmtFechaHora(new Date().toISOString());
    ["A2", "A3"].forEach(function (c) { ws.getCell(c).font = { size: 10, color: { argb: XL_GRIS } }; });
    var desde = 5, enc = ws.getRow(desde);
    enc.height = 30;
    columnas.forEach(function (c, i) {
      ws.getColumn(i + 1).width = c.ancho || 14;
      var cel = enc.getCell(i + 1);
      cel.value = c.titulo;
      cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_NAVY } };
      cel.alignment = { vertical: "middle", wrapText: true };
    });
    filas.forEach(function (f, j) {
      var row = ws.getRow(desde + 1 + j);
      f.forEach(function (v, i) {
        var cel = row.getCell(i + 1), c = columnas[i] || {};
        cel.value = v === undefined || v === "" ? null : v;
        if (c.fmt) cel.numFmt = c.fmt;
        cel.alignment = c.ajustar ? { vertical: "top", wrapText: true } : { vertical: "top" };
        if (v && typeof v === "object" && v.hyperlink) cel.font = { color: { argb: XL_LINK }, underline: true };
        if (c.total && j === filas.length - 1) { cel.font = { bold: true, color: { argb: XL_NAVY } }; cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_TOTAL } }; }
      });
    });
    if (filas.length) ws.autoFilter = { from: { row: desde, column: 1 }, to: { row: desde, column: columnas.length } };
    ws.views = [{ state: "frozen", ySplit: desde }];
    return ws;
  }
  async function descargarLibro(wb, nombre) {
    var buf = await wb.xlsx.writeBuffer();
    var url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    var a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  async function exportar(btn, generar, setEstado) {
    if (btn.disabled) return;
    var html = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Generando…";
    try { await generar(await cargarExcelJS()); }
    catch (e) { if (setEstado) setEstado("No se pudo generar el Excel: " + e.message, "error"); }
    finally { btn.disabled = false; btn.innerHTML = html; }
  }

  window.CI = {
    sb: sb, $: $, esc: esc, fmtDia: fmtDia, fmtDiaLocal: fmtDiaLocal, fmtFechaHora: fmtFechaHora, num: num, pct: pct,
    contar: contar, paresOrdenados: paresOrdenados, hace: hace, linkNS: linkNS, linkGHL: linkGHL, kpis: kpis, barras: barras,
    crearFiltro: crearFiltro, opcionesDe: opcionesDe, leerTodo: leerTodo, iniciarPestanas: iniciarPestanas,
    sinAcceso: sinAcceso, permisos: permisos, barraActualizacion: barraActualizacion,
    xlFecha: xlFecha, xlLink: xlLink, xlHoja: xlHoja, descargarLibro: descargarLibro, exportar: exportar,
    MESES: MESES, TZ: TZ, URL_CLIENTE_NS: URL_CLIENTE_NS, URL_CONTACTO_GHL: URL_CONTACTO_GHL,
  };
})();
