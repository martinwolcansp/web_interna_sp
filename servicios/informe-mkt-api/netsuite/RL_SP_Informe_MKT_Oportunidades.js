/**
 * RL_SP_Informe_MKT_Oportunidades.js
 *
 * RESTlet para el Informe MKT (informe-mkt-api). Ejecuta la busqueda guardada
 * "Oportunidades por vendedor - detalle" (la misma que hoy se exporta a
 * Excel como ResultadosSPFedeOportunidadesporVendedorDetalle.xlsx) y devuelve
 * una fila por resultado, con las MISMAS etiquetas de columna que el Excel.
 *
 * GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *   Agrega un filtro "dentro de" sobre el campo de fecha configurado
 *   (parametro del script, por defecto trandate). Por eso la busqueda
 *   guardada NO debe tener su propio criterio de fecha (ej. "este mes"):
 *   si lo tiene, los dos filtros se suman y el resultado queda vacio
 *   fuera de ese mes.
 *
 * Parametros del script (Deployment):
 *   custscript_sp_mkt_search_id   ID de la busqueda guardada (ej. customsearch_sp_opp_vendedor)
 *   custscript_sp_mkt_date_field  Campo de fecha a filtrar (default: trandate)
 *
 * Se llama con Content-Type: application/json para que NetSuite serialice
 * el objeto devuelto.
 *
 * Respuesta: { ok, searchId, total, columns: [...], rows: [{<etiqueta>: valor}, ...] }
 *
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/search', 'N/format', 'N/runtime', 'N/log'], (search, format, runtime, log) => {

  const parseFecha = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) throw new Error(`Fecha invalida: "${s}" (formato esperado YYYY-MM-DD)`);
    return format.format({ value: new Date(+m[1], +m[2] - 1, +m[3]), type: format.Type.DATE });
  };

  const get = (params) => {
    try {
      const script = runtime.getCurrentScript();
      const searchId = script.getParameter({ name: 'custscript_sp_mkt_search_id' });
      const campoFecha = script.getParameter({ name: 'custscript_sp_mkt_date_field' }) || 'trandate';
      if (!searchId) throw new Error('Falta configurar custscript_sp_mkt_search_id en el deployment.');

      const s = search.load({ id: searchId });
      if (params.desde || params.hasta) {
        if (!params.desde || !params.hasta) throw new Error('Hay que pasar desde y hasta juntos.');
        s.filters.push(search.createFilter({
          name: campoFecha,
          operator: search.Operator.WITHIN,
          values: [parseFecha(params.desde), parseFecha(params.hasta)],
        }));
      }

      // Etiquetas unicas (si dos columnas tienen la misma etiqueta se numeran).
      const usadas = {};
      const etiquetas = s.columns.map((col) => {
        let label = col.label || col.name;
        if (usadas[label]) { usadas[label] += 1; label = `${label} (${usadas[label]})`; } else { usadas[label] = 1; }
        return label;
      });

      const rows = [];
      const paged = s.runPaged({ pageSize: 1000 });
      paged.pageRanges.forEach((range) => {
        paged.fetch({ index: range.index }).data.forEach((r) => {
          const fila = {};
          s.columns.forEach((col, i) => {
            const texto = r.getText(col);
            const valor = r.getValue(col);
            // Como el Excel: para listas/registros se muestra el texto.
            fila[etiquetas[i]] = (texto !== null && texto !== undefined && texto !== '') ? texto : valor;
          });
          rows.push(fila);
        });
      });

      return { ok: true, searchId, total: rows.length, columns: etiquetas, rows };
    } catch (e) {
      log.error('RL_SP_Informe_MKT_Oportunidades', e);
      return { ok: false, error: e.message || String(e) };
    }
  };

  return { get };
});
