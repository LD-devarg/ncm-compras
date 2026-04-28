// ─────────────────────────────────────────────────────────────────────────────
// INTEGRACIÓN ODOO — XML-RPC
// Configurar antes de usar:
//   · Constantes ODOO_URL, ODOO_DB, ODOO_USER en Code.gs
//   · API Key en: GAS → Project Settings → Script Properties → ODOO_API_KEY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prueba la conexión con Odoo. Retorna un objeto con el resultado de cada paso.
 * Puede ejecutarse desde el editor de GAS o llamarse vía doGet?action=testOdoo
 */
function testConexionOdoo() {
  const resultado = {
    configuracion: { ok: false, detalle: '' },
    autenticacion: { ok: false, uid: null, detalle: '' },
    lectura:       { ok: false, detalle: '' }
  };

  // 1. Verificar configuración
  const apiKey = PropertiesService.getScriptProperties().getProperty('ODOO_API_KEY');
  Logger.log('ODOO_URL: ' + ODOO_URL);
  Logger.log('ODOO_DB: ' + ODOO_DB);
  Logger.log('ODOO_USER: ' + ODOO_USER);
  Logger.log('API Key presente: ' + (apiKey ? 'SI' : 'NO'));
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER) {
    resultado.configuracion.detalle = 'Faltan constantes ODOO_URL / ODOO_DB / ODOO_USER en Code.gs';
    Logger.log('Salida: faltan constantes');
    return resultado;
  }
  if (!apiKey) {
    resultado.configuracion.detalle = 'Falta ODOO_API_KEY en Script Properties';
    Logger.log('Salida: falta API key');
    return resultado;
  }
  resultado.configuracion.ok = true;
  resultado.configuracion.detalle = 'URL: ' + ODOO_URL + ' | DB: ' + ODOO_DB + ' | User: ' + ODOO_USER;

  // 2. Autenticar
  try {
    const uid = xmlRpcCall_('/xmlrpc/2/common', 'authenticate', [ODOO_DB, ODOO_USER, apiKey, {}]);
    if (typeof uid !== 'number' || uid <= 0) {
      resultado.autenticacion.detalle = 'Credenciales incorrectas o usuario sin acceso (uid: ' + uid + ')';
      return resultado;
    }
    resultado.autenticacion.ok  = true;
    resultado.autenticacion.uid = uid;
    resultado.autenticacion.detalle = 'Autenticado correctamente (uid=' + uid + ')';

    // 3. Leer un registro de prueba (res.partner limit 1)
    const prueba = odooExecute_(uid, 'res.partner', 'search_read', [[]], { fields: ['name'], limit: 1 });
    if (Array.isArray(prueba) && prueba.length > 0) {
      resultado.lectura.ok = true;
      resultado.lectura.detalle = 'Lectura OK — primer partner: ' + prueba[0].name;
    } else {
      resultado.lectura.detalle = 'Sin resultados o sin permisos de lectura en res.partner';
    }
  } catch (e) {
    resultado.autenticacion.detalle = 'Error: ' + e.message;
    Logger.log('Error en autenticacion: ' + e.message);
  }

  Logger.log('Resultado final: ' + JSON.stringify(resultado));
  return resultado;
}

/**
 * Sincroniza los proveedores de Odoo (supplier_rank > 0) a la hoja "Proveedores Odoo".
 * Ejecutar manualmente desde el editor de GAS.
 * Columnas: A = ID Proveedor | B = Nombre Proveedor
 */
function sincronizarProveedoresOdoo() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ODOO_API_KEY');
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !apiKey) {
    Logger.log('Faltan credenciales de Odoo');
    return;
  }

  // 1. Autenticar
  const uid = xmlRpcCall_('/xmlrpc/2/common', 'authenticate', [ODOO_DB, ODOO_USER, apiKey, {}]);
  if (typeof uid !== 'number' || uid <= 0) {
    Logger.log('Autenticación fallida');
    return;
  }

  // 2. Traer todos los partners marcados como proveedores
  const partners = odooExecute_(uid, 'res.partner', 'search_read',
    [[['supplier_rank', '>', 0]]],
    { fields: ['id', 'name', 'vat'], order: 'name asc' }
  );

  if (!Array.isArray(partners)) {
    Logger.log('Error al obtener proveedores');
    return;
  }

  // 3. Escribir en la hoja "Proveedores Odoo"
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet   = ss.getSheetByName('Proveedores Odoo');
  if (!sheet) {
    sheet = ss.insertSheet('Proveedores Odoo');
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, 3).setValues([['ID Proveedor', 'Nombre Proveedor', 'CUIT']]);
  sheet.setFrozenRows(1);

  if (partners.length > 0) {
    const filas = partners.map(p => [p.id, p.name || '', p.vat || '']);
    sheet.getRange(2, 1, filas.length, 3).setValues(filas);
  }

  Logger.log('Sincronización completa: ' + partners.length + ' proveedores escritos');
  SpreadsheetApp.flush();
}

/**
 * Prueba la conexión a XML-RPC. Soporta string, number, boolean, array, object.
 */
function toXmlRpcValue_(v) {
  if (Array.isArray(v)) {
    const items = v.map(toXmlRpcValue_).join('');
    return `<value><array><data>${items}</data></array></value>`;
  }
  if (v !== null && typeof v === 'object') {
    const members = Object.entries(v).map(([k, val]) =>
      `<member><name>${k}</name>${toXmlRpcValue_(val)}</member>`
    ).join('');
    return `<value><struct>${members}</struct></value>`;
  }
  if (typeof v === 'boolean') return `<value><boolean>${v ? 1 : 0}</boolean></value>`;
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? `<value><int>${v}</int></value>`
      : `<value><double>${v}</double></value>`;
  }
  const str = String(v === null || v === undefined ? '' : v);
  return `<value><string>${str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</string></value>`;
}

/**
 * Parsea un elemento <value> de la respuesta XML-RPC.
 */
function parseXmlRpcValue_(el) {
  const int_ = el.getChild('int') || el.getChild('i4');
  if (int_) return parseInt(int_.getText(), 10);
  const dbl = el.getChild('double');
  if (dbl) return parseFloat(dbl.getText());
  const bool = el.getChild('boolean');
  if (bool) return bool.getText() === '1';
  const str = el.getChild('string');
  if (str !== null) return str.getText();
  const arr = el.getChild('array');
  if (arr) return arr.getChild('data').getChildren('value').map(parseXmlRpcValue_);
  const struct = el.getChild('struct');
  if (struct) {
    const obj = {};
    struct.getChildren('member').forEach(m => {
      obj[m.getChild('name').getText()] = parseXmlRpcValue_(m.getChild('value'));
    });
    return obj;
  }
  return el.getText() || null;
}

/**
 * Realiza una llamada XML-RPC al endpoint dado y devuelve el valor de retorno.
 */
function xmlRpcCall_(endpoint, methodName, params) {
  const paramsXml = params.map(p => `<param>${toXmlRpcValue_(p)}</param>`).join('');
  const body = `<?xml version="1.0"?><methodCall><methodName>${methodName}</methodName><params>${paramsXml}</params></methodCall>`;
  const resp = UrlFetchApp.fetch(`${ODOO_URL}${endpoint}`, {
    method: 'post',
    contentType: 'text/xml',
    payload: body,
    muteHttpExceptions: true
  });
  try {
    const doc  = XmlService.parse(resp.getContentText());
    const root = doc.getRootElement();
    if (root.getChild('fault')) throw new Error('XML-RPC fault: ' + resp.getContentText());
    const ps = root.getChild('params');
    if (!ps) return null;
    return parseXmlRpcValue_(ps.getChild('param').getChild('value'));
  } catch (e) {
    Logger.log('XML-RPC parse error: ' + e.message);
    return null;
  }
}

/**
 * Ejecuta execute_kw en Odoo (requiere uid previo).
 */
function odooExecute_(uid, modelo, metodo, args, kwargs) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ODOO_API_KEY');
  const params = [ODOO_DB, uid, apiKey, modelo, metodo, args];
  if (kwargs) params.push(kwargs);
  return xmlRpcCall_('/xmlrpc/2/object', 'execute_kw', params);
}

/**
 * Crea un borrador de Orden de Compra en Odoo a partir de los datos de la solicitud.
 * No bloquea: si falla o no está configurado, retorna null silenciosamente.
 */
function crearBorradorCompraOdoo(data, solicitudId) {
  if (!ODOO_URL || !ODOO_DB || !ODOO_USER) return null;
  const apiKey = PropertiesService.getScriptProperties().getProperty('ODOO_API_KEY');
  if (!apiKey) return null;
  if (!data.proveedorSugerido) {
    Logger.log('Odoo: sin proveedor sugerido, se omite creación de orden');
    return null;
  }

  try {
    // 1. Autenticar
    const uid = xmlRpcCall_('/xmlrpc/2/common', 'authenticate', [ODOO_DB, ODOO_USER, apiKey, {}]);
    if (typeof uid !== 'number' || uid <= 0) {
      Logger.log('Odoo: autenticación fallida');
      return null;
    }

    // 2. Buscar partner por nombre; si no existe, crearlo
    let partnerId;
    const found = odooExecute_(uid, 'res.partner', 'search', [[['name', 'ilike', data.proveedorSugerido]]], { limit: 1 });
    if (Array.isArray(found) && found.length > 0) {
      partnerId = found[0];
    } else {
      partnerId = odooExecute_(uid, 'res.partner', 'create', [{ name: data.proveedorSugerido }]);
    }
    if (!partnerId) { Logger.log('Odoo: no se pudo obtener/crear partner'); return null; }

    // 3. Armar líneas de la orden
    const dateNow = new Date().toISOString().slice(0, 10) + ' 00:00:00';
    const orderLines = (data.items || []).map(item => [0, 0, {
      name:         [item.articulo, item.descripcion].filter(Boolean).join(' - '),
      product_qty:  parseFloat(item.unidades) || 1,
      price_unit:   0.0,
      date_planned: dateNow
    }]);

    // 4. Crear la orden (estado draft por defecto)
    const orderId = odooExecute_(uid, 'purchase.order', 'create', [{
      partner_id: partnerId,
      origin:     solicitudId,
      date_order: new Date().toISOString().slice(0, 19).replace('T', ' '),
      order_line: orderLines
    }]);

    Logger.log('Odoo: borrador de compra creado — ID ' + orderId);
    return orderId;
  } catch (e) {
    Logger.log('Odoo error: ' + e.message);
    return null;
  }
}
