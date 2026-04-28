const SPREADSHEET_ID         = '1RwnfYqtCEa3uqYQPKYfkJ1VLTeP7wAQLZZwdtqZiagU';
const DATOS_SHEET_NAME       = 'Datos';
const SOLICITUDES_GID        = 873778573; // sheet ID de "Solicitudes de Compra"
const SOLICITUDES_FOLDER_ID  = '1cbkFNgDB9msI5lGx7heh4uzJYSlJjkXv'; // carpeta raíz de Solicitudes en Drive

// ─── ODOO (completar antes de usar) ───────────────────────────
// La API Key se guarda en: Script Properties → ODOO_API_KEY
const ODOO_URL  = 'https://ncmservicios.odoo.com'; // ej: 'https://miempresa.odoo.com'
const ODOO_DB   = 'ncmservicios-main-17277747'; // nombre de la base de datos de Odoo
const ODOO_USER = 'ignaciodiel.ncm@outlook.com'; // email del usuario Odoo

// ─────────────────────────────────────────────
// Menú personalizado en Google Sheets
// ─────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('NCM Compras')
    .addItem('🔄 Sincronizar proveedores Odoo', 'sincronizarProveedoresOdoo')
    .addItem('🧪 Testear conexión Odoo', 'testConexionOdooUI')
    .addToUi();
}

function testConexionOdooUI() {
  const resultado = testConexionOdoo();
  const ok = resultado.autenticacion && resultado.autenticacion.ok;
  SpreadsheetApp.getUi().alert(
    ok ? '✅ Conexión OK' : '❌ Error de conexión',
    JSON.stringify(resultado, null, 2),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────

function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'getSolicitantes') {
      return jsonResponse(getSolicitantes());
    }

    if (action === 'getProyectos') {
      return jsonResponse(getProyectos(e.parameter.solicitante));
    }

    if (action === 'testOdoo') {
      return jsonResponse(testConexionOdoo());
    }

    if (action === 'getSolicitudes') {
      return jsonResponse(getSolicitudes());
    }

    if (action === 'getProveedores') {
      return jsonResponse(getProveedores());
    }

    if (action === 'crearOC') {
      const solicitudId   = e.parameter.solicitudId;
      const cuit          = e.parameter.cuit;
      const itemsOverride = e.parameter.itemsOverride || null;
      return jsonResponse(crearOCDesdeSheet({ solicitudId, cuit, itemsOverride }));
    }

    if (action === 'sincronizarProveedores') {
      sincronizarProveedoresOdoo();
      return jsonResponse({ success: true });
    }

    if (action === 'cambiarEstado') {
      return jsonResponse(cambiarEstado(e.parameter.solicitudId, e.parameter.estado));
    }

    return jsonResponse({ error: 'Acción no válida' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'crearOC') {
      const resultado = crearOCDesdeSheet(data);
      return jsonResponse(resultado);
    }

    const id = guardarSolicitud(data);
    return jsonResponse({ success: true, id });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────
// Lógica de datos
// ─────────────────────────────────────────────

/**
 * Devuelve [{nombre, categorias:[]}] desde col C:D de "Datos"
 * Las categorías del solicitante están en una sola celda separadas por espacio/coma.
 */
function getSolicitantes() {
  const rows = getDatosRows();
  const solicitantes = [];

  rows.forEach(row => {
    const nombre = String(row[2] || '').trim(); // Col C
    const cats   = String(row[3] || '').trim(); // Col D
    if (nombre) {
      const categorias = cats.split(/[\s,]+/).filter(Boolean);
      solicitantes.push({ nombre, categorias });
    }
  });

  return solicitantes;
}

/**
 * Devuelve [{proyecto, categoria}] filtrado por las categorías del solicitante.
 * Datos en col F:G de "Datos".
 */
function getProyectos(solicitante) {
  if (!solicitante) return [];

  const rows = getDatosRows();

  // 1. Buscar las categorías del solicitante
  let categoriasDelSolicitante = [];
  for (const row of rows) {
    if (String(row[2] || '').trim() === solicitante) {
      categoriasDelSolicitante = String(row[3] || '').trim().split(/[\s,]+/).filter(Boolean);
      break;
    }
  }

  if (!categoriasDelSolicitante.length) return [];

  // 2. Filtrar proyectos que coincidan con alguna de esas categorías
  const proyectos = [];
  rows.forEach(row => {
    const proyecto  = String(row[5] || '').trim(); // Col F
    const categoria = String(row[6] || '').trim(); // Col G
    if (proyecto && categoriasDelSolicitante.includes(categoria)) {
      proyectos.push({ proyecto, categoria });
    }
  });

  return proyectos;
}

/**
 * Guarda la solicitud en la hoja "Solicitudes de Compra".
 * Columnas: A=ID | B=Fecha | C=Solicitante | D=Proyecto | E=ParaCuándo
 *           F=Urgencia (fórmula manual) | G=Items | H=Proveedor | I=Link archivos
 */
function guardarSolicitud(data) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId() === SOLICITUDES_GID);

  if (!sheet) throw new Error('Hoja "Solicitudes de Compra" no encontrada (GID: ' + SOLICITUDES_GID + ')');

  // Crear encabezados si la hoja está vacía
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['ID', 'Fecha', 'Solicitante', 'Proyecto', 'Para Cuándo', 'Urgencia', 'Items', 'Proveedor Sugerido', 'Archivos']);
    sheet.setFrozenRows(1);
  }

  const tz          = Session.getScriptTimeZone();
  const now         = new Date();
  const fechaStr    = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  const solicitudId = generarId(sheet);

  // Formatear items como texto multilinea: "cantidad, articulo, descripcion"
  const itemsTexto = (data.items || [])
    .map(item => [item.unidades, item.articulo, item.descripcion].join(', '))
    .join('\n');

  // Manejo de archivos adjuntos en Google Drive
  let linkCarpeta = '';
  const archivos = data.archivos || [];
  if (archivos.length > 0) {
    const carpetaRaiz = driveRetry_(() => DriveApp.getFolderById(SOLICITUDES_FOLDER_ID));
    const carpeta     = driveRetry_(() => carpetaRaiz.createFolder(solicitudId));
    archivos.forEach(function(archivo) {
      const decoded = Utilities.base64Decode(archivo.base64);
      const blob    = Utilities.newBlob(decoded, archivo.tipo || 'application/octet-stream', archivo.nombre);
      driveRetry_(() => carpeta.createFile(blob));
    });
    linkCarpeta = carpeta.getUrl();
  }

  // Col F (Urgencia) tiene fórmula pre-cargada en la hoja — NO se toca.
  // Escribimos A-E y G-I por separado para no pisarla.
  const filaDestino = getPrimeraFilaVaciaColA(sheet);

  // A-E
  sheet.getRange(filaDestino, 1, 1, 5).setValues([[
    solicitudId,
    fechaStr,
    data.solicitante   || '',
    data.proyecto      || '',
    data.paraCuando    ? data.paraCuando.split('-').reverse().join('/') : ''
  ]]);

  // G-I (col 7 a 9, saltamos F=col 6)
  sheet.getRange(filaDestino, 7, 1, 3).setValues([[
    itemsTexto,
    data.proveedorSugerido || '',
    linkCarpeta ? `=HYPERLINK("${linkCarpeta}";"Ver Archivos adjuntos")` : ''
  ]]);

  // Intentar crear borrador en Odoo (no bloquea si falla o no está configurado)
  try { crearBorradorCompraOdoo(data, solicitudId); } catch (e) { Logger.log('Odoo: ' + e.message); }

  // Notificar por Telegram (no bloquea)
  try { notificarTelegramNuevaSolicitud(solicitudId, data); } catch (e) { Logger.log('Telegram: ' + e.message); }

  return solicitudId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retorna el número de la primera fila vacía en columna A (ignora col F, etc.)
// ─────────────────────────────────────────────────────────────────────────────
function getPrimeraFilaVaciaColA(sheet) {
  const valores = sheet.getRange('A:A').getValues();
  for (let i = 1; i < valores.length; i++) { // empieza en 1 para saltear encabezado
    if (String(valores[i][0]).trim() === '') return i + 1; // +1 porque getValues es 0-indexed
  }
  return valores.length + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Genera el próximo ID secuencial en formato SC-0001
// Lee solo columna A para no verse afectado por fórmulas en otras columnas
// ─────────────────────────────────────────────────────────────────────────────
function generarId(sheet) {
  const valores = sheet.getRange('A:A').getValues();
  let ultimoId = '';
  for (let i = 1; i < valores.length; i++) {
    const val = String(valores[i][0]).trim();
    if (val.match(/SC-\d+/)) ultimoId = val;
  }
  if (!ultimoId) return 'SC-0001';
  const match = ultimoId.match(/SC-(\d+)/);
  return 'SC-' + String(parseInt(match[1]) + 1).padStart(4, '0');
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Retorna todas las filas de datos (sin encabezado) de la hoja "Datos" */
function getDatosRows() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(DATOS_SHEET_NAME);
  if (!sheet) throw new Error('Hoja "' + DATOS_SHEET_NAME + '" no encontrada');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Leer toda la data en una sola llamada (más eficiente)
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cambia el estado de una solicitud (col K = columna 11)
// ─────────────────────────────────────────────────────────────────────────────
function cambiarEstado(solicitudId, estado) {
  if (!solicitudId || !estado) return { success: false, error: 'Faltan parámetros' };
  const ESTADOS_VALIDOS = ['Pendiente', 'En Proceso', 'OC Emitida', 'Rechazada'];
  if (!ESTADOS_VALIDOS.includes(estado)) return { success: false, error: 'Estado no válido: ' + estado };

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId() === SOLICITUDES_GID);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };

  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const filaIdx = datos.findIndex(r => String(r[0]).trim() === solicitudId);
  if (filaIdx === -1) return { success: false, error: 'Solicitud no encontrada' };

  sheet.getRange(filaIdx + 2, 11).setValue(estado);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Devuelve proveedores desde la hoja "Proveedores Odoo"
// ─────────────────────────────────────────────────────────────────────────────
function getProveedores() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Proveedores Odoo');
  if (!sheet || sheet.getLastRow() < 2) return [];
  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  return datos.filter(r => r[0]).map(r => ({ id: r[0], nombre: String(r[1]), cuit: String(r[2] || '') }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Devuelve todas las solicitudes de la hoja "Solicitudes de Compra"
// Columnas: A=ID B=Fecha C=Solicitante D=Proyecto E=ParaCuando F=Urgencia G=Items H=Proveedor I=Archivos J=ProveedorAdj K=Estado L=OC
// ─────────────────────────────────────────────────────────────────────────────
function getSolicitudes() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId() === SOLICITUDES_GID);
  if (!sheet) throw new Error('Hoja Solicitudes no encontrada');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const datos = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  return datos
    .filter(r => String(r[0]).trim() !== '')
    .map(r => ({
      id:          String(r[0]),
      fecha:       String(r[1]),
      solicitante: String(r[2]),
      proyecto:    String(r[3]),
      paraCuando:  String(r[4]),
      urgencia:    String(r[5]),
      items:       String(r[6]),
      proveedor:   String(r[7]),
      archivos:    String(r[8]),
      estado:      String(r[10] || 'Pendiente'),
      oc:          String(r[11] || '')
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Crea una OC en Odoo a partir de una solicitud existente en la hoja
// data: { solicitudId, cuit }
// ─────────────────────────────────────────────────────────────────────────────
function crearOCDesdeSheet(data) {
  const { solicitudId, cuit, itemsOverride } = data;
  if (!solicitudId) return { success: false, error: 'Falta solicitudId' };

  // 1. Leer la solicitud desde la hoja
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets().find(s => s.getSheetId() === SOLICITUDES_GID);
  if (!sheet) return { success: false, error: 'Hoja Solicitudes no encontrada' };

  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  const fila  = datos.find(r => String(r[0]).trim() === solicitudId);
  if (!fila) return { success: false, error: 'Solicitud no encontrada: ' + solicitudId };

  const paraCuando  = String(fila[4]); // dd/mm/yyyy
  const itemsTexto  = itemsOverride || String(fila[6]); // usar override si viene del frontend

  // Convertir paraCuando dd/mm/yyyy → yyyy-mm-dd hh:mm:ss para Odoo
  const partes = paraCuando.split('/');
  const fechaOdoo = partes.length === 3
    ? `${partes[2]}-${partes[1]}-${partes[0]} 00:00:00`
    : new Date().toISOString().slice(0, 10) + ' 00:00:00';

  // Parsear items (cada línea: "cant, articulo, descripcion")
  const orderLines = itemsTexto.split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map(linea => {
      const partes = linea.split(',').map(s => s.trim());
      const qty    = parseFloat(partes[0]) || 1;
      const nombre = [partes[1], partes[2]].filter(Boolean).join(' - ');
      return [0, 0, { name: nombre, product_qty: qty, price_unit: 0.0, date_planned: fechaOdoo }];
    });

  // 2. Resolver partner_id por CUIT
  const apiKey = PropertiesService.getScriptProperties().getProperty('ODOO_API_KEY');
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !apiKey) {
    return { success: false, error: 'Credenciales Odoo no configuradas' };
  }

  const uid = xmlRpcCall_('/xmlrpc/2/common', 'authenticate', [ODOO_DB, ODOO_USER, apiKey, {}]);
  if (typeof uid !== 'number' || uid <= 0) return { success: false, error: 'Autenticación Odoo fallida' };

  let partnerId = null;
  let partnerNuevo = false;

  if (cuit && String(cuit).trim() !== '') {
    // Buscar en hoja "Proveedores Odoo" por CUIT (col C)
    const hProveedores = ss.getSheetByName('Proveedores Odoo');
    if (hProveedores && hProveedores.getLastRow() > 1) {
      const provData = hProveedores.getRange(2, 1, hProveedores.getLastRow() - 1, 3).getValues();
      const match = provData.find(r => String(r[2]).replace(/\D/g, '') === String(cuit).replace(/\D/g, ''));
      if (match) partnerId = parseInt(match[0]);
    }

    // Si no está en la hoja, crear partner en Odoo con el CUIT
    if (!partnerId) {
      partnerId = odooExecute_(uid, 'res.partner', 'create', [{ name: 'CUIT ' + cuit, vat: cuit, supplier_rank: 1 }]);
      partnerNuevo = true;
    }
  }

  if (!partnerId) return { success: false, error: 'No se pudo determinar el proveedor' };

  // 3. Crear la OC en Odoo
  const orderId = odooExecute_(uid, 'purchase.order', 'create', [{
    partner_id: partnerId,
    origin:     solicitudId,
    date_order: new Date().toISOString().slice(0, 19).replace('T', ' '),
    order_line: orderLines
  }]);

  if (!orderId) return { success: false, error: 'Error al crear OC en Odoo' };

  // 4. Registrar el ID de OC en col L (columna 12) y estado en col K (columna 11)
  const filaIdx = datos.findIndex(r => String(r[0]).trim() === solicitudId);
  sheet.getRange(filaIdx + 2, 11).setValue('OC Emitida');
  sheet.getRange(filaIdx + 2, 12).setValue('OC-' + orderId);

  return { success: true, orderId, partnerNuevo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ejecuta una operación de Drive con reintentos automáticos.
// Necesario porque DriveApp puede lanzar "Service error: Drive" de forma
// transitoria. Reintenta hasta 3 veces con espera exponencial.
// ─────────────────────────────────────────────────────────────────────────────
function driveRetry_(fn, intentos) {
  intentos = intentos || 3;
  for (var i = 0; i < intentos; i++) {
    try {
      return fn();
    } catch (e) {
      var esDriveError = e.message && e.message.indexOf('Service error') !== -1;
      if (!esDriveError || i === intentos - 1) throw e;
      Utilities.sleep(Math.pow(2, i) * 1000); // 1s, 2s, 4s
    }
  }
}
