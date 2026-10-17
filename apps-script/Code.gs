// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const SHEET_ID    = '1fF570SfF8ZdQd11VQzkahrKQQdMvsGt9DO1PtreksY8';
const SHEET_NAME  = 'Gastos';
const COLUMNAS    = 12;    // A..L — tiene que coincidir con la FILA 1 de la hoja
const LOTES_PROP  = 'lotesEscritos';
const LOTES_MAX   = 100;   // cuántos loteId recordamos para descartar repetidos

// Posición de cada columna (1 = A), en el orden de armarFila
const COL = {
  TS: 1, QUIEN: 2, CORRESPONDE: 3, DESC: 4, CATEGORIA: 5, MONTO: 6,
  MEDIO: 7, ES_CUOTAS: 8, MONTO_CUOTA: 9, MES: 10, MES_NUM: 11, ANIO: 12,
};
const RE_SUFIJO_CUOTA = /\s*(\d+)\s*\/\s*(\d+)\s*$/;

// ─── doPost ───────────────────────────────────────────────────────────────────
// Sin "accion" es el alta de siempre ({ loteId, filas }). Los tableros mandan
// además accion: 'listar', 'editar' o 'eliminar'.
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return corsResponse({ ok: false, error: 'Pedido inválido' });
  }

  // Listar solo lee: no toma el lock, así abrir el tablero no frena las altas.
  if (payload.accion === 'listar') {
    try {
      return corsResponse({ ok: true, gastos: listar(hoja()) });
    } catch (err) {
      return corsResponse({ ok: false, error: err.message });
    }
  }

  // getLastRow() + setValues() es lectura-y-después-escritura: sin lock, dos
  // envíos simultáneos leen la misma última fila y el segundo pisa al primero.
  // Con appendRow no hacía falta porque era atómico. Editar y eliminar también
  // van por acá: un alta no puede caer en medio de un borrado que corre filas.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return corsResponse({ ok: false, error: 'Hay otro envío en curso. Reintentá en unos segundos.' });
  }

  try {
    const sheet = hoja();
    if (!sheet) {
      return corsResponse({ ok: false, error: 'Hoja "' + SHEET_NAME + '" no encontrada' });
    }

    // La hoja manda. Si el encabezado no tiene el ancho que escribimos, cortamos
    // acá: escribir corrido no falla, se ve bien en la planilla y desaparece del
    // tablero, que es el peor lugar para enterarse.
    const anchoHoja = anchoEncabezado(sheet);
    if (anchoHoja !== COLUMNAS) {
      return corsResponse({
        ok: false,
        error: 'La hoja tiene ' + anchoHoja + ' columnas con encabezado y el script escribe ' +
               COLUMNAS + '. Nadie escribió nada.'
      });
    }

    if (payload.accion === 'editar') return corsResponse(editar(sheet, payload));
    if (payload.accion === 'eliminar') return corsResponse(eliminar(sheet, payload));
    if (payload.accion) return corsResponse({ ok: false, error: 'Acción desconocida' });

    return corsResponse(alta(sheet, payload));

  } catch (err) {
    return corsResponse({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

function hoja() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

// ─── Alta ─────────────────────────────────────────────────────────────────────
function alta(sheet, payload) {
  const filas  = payload.filas;
  const loteId = payload.loteId || null;

  if (!filas || !Array.isArray(filas) || filas.length === 0) {
    return { ok: false, error: 'Sin filas' };
  }

  // Si este lote ya se escribió, no lo repetimos. Cubre el reintento después
  // de un error ambiguo y la doble ejecución del mismo request.
  const props = PropertiesService.getScriptProperties();
  const lotes = JSON.parse(props.getProperty(LOTES_PROP) || '[]');
  if (loteId && lotes.indexOf(loteId) !== -1) {
    return { ok: true, insertadas: 0, duplicado: true };
  }

  const ahora   = new Date();
  const valores = filas.map(function (f) { return armarFila(f, ahora); });

  // Una sola escritura en vez de una por fila
  sheet.getRange(sheet.getLastRow() + 1, 1, valores.length, COLUMNAS).setValues(valores);
  SpreadsheetApp.flush();

  // Recién ahora damos el lote por escrito, y todavía dentro del lock
  if (loteId) {
    lotes.push(loteId);
    while (lotes.length > LOTES_MAX) lotes.shift();
    props.setProperty(LOTES_PROP, JSON.stringify(lotes));
  }

  return { ok: true, insertadas: valores.length };
}

// ─── Cuántas columnas con encabezado tiene la hoja ───────────────────────────
function anchoEncabezado(sheet) {
  const ultima = sheet.getLastColumn();
  if (ultima < 1) return 0;
  return sheet.getRange(1, 1, 1, ultima).getValues()[0].filter(String).length;
}

// ─── Una fila del payload → una fila de la hoja ──────────────────────────────
// El orden es el de la fila 1 de la hoja, no el del payload. numeroCuota y
// totalCuotas no tienen columna propia: viven en la descripción.
function armarFila(f, ahora) {
  const descripcion = f.esCuotas === 'Sí'
    ? (f.descripcion || '') + ' ' + f.numeroCuota + '/' + f.totalCuotas
    : (f.descripcion || '');

  return [
    ahora,                // A - Marca temporal (servidor)
    f.quienPago,          // B - Quién pagó
    f.correspondea,       // C - Corresponde a
    descripcion,          // D - Descripción
    f.categoria,          // E - Categoría
    f.monto,              // F - Monto (input original)
    f.medioPago,          // G - Medio de pago
    f.esCuotas,           // H - Es en cuotas
    f.montoCuota,         // I - Monto cuota
    f.mesResumen,         // J - Mes del resumen (texto)
    f.mesResumenNumero,   // K - Mes del resumen (número)
    f.anioResumen,        // L - Año del resumen
  ];
}

// ─── Listar ───────────────────────────────────────────────────────────────────
// La marca temporal y la descripción van como se ven en la hoja: son las que
// identifican la fila cuando después se pide editarla o eliminarla.
function listar(sheet) {
  const n = sheet.getLastRow() - 1;
  if (n < 1) return [];
  const rango   = sheet.getRange(2, 1, n, COLUMNAS);
  const valores = rango.getValues();
  const vistos  = rango.getDisplayValues();

  return valores.map(function (r, i) {
    return {
      fila:        i + 2,
      ts:          vistos[i][COL.TS - 1],
      quien:       r[COL.QUIEN - 1],
      corresponde: r[COL.CORRESPONDE - 1],
      descripcion: vistos[i][COL.DESC - 1],
      categoria:   r[COL.CATEGORIA - 1],
      monto:       Number(r[COL.MONTO - 1]) || 0,
      medio:       r[COL.MEDIO - 1],
      esCuotas:    r[COL.ES_CUOTAS - 1],
      montoCuota:  Number(r[COL.MONTO_CUOTA - 1]) || 0,
      mes:         Number(r[COL.MES_NUM - 1]) || 0,
      anio:        Number(r[COL.ANIO - 1]) || 0,
    };
  }).filter(function (g) { return g.descripcion; });
}

// ─── Editar / eliminar ────────────────────────────────────────────────────────
// Cada fila llega con la marca temporal y la descripción que leyó el tablero.
// Si alguna no coincide (la hoja se movió desde que se cargó), no se toca nada.
function filasCoinciden(sheet, filas) {
  if (!filas || !Array.isArray(filas) || filas.length === 0) return false;
  const ultima = sheet.getLastRow();
  return filas.every(function (f) {
    if (!(f.fila >= 2) || f.fila > ultima) return false;
    const vistos = sheet.getRange(f.fila, 1, 1, COL.DESC).getDisplayValues()[0];
    return vistos[COL.TS - 1] === f.ts && vistos[COL.DESC - 1] === f.descripcion;
  });
}

function eliminar(sheet, payload) {
  if (!filasCoinciden(sheet, payload.filas)) return { ok: false, error: 'no_encontrado' };
  // De abajo hacia arriba, para que borrar una no corra las otras
  payload.filas
    .map(function (f) { return f.fila; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (f) { sheet.deleteRow(f); });
  return { ok: true, eliminadas: payload.filas.length };
}

function editar(sheet, payload) {
  const c = payload.cambios || {};
  const descripcion = String(c.descripcion || '').trim();
  const montoCuota  = Number(c.montoCuota);
  if (!descripcion || !(montoCuota > 0)) return { ok: false, error: 'Faltan descripción o monto' };
  if (!filasCoinciden(sheet, payload.filas)) return { ok: false, error: 'no_encontrado' };

  payload.filas.forEach(function (f) {
    const rango = sheet.getRange(f.fila, 1, 1, COLUMNAS);
    const fila  = rango.getValues()[0];

    // Cada cuota conserva su "N/T" y el monto total sale de la cuota. La marca
    // temporal no se toca: es la que agrupa las cuotas de una misma compra.
    const suf  = String(fila[COL.DESC - 1]).match(RE_SUFIJO_CUOTA);
    const esCuotas = fila[COL.ES_CUOTAS - 1] === 'Sí' && suf;
    const total = esCuotas ? Number(suf[2]) : 1;

    fila[COL.DESC - 1]        = esCuotas ? descripcion + ' ' + suf[1] + '/' + suf[2] : descripcion;
    fila[COL.MONTO_CUOTA - 1] = montoCuota;
    fila[COL.MONTO - 1]       = montoCuota * total;
    if (c.categoria) fila[COL.CATEGORIA - 1] = c.categoria;
    if (c.medioPago) fila[COL.MEDIO - 1]     = c.medioPago;
    if (c.quienPago) fila[COL.QUIEN - 1]     = c.quienPago;
    rango.setValues([fila]);
  });
  return { ok: true, editadas: payload.filas.length };
}

// ─── doGet (health check) ─────────────────────────────────────────────────────
// Abrí la URL /exec en el navegador: si ves version 4, la implementación ya
// está sirviendo este código (con listar, editar y eliminar). Si ves 3, quedó
// la vieja.
function doGet(e) {
  return corsResponse({ ok: true, msg: 'Gastos Compartidos API activa', version: 4 });
}

// ─── Helper de respuesta ──────────────────────────────────────────────────────
function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Utilidad manual: olvidar los lotes recordados ───────────────────────────
// Corrila desde el editor si alguna vez necesitás reenviar un lote a propósito.
function limpiarLotes() {
  PropertiesService.getScriptProperties().deleteProperty(LOTES_PROP);
}
