const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const drive = require('../helpers/drive');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const router = express.Router();
var uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'cm-docs');
try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }); } catch(e) {}
var cmUpload = multer({ dest: uploadsDir });

// Test endpoint to debug API customers count
router.get('/api-test', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    res.json({
      ok: true,
      email: api.email,
      brand: api.brandId,
      url: api.apiUrl,
      env_set: !!process.env.LIKES_CLIENT_ID,
      env_email: process.env.LIKES_CLIENT_ID || '(no configurado)'
    });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const search = req.query.search || '';

  let apiClientes = [];
  try {
    const api = LikesAPI.getApiInstance();
    const customers = await api.getCustomers();
    console.log('[Clientes] API customers count:', customers ? customers.length : 0);
    apiClientes = (customers || []).map(c => ({
      origen: 'API',
      id_api: c.id,
      nombre: c.name || c.firstName || '',
      apellidos: c.lastName || c.surname || '',
      email: c.email || c.contactInfo?.email || '',
      telefono: c.phone || c.contactInfo?.phone || '',
      dni_nif: c.fiscalId || c.fiscalNumber || c.fiscal_id || '',
      direccion: (c.billingAddress?.street || '') + ' ' + (c.billingAddress?.cityName || ''),
      ciudad: c.billingAddress?.cityName || c.address?.city || '',
      tipo: c.customerType || 'Residential',
      estado: c.status || 'CREATED',
      created_at: c.created || null
    }));
  } catch (e) {
    console.error('API customers fetch error:', e.message);
  }

  const locales = db.prepare('SELECT id, nombre, apellidos, email, telefono, dni_nif, direccion, ciudad, tipo_cliente, created_at FROM clients ORDER BY created_at DESC').all();
  const localByPhone = {};
  const localByDni = {};
  locales.forEach(l => {
    if (l.telefono) {
      const p = l.telefono.replace(/[^\d]/g, '');
      if (p) localByPhone[p] = l;
    }
    if (l.dni_nif) localByDni[l.dni_nif.toUpperCase()] = l;
  });

  const seenLocalIds = new Set();
  const merged = [];

  apiClientes.forEach(api => {
    const apiPhone = api.telefono ? api.telefono.replace(/[^\d]/g, '') : '';
    const apiDni = api.dni_nif ? api.dni_nif.toUpperCase() : '';
    let match = null;
    if (apiDni && localByDni[apiDni]) match = localByDni[apiDni];
    else if (apiPhone && localByPhone[apiPhone]) match = localByPhone[apiPhone];

    if (match) {
      seenLocalIds.add(match.id);
      merged.push({
        ...api,
        id_local: match.id,
        nombre: api.nombre || match.nombre,
        apellidos: api.apellidos || match.apellidos,
        email: api.email || match.email,
        telefono: api.telefono || match.telefono,
        dni_nif: api.dni_nif || match.dni_nif,
        direccion: api.direccion || match.direccion,
        ciudad: api.ciudad || match.ciudad
      });
    } else {
      merged.push({ ...api, id_local: null });
    }
  });

  // Los clientes locales sin coincidencia con la API NO se muestran
  // (los clientes solo deben venir de la API de Likes Telecom)
  const localesSinApi = locales.filter(l => !seenLocalIds.has(l.id)).length;

  merged.sort((a, b) => {
    const da = a.created_at || '';
    const db2 = b.created_at || '';
    return da < db2 ? 1 : da > db2 ? -1 : 0;
  });

  const filtered = search ? merged.filter(c => {
    const s = search.toLowerCase();
    return (c.nombre && c.nombre.toLowerCase().includes(s)) ||
           (c.apellidos && c.apellidos.toLowerCase().includes(s)) ||
           (c.email && c.email.toLowerCase().includes(s)) ||
           (c.telefono && c.telefono.includes(search)) ||
           (c.dni_nif && c.dni_nif.toLowerCase().includes(s));
  }) : merged;

  var page = Math.max(1, parseInt(req.query.page) || 1);
  var limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
  var totalFiltered = filtered.length;
  var totalPages = Math.ceil(totalFiltered / limit);
  var paginated = filtered.slice((page - 1) * limit, page * limit);

  res.render('clients/list', {
    title: 'Clientes',
    clientes: paginated,
    search,
    page,
    limit,
    totalFiltered,
    totalPages,
    apiCount: apiClientes.length,
    localCount: locales.length,
    localesSinApi: localesSinApi || 0
  });
});

router.get('/nuevo', requireAuth, (req, res) => {
  res.render('clients/create', { title: 'Nuevo Cliente', cliente: {}, errors: [] });
});

router.post('/nuevo', requireAuth, async (req, res) => {
  const { nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente } = req.body;
  if (!nombre || !telefono) {
    return res.render('clients/create', { title: 'Nuevo Cliente', cliente: req.body, errors: ['Nombre y teléfono son obligatorios'] });
  }
  // Validar contra la API: los clientes solo deben existir si están en Likes Telecom
  // Si el DNI o teléfono ya está en la API, NO crear duplicado local
  let apiMatch = null;
  try {
    const api = LikesAPI.getApiInstance();
    const customers = await api.getCustomers();
    const phoneClean = String(telefono || '').replace(/[^\d]/g, '');
    const dniClean = String(dni_nif || '').toUpperCase();
    for (const c of (customers || [])) {
      const cPhone = String(c.phone || c.contactInfo?.phone || '').replace(/[^\d]/g, '');
      const cDni = String(c.fiscalId || c.fiscalNumber || c.fiscal_id || '').toUpperCase();
      if ((dniClean && dniClean === cDni) || (phoneClean && phoneClean === cPhone)) {
        apiMatch = c;
        break;
      }
    }
  } catch(e) {
    console.error('[Cliente nuevo] Error validando API:', e.message);
  }

  if (apiMatch) {
    // Ya existe en API: actualizar el local si existe, o enlazar por likes_customer_id
    const apiId = apiMatch.id || apiMatch.customerId || '';
    const existente = db.prepare("SELECT id FROM clients WHERE dni_nif = ? OR telefono = ? LIMIT 1").get(dni_nif || null, telefono || null);
    if (existente) {
      db.prepare('UPDATE clients SET likes_customer_id = ?, nombre = ?, apellidos = ?, email = ?, telefono = ?, telefono2 = ?, direccion = ?, ciudad = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(apiId || null, nombre, apellidos || '', email || '', telefono, telefono2 || '', direccion || '', ciudad || '', existente.id);
      db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('cliente_actualizado', 'Cliente ' + nombre + ' enlazado a API (' + apiId + ')', existente.id);
      return res.redirect('/clientes?msg=enlazado');
    }
    const result = db.prepare(`
      INSERT INTO clients (likes_customer_id, nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(apiId || null, nombre, apellidos || '', dni_nif || '', email || '', telefono, telefono2 || '', direccion || '', ciudad || '', provincia || 'Málaga', codigo_postal || '29200', notas || '', tipo_cliente || 'particular');
    db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('cliente_creado', 'Cliente ' + nombre + ' ' + (apellidos || '') + ' creado (enlazado API)', result.lastInsertRowid);
    return res.redirect('/clientes');
  }

  // No está en la API: rechazar (los clientes solo deben venir de la API)
  return res.render('clients/create', {
    title: 'Nuevo Cliente',
    cliente: req.body,
    errors: ['El cliente "' + (nombre || '') + '" no existe en la API de Likes Telecom. Los clientes solo pueden crearse desde los datos de la API. Si crees que debería existir, sincroniza desde la API primero.']
  });
});

// Limpiar clientes locales sin enlace a la API (los "inventados")
// GET /clientes/limpiar-locales -> elimina locales sin likes_customer_id y sin match con API
router.get('/limpiar-locales', requireAuth, async (req, res) => {
  try {
    let apiPhones = new Set();
    let apiDnis = new Set();
    try {
      const api = LikesAPI.getApiInstance();
      const customers = await api.getCustomers();
      (customers || []).forEach(function(c) {
        var p = String(c.phone || c.contactInfo?.phone || '').replace(/[^\d]/g, '');
        var d = String(c.fiscalId || c.fiscalNumber || c.fiscal_id || '').toUpperCase();
        if (p) apiPhones.add(p);
        if (d) apiDnis.add(d);
      });
    } catch(e) {
      console.error('[Limpiar locales] Error API:', e.message);
    }

    var locales = db.prepare('SELECT id, nombre, telefono, dni_nif, likes_customer_id, created_at FROM clients').all();
    var aBorrar = [];
    var conservados = [];

    locales.forEach(function(l) {
      if (l.likes_customer_id) { conservados.push(l.id); return; }
      var p = String(l.telefono || '').replace(/[^\d]/g, '');
      var d = String(l.dni_nif || '').toUpperCase();
      if ((d && apiDnis.has(d)) || (p && apiPhones.has(p))) { conservados.push(l.id); return; }
      if (apiPhones.size > 0 || apiDnis.size > 0) {
        aBorrar.push({ id: l.id, nombre: l.nombre, telefono: l.telefono, dni: l.dni_nif });
      } else {
        conservados.push(l.id);
      }
    });

    const del = db.prepare('DELETE FROM clients WHERE id = ?');
    var borrados = 0;
    aBorrar.forEach(function(c) {
      try {
        del.run(c.id);
        db.prepare('DELETE FROM activity_log WHERE client_id = ?').run(c.id);
        borrados++;
      } catch(e) { console.error('[Limpiar] Error borrando', c.id, e.message); }
    });

    res.json({
      ok: true,
      totalLocal: locales.length,
      borrados: borrados,
      conservados: conservados.length,
      detalleBorrados: aBorrar
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

function mapApiCustomer(customerData) {
  if (!customerData || typeof customerData !== 'object') return {};
  return {
    name: customerData.name || '',
    firstName: customerData.firstName || customerData.first_name || '',
    lastName: customerData.lastName || customerData.last_name || customerData.surname || '',
    surname: customerData.surname || customerData.firstSurname || '',
    fiscalId: customerData.fiscalId || customerData.fiscal_id || customerData.fiscalNumber || '',
    email: customerData.email || customerData.contactInfo?.email || '',
    phone: customerData.phone || customerData.contactPhone || customerData.contactInfo?.phone || '',
    customerType: customerData.customerType || customerData.customer_type || customerData.type || 'Residential',
    created: customerData.created || customerData.created_at || customerData.createdAt || '',
    status: customerData.status || 'CREATED',
    aeatStatus: customerData.aeatStatus || customerData.aeat_status || customerData.aeatValidation || customerData.aeat || customerData.aeat_state || '',
    scoring: customerData.scoring || customerData.score || customerData.rating || customerData.scoreRating || customerData.creditScore || customerData.credit_score || '',
    riskLevel: customerData.riskLevel || customerData.risk_level || customerData.risk || customerData.riskRating || customerData.risk_rating || '',
    paymentMethod: customerData.paymentMethod || customerData.payment_method || customerData.paymentInfo?.method || '',
    iban: customerData.iban || customerData.bankAccount || customerData.paymentInfo?.iban || '',
    billingAddress: customerData.billingAddress || customerData.address || {},
    contactInfo: customerData.contactInfo || {},
    paymentInfo: customerData.paymentInfo || {}
  };
}

function mapApiSubscriptions(subArr) {
  if (!Array.isArray(subArr)) return [];
  return subArr.map(function(s) {
    return {
      id: s.id || s.subscriptionId || s.subscription_id,
      productName: s.productName || s.product || s.tarifa || s.service || '-',
      lineNumber: s.lineNumber || s.line || s.phone || s.msisdn || s.numero || s.fixedNumber || '',
      status: s.status || s.estado || s.state || 'activa',
      startDate: s.startDate || s.start_date || s.created || s.created_at || s.sellDate || s.fecha_alta || '',
      endDate: s.endDate || s.end_date || s.cancelled_at || s.cancelledAt || s.fecha_baja || '',
      icc: s.icc || s.iccid || s.iccidNumber || '',
      ict: s.ict || '',
      pin: s.pin || '',
      puk: s.puk || '',
      products: Array.isArray(s.products) ? s.products.map(function(p) {
        return {
          id: p.id || p.productId,
          productName: p.productName || p.name || '',
          lineNumber: p.lineNumber || p.line || p.fixedNumber || '',
          status: p.status || '',
          icc: p.icc || p.iccid || '',
          pin: p.pin || '',
          puk: p.puk || '',
          price: p.price || p.finalPrice || 0
        };
      }) : (s.productName ? [{
        productName: s.productName,
        lineNumber: s.lineNumber || s.line || s.phone || '',
        status: s.status || '',
        icc: s.icc || s.iccid || '',
        price: s.price || 0
      }] : [])
    };
  });
}

function mapApiOrders(orderArr) {
  if (!Array.isArray(orderArr)) return [];
  return orderArr.map(function(o) {
    // Extraer datos de posibles estructuras anidadas
    var src = o.data || o.attributes || o.order || o;
    if (Array.isArray(src)) src = src[0] || src;
    var statusHistory = [];
    if (Array.isArray(src.statusHistory)) statusHistory = src.statusHistory;
    else if (Array.isArray(src.status_history)) statusHistory = src.status_history;
    else if (Array.isArray(src.history)) statusHistory = src.history;
    else if (Array.isArray(o.statusHistory)) statusHistory = o.statusHistory;
    else if (Array.isArray(o.status_history)) statusHistory = o.status_history;
    else if (Array.isArray(o.history)) statusHistory = o.history;
    var estado = (src.status || src.estado || src.state || o.status || o.estado || o.state || 'desconocido').toUpperCase();
    var estadoMap = { 'COMPLETED':'Completado','PENDING_PROVIDER':'Pendiente proveedor','PENDING':'Pendiente','PROCESSING':'Procesando','ACTIVE':'Activo','CANCELLED':'Cancelado','CANCELED':'Cancelado','REJECTED':'Rechazado','CREATED':'Creado','DRAFT':'Borrador','ERROR':'Error' };
    var prodName = src.productName || src.product || src.description || src.service || src.tarifa || src.offerName || src.offer_name || src.planName || src.plan_name || '';
    // Buscar en productos anidados
    if (!prodName && Array.isArray(src.products)) { prodName = src.products.map(function(p) { return p.productName || p.name || ''; }).filter(Boolean).join(', '); }
    if (!prodName && Array.isArray(src.lines)) { prodName = src.lines.map(function(l) { return l.productName || l.name || ''; }).filter(Boolean).join(', '); }
    if (!prodName && Array.isArray(src.items)) { prodName = src.items.map(function(i) { return i.productName || i.name || i.description || ''; }).filter(Boolean).join(', '); }
    if (!prodName && Array.isArray(src.services)) { prodName = src.services.map(function(s) { return s.name || s.productName || ''; }).filter(Boolean).join(', '); }
    if (!prodName) prodName = o.productName || o.product || '-';
    var lineaNum = src.lineNumber || src.line || src.phone || src.numero || src.msisdn || src.fixedNumber || src.linea || '';
    // Buscar en productos anidados
    if (!lineaNum && Array.isArray(src.products)) { lineaNum = src.products.map(function(p) { return p.fixedNumber || p.lineNumber || ''; }).filter(Boolean).join(', '); }
    if (!lineaNum && Array.isArray(src.lines)) { lineaNum = src.lines.map(function(l) { return l.fixedNumber || l.lineNumber || l.number || ''; }).filter(Boolean).join(', '); }
    if (!lineaNum && Array.isArray(src.items)) { lineaNum = src.items.map(function(i) { return i.fixedNumber || i.lineNumber || ''; }).filter(Boolean).join(', '); }
    if (!lineaNum) lineaNum = o.lineNumber || o.line || o.phone || '-';
    return {
      id: src.id || src.orderId || src.order_id || o.id || o.orderId || o.order_id,
      idShort: (src.id || src.orderId || src.order_id || o.id || o.orderId || o.order_id || '').toString().substring(0, 8) + '...',
      status: estado,
      statusES: estadoMap[estado] || estado,
      productName: prodName,
      lineNumber: lineaNum,
      total: src.total || src.amount || src.price || src.importe || o.total || o.amount || 0,
      created: src.created || src.created_at || src.createdAt || src.date || src.fecha || src.fecha_creacion || o.created || o.created_at,
      updated: src.updated || src.updated_at || src.updatedAt || src.modified || src.lastUpdated || o.updated,
      statusHistory: statusHistory
    };
  });
}

function mapApiInvoices(invArr) {
  if (!Array.isArray(invArr)) return [];
  return invArr.map(function(f) {
    var fees = [];
    if (Array.isArray(f.fees)) {
      fees = f.fees.map(function(fee) {
        return {
          productName: fee.productName || fee.product_name || fee.product || fee.concept || fee.concepto || fee.description || '-',
          price: parseFloat(fee.price || fee.amount || fee.importe || 0),
          lineNumber: fee.lineNumber || fee.line_number || fee.line || ''
        };
      });
    } else if (Array.isArray(f.lines)) {
      fees = f.lines.map(function(line) {
        return {
          productName: line.productName || line.name || line.concept || line.concepto || line.description || '-',
          price: parseFloat(line.price || line.amount || line.importe || line.total || 0),
          lineNumber: line.lineNumber || line.line || ''
        };
      });
    } else if (Array.isArray(f.items)) {
      fees = f.items.map(function(item) {
        return {
          productName: item.productName || item.name || item.concept || item.description || '-',
          price: parseFloat(item.price || item.amount || item.importe || 0),
          lineNumber: item.lineNumber || item.line || ''
        };
      });
    }
    return {
      id: f.id || f.invoiceId || f.invoice_id || f.number || '',
      number: f.number || f.invoiceNumber || f.invoice_number || '',
      period: f.period || f.periodo || f.billingPeriod || f.billing_period || '',
      concept: f.concept || f.concepto || f.description || f.descripcion || 'Factura de servicios',
      amount: parseFloat(f.amount || f.importe || f.total || f.amountDue || f.amount_due || 0),
      issuedDate: f.issuedDate || f.issued_date || f.fecha_emision || f.date || f.created || f.created_at || '',
      dueDate: f.dueDate || f.due_date || f.fecha_vencimiento || '',
      status: f.status || f.estado || 'pending',
      fees: fees,
      currency: f.currency || 'EUR'
    };
  });
}

function findField(obj, keys) {
  if (!obj) return '';
  var allKeys = Object.keys(obj);
  var allValues = {};
  function flatten(o, prefix) {
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach(function(k) {
      var v = o[k];
      var key = prefix ? prefix + '.' + k : k;
      allValues[key] = v;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key);
    });
  }
  flatten(obj, '');
  for (var k of keys) {
    var lower = k.toLowerCase();
    var found = allKeys.find(function(ak) { return ak.toLowerCase().includes(lower); });
    if (found && obj[found] !== null && obj[found] !== undefined && obj[found] !== '') return String(obj[found]);
  }
  for (var k of keys) {
    var lower = k.toLowerCase();
    var found2 = Object.keys(allValues).find(function(ak) { return ak.toLowerCase().includes(lower) || ak.endsWith('.' + k) || ak.endsWith('.' + k.toLowerCase()); });
    if (found2 && allValues[found2] !== null && allValues[found2] !== undefined && allValues[found2] !== '') return String(allValues[found2]);
  }
  return '';
}

function mapApiInstallations(instArr) {
  if (!Array.isArray(instArr)) return [];
  return instArr.map(function(i) {
    var histEvents = i.timeline || i.history || i.events || i.statusHistory || i.status_history || [];
    var addr = findField(i, ['direccion', 'address', 'street', 'calle', 'direccion_instalacion', 'installationAddress', 'installation_address']);
    var ciudad = findField(i, ['city', 'ciudad', 'cityName', 'poblacion', 'localidad']);
    return {
      id: i.id || i.installationId || i.installation_id || '',
      address: addr,
      city: ciudad,
      productName: findField(i, ['producto', 'product', 'productName', 'product_name', 'tarifa', 'service']) || '-',
      status: findField(i, ['estado', 'status', 'state', 'situacion']) || 'desconocido',
      scheduledDate: findField(i, ['scheduledDate', 'scheduled_date', 'fecha_programada', 'programmedDate', 'plannedDate', 'date']),
      completedDate: findField(i, ['completedDate', 'completed_date', 'fecha_real', 'installationDate', 'actualDate', 'completionDate', 'endDate']),
      notes: findField(i, ['notas', 'notes', 'observaciones', 'comentarios', 'comments', 'description']),
      technician: findField(i, ['tecnico', 'technician', 'instalador', 'installer', 'worker']),
      addressDetail: findField(i, ['addressDetail', 'detalle_direccion']),
      dni: findField(i, ['dni', 'nif', 'fiscalId', 'fiscal_id', 'documento', 'identificacion']),
      ot: findField(i, ['ot', 'orderId', 'order_id', 'workOrder', 'work_order', 'orden_trabajo']),
      router: findField(i, ['router', 'routerModel', 'router_model', 'equipo', 'device']),
      ont: findField(i, ['ont', 'ontModel', 'ont_model', 'ontId', 'ont_id']),
      cto: findField(i, ['cto', 'ctoId', 'cto_id', 'ctoName', 'cto_name']),
      contrata: findField(i, ['contrata', 'contract', 'contractId', 'contract_id', 'contratista', 'proveedor']),
      parteUrl: findField(i, ['parteUrl', 'parte_url', 'workOrderUrl', 'workOrderPdf', 'workOrderPdfUrl', 'work_order_pdf', 'documentoUrl', 'attachmentUrl', 'attachment']),
      history: histEvents,
      installationId: i.installationId || i.id || ''
    };
  });
}

router.get('/fiscal/:fiscalId', requireAuth, async (req, res) => {
  var fiscalId = req.params.fiscalId;
  try {
    // Si existe en BD local, redirigir a la ruta normal
    var localMatch = db.prepare("SELECT * FROM clients WHERE dni_nif=? OR likes_customer_id=? LIMIT 1").get(fiscalId, fiscalId);
    if (localMatch) return res.redirect('/clientes/' + localMatch.id);
  } catch(e) {}
  
  // No existe localmente, cargar todo de la API
  var apiOverview = {};
  var apiCustomer = {};
  var apiSubscriptions = [];
  var apiOrders = [];
  var apiInvoices = [];
  var apiInstallations = [];
  var apiPortabilities = [];
  var apiPayments = [];
  
  try {
    var api = LikesAPI.getApiInstance();
    var raw = await api.request('GET', '/customer/overview?fiscalId=' + encodeURIComponent(fiscalId) +
      '&includeCustomer=true&includeSubscriptions=true&includeOrders=true&includePortabilities=true&includeInstallations=true&includeInvoices=true&includePayments=true');
    var data = raw && raw.data ? raw.data : raw;
    apiOverview = data;
    var cust = data.customer || data;
    // Fusionar scoring/riesgo del root data si no viene en customer
    if (!cust.aeatStatus && !cust.aeat_status && !cust.scoring && !cust.score && !cust.riskLevel && !cust.risk) {
      var enriched = Object.assign({}, cust, {
        aeatStatus: cust.aeatStatus || data.aeatStatus || data.aeat_status || data.aeat,
        scoring: cust.scoring || data.scoring || data.score || data.creditScore || data.credit_score,
        riskLevel: cust.riskLevel || data.riskLevel || data.risk || data.riskRating
      });
      apiCustomer = mapApiCustomer(enriched);
    } else {
      apiCustomer = mapApiCustomer(cust);
    }
    apiSubscriptions = mapApiSubscriptions(data.subscriptions);
    // No filtrar por estado - incluir todas las lineas para que funcionen los botones de todos los clientes
    // NOTA: el filtro por estado activo se eliminó porque algunos clientes tienen lineas con status "suspendido"
    // u otros estados que hacian que no se mostraran lineas ni funcionaran los botones de consumo/scoring.
    // Anadir portabilidadId/referencia desde productos
    apiSubscriptions.forEach(function(s) {
      if (Array.isArray(s.products)) {
        s.products.forEach(function(p) {
          if (p.portabilidadId || p.referencia || p.portabilityId) {
            s.portabilidadId = p.portabilidadId || p.referencia || p.portabilityId || '';
            s.referencia = p.referencia || p.portabilidadId || p.portabilityId || '';
          }
        });
      }
    });
    apiOrders = mapApiOrders(data.orders);
    // Enriquecer ordenes con productos desde suscripciones (las ordenes no tienen productos en la API)
    if (apiOrders.length > 0 && data.subscriptions && Array.isArray(data.subscriptions)) {
      var subLookup = {}, subLines = {};
      data.subscriptions.forEach(function(s) {
        if (Array.isArray(s.products)) {
          s.products.forEach(function(p) {
            var oid = p.orderId || '';
            var sid = p.subscriptionId || '';
            if (oid) { subLookup[oid] = p.productName || ''; subLines[oid] = p.fixedNumber || p.lineNumber || ''; }
            if (sid) { subLookup[sid] = p.productName || ''; subLines[sid] = p.fixedNumber || p.lineNumber || ''; }
          });
        }
      });
      apiOrders.forEach(function(o) {
        var oid = o.id || '';
        if (oid && o.productName === '-') {
          // Buscar coincidencia exacta
          if (subLookup[oid]) { o.productName = subLookup[oid]; o.lineNumber = o.lineNumber || subLines[oid] || '-'; }
          else {
            // Buscar por ultimos 8 chars del UUID (sufijo unico)
            var shortId = oid.split('-').pop() || '';
            if (shortId) {
              var foundKey = Object.keys(subLookup).find(function(k) { return k.endsWith(shortId); });
              if (foundKey) { o.productName = subLookup[foundKey]; o.lineNumber = o.lineNumber || subLines[foundKey] || '-'; }
            }
          }
        }
      });
    }
    apiInvoices = mapApiInvoices(data.invoices);
    apiInstallations = mapApiInstallations(data.installations);
    if (Array.isArray(data.portabilities)) apiPortabilities = data.portabilities;
    if (Array.isArray(data.payments)) apiPayments = data.payments;
  } catch(e) {
    console.error('[Clientes] API error fiscal:', e.message);
  }

  var clienteData = {
    id: null, nombre: apiCustomer.name || apiCustomer.firstName || '',
    apellidos: apiCustomer.lastName || apiCustomer.surname || '',
    dni_nif: fiscalId, telefono: apiCustomer.phone || '', telefono2: '',
    email: apiCustomer.email || '',
    direccion: (apiCustomer.billingAddress && apiCustomer.billingAddress.street) || '',
    ciudad: (apiCustomer.billingAddress && (apiCustomer.billingAddress.cityName || apiCustomer.billingAddress.city)) || '',
    provincia: '', codigo_postal: (apiCustomer.billingAddress && (apiCustomer.billingAddress.zipCode || apiCustomer.billingAddress.zip)) || '',
    created_at: apiCustomer.created || '', likes_customer_id: fiscalId,
    notas: '', metodo_pago: apiCustomer.paymentMethod || '', iban: apiCustomer.iban || '',
    tipo_cliente: apiCustomer.customerType || 'particular', stripe_payment_method: ''
  };

  // Sincronizar teléfono desde API a DB del servidor para que aparezca en lista de clientes
  if (apiCustomer.phone && fiscalId) {
    try {
      var existingForPhone = db.prepare("SELECT id, telefono FROM clients WHERE dni_nif=? OR likes_customer_id=?").get(fiscalId, fiscalId);
      if (existingForPhone && !existingForPhone.telefono) {
        db.prepare("UPDATE clients SET telefono=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(apiCustomer.phone, existingForPhone.id);
      }
    } catch(e) {}
  }

  var allLines = [];
  apiSubscriptions.forEach(function(s) {
    var lineFromSub = s.lineNumber || s.fixedNumber || (s.line && (s.line.lineNumber || s.line.number)) || s.phone || s.msisdn || s.numero || '';
    var prods = s.products && s.products.length ? s.products : (s.productName ? [{productName: s.productName, lineNumber: lineFromSub, status: s.status, icc: s.icc}] : []);
    prods.forEach(function(p) {
      var st = (p.status || s.status || '').toLowerCase();
      var ln = p.lineNumber || p.fixedNumber || (p.line && (p.line.lineNumber || p.line.number)) || lineFromSub || s.lineNumber || s.fixedNumber || '';
      if (ln && !allLines.find(function(l) { return l.linea === ln; })) {
        allLines.push({ linea: ln, producto: p.productName || '', estado: st, iccid: p.icc || '', pin: '', puk: '', contrato_id: null, fecha_alta: null });
      }
    });
    // Si subscription no tiene products pero tiene fixedNumber directo
    if (!s.products && s.fixedNumber && !allLines.find(function(l) { return l.linea === s.fixedNumber; })) {
      allLines.push({ linea: s.fixedNumber, producto: s.productName || '', estado: (s.status || '').toLowerCase(), iccid: s.icc || '', pin: '', puk: '', contrato_id: null, fecha_alta: null });
    }
  });
    // Ultimo fallback: extraer lineas directamente de apiSubscriptions
  if (allLines.length === 0 && apiSubscriptions.length > 0) {
    apiSubscriptions.forEach(function(s) {
      var lnFallback = s.lineNumber || s.fixedNumber || s.phone || s.msisdn || s.numero || (s.line && (s.line.lineNumber || s.line.number)) || "";
      if (lnFallback && !allLines.find(function(l) { return l.linea === lnFallback; })) {
        allLines.push({ linea: lnFallback, producto: s.productName || "", estado: (s.status || "").toLowerCase(), iccid: s.icc || "", pin: "", puk: "", contrato_id: null, fecha_alta: null });
      }
    });
  }
  // Si no hay lineas de API, anadir desde altas_ordenes (DB local)
  if (allLines.length === 0) {
    try {
      var altasLines = db.prepare("SELECT DISTINCT o.linea, o.producto, o.estado FROM altas_ordenes o WHERE o.likes_customer_id=? OR o.datos_cliente LIKE ?").all(fiscalId, '%' + fiscalId + '%');
      altasLines.forEach(function(al) {
        if (al.linea && !allLines.find(function(l) { return l.linea === al.linea; })) {
          allLines.push({ linea: al.linea, producto: al.producto || '', estado: (al.estado || '').toLowerCase(), iccid: '', pin: '', puk: '', contrato_id: null, fecha_alta: null });
        }
      });
    } catch(e) {}
  }
  // Fallback: lineas desde ordenes API
  if (allLines.length === 0) {
    apiOrders.forEach(function(o) {
      var ln = o.lineNumber || o.fixedNumber || (o.line && (o.line.lineNumber || o.line.number)) || '';
      if (ln && !allLines.find(function(l) { return l.linea === ln; })) {
        allLines.push({ linea: ln, producto: o.productName || o.product || '', estado: (o.status || '').toLowerCase(), iccid: '', pin: '', puk: '', contrato_id: null, fecha_alta: null });
      }
    });
  }
  // Si no hay lineas, intentar obtener desde API /line
  if (allLines.length === 0) {
    try {
      var apiLines = await api.getLines();
      if (Array.isArray(apiLines)) {
        apiLines.forEach(function(ln) {
          var lnNum = ln.lineNumber || ln.msisdn || ln.phone || ln.fixedNumber || '';
          var lnProd = ln.productName || '';
          if (lnNum && !allLines.find(function(l) { return l.linea === lnNum; })) {
            allLines.push({ linea: lnNum, producto: lnProd, estado: (ln.status || '').toLowerCase(), iccid: ln.icc || ln.iccid || '', pin: ln.pin || '', puk: ln.puk || '', contrato_id: null, fecha_alta: null });
          }
        });
      }
    } catch(e) { console.error('[Clientes] Error fetching API lines:', e.message); }
  }

  var linesByStatus = {};
  var lineNumbers = [];
  allLines.forEach(function(l) {
    linesByStatus[l.estado || 'desconocido'] = (linesByStatus[l.estado || 'desconocido'] || 0) + 1;
    if (l.linea && !lineNumbers.includes(l.linea)) lineNumbers.push(l.linea);
  });

  // Obtener documentos KYC de este cliente (desde DB local)
  var kycDocs = [];
  try { kycDocs = db.prepare("SELECT d.*, o.datos_cliente FROM altas_kyc_docs d JOIN altas_ordenes o ON d.orden_id=o.id WHERE o.likes_customer_id=? OR o.datos_cliente LIKE ? ORDER BY d.created_at DESC").all(fiscalId, '%' + fiscalId + '%'); } catch(e) {}
  // Documentos KYC desde API (separado para la view)
  var kycDocsApi = [];
  try {
    var apiDocsResponse = await api.getCustomerDocuments(fiscalId);
    var custData = apiDocsResponse && apiDocsResponse.data ? apiDocsResponse.data : apiDocsResponse;
    var apiDocsList = custData && custData.documentation && Array.isArray(custData.documentation) ? custData.documentation : [];
    apiDocsList.forEach(function(d) {
      var url = d.downloadURL || d.uploadURL || d.url || '';
      kycDocsApi.push({
        tipo: d.fileName && d.fileName.includes('reverse') ? 'Reverso DNI' : d.fileName && d.fileName.includes('obverse') ? 'Anverso DNI' : d.type || d.tipo || 'Documento',
        archivo: d.fileName || d.name || '',
        upload_url: d.uploadURL || '',
        download_url: d.downloadURL || url,
        estado: 'subido'
      });
    });
    apiDocsList.forEach(function(d) {
      var fn = d.fileName || d.name || d.downloadURL || '';
      if (fn && !kycDocs.some(function(k) { return k.archivo === fn || (k.download_url && d.downloadURL && k.download_url === d.downloadURL); })) {
        kycDocs.push({
          tipo: d.fileName && d.fileName.includes('reverse') ? 'Reverso DNI' : d.fileName && d.fileName.includes('obverse') ? 'Anverso DNI' : d.type || d.tipo || 'Documento',
          archivo: fn,
          upload_url: d.uploadURL || '',
          download_url: d.downloadURL || url,
          estado: 'subido'
        });
      }
    });
  } catch(e) {}

  // Obtener contratos desde API (subscriptions tienen datos de contrato)
  var apiContratos = [];
  try {
    var subsContratos = await api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(fiscalId) + '&brand_id=' + (api.brandId || '264'));
    var subsCont = Array.isArray(subsContratos) ? subsContratos : (subsContratos.data || subsContratos.subscriptions || []);
    subsCont.forEach(function(s) {
      var prods = s.products || (s.productName ? [s] : []);
      prods.forEach(function(p) {
        apiContratos.push({
          id: s.id || s.subscriptionId || '',
          producto: p.productName || s.productName || '',
          linea: p.fixedNumber || p.lineNumber || s.lineNumber || '',
          estado: s.status || p.status || '',
          fecha_alta: s.startDate || s.created || '',
          iccid: p.icc || s.icc || '',
          pin: s.pin || p.pin || '',
          puk: s.puk || p.puk || ''
        });
      });
    });
  } catch(e) {}

  // Construir URLs de contratos firmados S3 para ordenes completadas
  var contratosS3 = [];
  apiOrders.forEach(function(o) {
    if (o.status === 'COMPLETED' || o.status === 'Completado') {
      var orderId = o.id || '';
      if (orderId) {
        contratosS3.push({
          orderId: orderId,
          url: 'https://prod-likes-customer-documents.s3.eu-central-1.amazonaws.com/264/' + orderId + '/signedContract.pdf'
        });
      }
    }
  });

  // Obtener facturas ISP de este cliente
  var ispFacturas = [];
  try { ispFacturas = db.prepare("SELECT * FROM isp_facturas WHERE fiscal_id=? ORDER BY periodo DESC, id DESC").all(fiscalId); } catch(e) {}
  var facturasAgrupadas = {};
  ispFacturas.forEach(function(f) {
    var p = f.periodo || 'desconocido';
    if (!facturasAgrupadas[p]) facturasAgrupadas[p] = [];
    facturasAgrupadas[p].push(f);
  });

  res.render('clients/view', {
    title: 'Cliente: ' + (clienteData.nombre || fiscalId),
    fiscalId: fiscalId,
    cliente: clienteData,
    apiOverview: apiOverview,
    apiCustomer: apiCustomer,
    apiSubscriptions: apiSubscriptions,
    contratosS3: contratosS3,
    kycDocsApi: kycDocsApi,
    apiOrders: apiOrders,
    apiInvoices: apiInvoices,
    ispFacturas: ispFacturas,
    facturasAgrupadas: facturasAgrupadas,
    apiInstallations: apiInstallations,
    instalacionId: apiInstallations.length > 0 ? apiInstallations[0].installationId || apiInstallations[0].id || "" : "",
    apiPortabilities: apiPortabilities,
    apiPayments: apiPayments,
    contratos: [],
    apiContratos: apiContratos,
    lineas: allLines,
    tickets: [],
    altasOrdenes: [],
    kycDocsPorOrden: {},
    kycDocs: kycDocs,
    documentos: [],
    linesByStatus: JSON.stringify(linesByStatus),
    lineNumbers: lineNumbers,
    apiActions: { canBlock: true, canChangeTariff: true, canDuplicateSim: true, canViewConsumption: true }
  });
});

router.get('/:id', requireAuth, async (req, res) => {
  const cliente = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!cliente) return res.redirect('/clientes');

  let apiOverview = {};
  let apiCustomer = {};
  let apiSubscriptions = [];
  let apiOrders = [];
  let apiInvoices = [];
  let apiInstallations = [];
  let apiPortabilities = [];
  let apiPayments = [];

  const fiscalIdOrCustomerId = cliente.dni_nif || cliente.likes_customer_id;
  if (fiscalIdOrCustomerId) {
    try {
      const api = LikesAPI.getApiInstance();
      const raw = await api.request('GET', '/customer/overview?fiscalId=' + encodeURIComponent(fiscalIdOrCustomerId) +
        '&includeCustomer=true&includeSubscriptions=true&includeOrders=true&includePortabilities=true&includeInstallations=true&includeInvoices=true&includePayments=true');
      const data = raw && raw.data ? raw.data : raw;
      apiOverview = data;
      const cust = data.customer || data;
      apiCustomer = mapApiCustomer(cust);
      apiSubscriptions = mapApiSubscriptions(data.subscriptions);
      // Filtrar solo lineas activas (case-insensitive)
      apiSubscriptions = apiSubscriptions.filter(function(s) {
        var st = (s.status || '').toLowerCase();
        return st === 'active' || st === 'activa';
      });
      // Anadir portabilidadId/referencia desde productos
      apiSubscriptions.forEach(function(s) {
        if (Array.isArray(s.products)) {
          s.products.forEach(function(p) {
            if (p.portabilidadId || p.referencia || p.portabilityId) {
              s.portabilidadId = p.portabilidadId || p.referencia || p.portabilityId || "";
              s.referencia = p.referencia || p.portabilidadId || p.portabilityId || "";
            }
          });
        }
      });
      apiOrders = mapApiOrders(data.orders);
      apiInvoices = mapApiInvoices(data.invoices);
      apiInstallations = mapApiInstallations(data.installations);
      if (Array.isArray(data.portabilities)) apiPortabilities = data.portabilities;
      if (Array.isArray(data.payments)) apiPayments = data.payments;
    } catch (e) {
      console.error('Error fetching API overview for client:', e.message);
    }
  }

  // Obtener documentos KYC desde API (customer.documentation del overview) y contratos S3
  var kycDocsApi2 = [];
  var contratosS32 = [];
  if (fiscalIdOrCustomerId) {
    try {
      // KYC docs from overview customer.documentation
      var custDocs = apiOverview && apiOverview.customer && Array.isArray(apiOverview.customer.documentation) ? apiOverview.customer.documentation : [];
      custDocs.forEach(function(d) {
        var docUrl = d.path ? "https://prod-likes-customer-documents.s3.eu-central-1.amazonaws.com/" + d.path : "";
        kycDocsApi2.push({
          tipo: d.type || d.tipo || "documento",
          archivo: d.path || d.name || d.fileName || "",
          upload_url: docUrl,
          download_url: docUrl,
          estado: "subido"
        });
      });
      // Contratos S3 desde API para ordenes completadas
      if (apiOrders.length > 0) {
        apiOrders.forEach(function(o) {
          if (o.status === "COMPLETED" || o.status === "Completado") {
            var oid = o.id || "";
            if (oid) {
              contratosS32.push({
                orderId: oid,
                url: "https://prod-likes-customer-documents.s3.eu-central-1.amazonaws.com/264/" + oid + "/signedContract.pdf"
              });
            }
          }
        });
      }
    } catch(e) {
      console.error("[Clientes] Error fetching API KYC docs:", e.message);
    }
  }
  
  const tickets = db.prepare('SELECT * FROM tickets WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
  const contratos = db.prepare("SELECT * FROM isp_contratos WHERE client_id = ? ORDER BY created_at DESC").all(req.params.id);
  const altasOrdenes = db.prepare('SELECT * FROM altas_ordenes WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
  const documentos = db.prepare('SELECT * FROM isp_documentos WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);

  const kycDocsPorOrden = {};
  altasOrdenes.forEach(o => {
    const docs = db.prepare('SELECT * FROM altas_kyc_docs WHERE orden_id = ? ORDER BY created_at').all(o.id);
    kycDocsPorOrden[o.id] = docs;
  });

  if (altasOrdenes.length === 0 && cliente.dni_nif) {
    try {
      const ordenesPorDNI = db.prepare("SELECT * FROM altas_ordenes WHERE datos_cliente LIKE ? ORDER BY created_at DESC LIMIT 5").all('%' + cliente.dni_nif + '%');
      ordenesPorDNI.forEach(o => {
        altasOrdenes.push(o);
        const docs = db.prepare('SELECT * FROM altas_kyc_docs WHERE orden_id = ? ORDER BY created_at').all(o.id);
        kycDocsPorOrden[o.id] = docs;
      });
    } catch(e) {}
  }

  const lineas = contratos.map(c => ({
    linea: c.linea || '',
    producto: c.producto || c.tarifa || '',
    estado: c.estado || 'desconocido',
    iccid: c.iccid || '',
    pin: c.pin || '',
    puk: c.puk || '',
    contrato_id: c.id,
    fecha_alta: c.fecha_alta
  }));

  var terminatedStatuses = ['terminada', 'baja', 'cancelled', 'cancelada'];
  const allLines = [...lineas.filter(function(l) { return !terminatedStatuses.includes((l.estado || '').toLowerCase()); })];
  apiSubscriptions.forEach(s => {
    const prods = s.products && s.products.length ? s.products : (s.productName ? [{
      productName: s.productName,
      lineNumber: s.lineNumber || s.fixedNumber || s.phone || s.msisdn || s.numero,
      status: s.status,
      icc: s.icc
    }] : []);
    prods.forEach(p => {
      const st = (p.status || s.status || '').toLowerCase();
      if (terminatedStatuses.includes(st)) return;
      const ln = p.lineNumber || p.fixedNumber || s.lineNumber || s.fixedNumber || '';
      if (ln && !allLines.find(l => l.linea === ln)) {
        allLines.push({
          linea: ln,
          producto: p.productName || s.productName || '',
          estado: st,
          iccid: p.icc || s.icc || '',
          pin: s.pin || '',
          puk: s.puk || '',
          contrato_id: null,
          fecha_alta: s.startDate || s.created || null
        });
      }
    });
  });

  
  // Ultimo fallback: extraer lineas directamente de apiSubscriptions
  if (allLines.length === 0 && apiSubscriptions.length > 0) {
    apiSubscriptions.forEach(function(s) {
      var lnFb = s.lineNumber || s.fixedNumber || s.phone || s.msisdn || s.numero || (s.line && (s.line.lineNumber || s.line.number)) || "";
      if (lnFb && !allLines.find(function(l) { return l.linea === lnFb; })) {
        allLines.push({ linea: lnFb, producto: s.productName || "", estado: (s.status || "").toLowerCase(), iccid: s.icc || "", pin: "", puk: "", contrato_id: null, fecha_alta: null });
      }
    });
  }
// Intentar obtener PIN/PUK de API para cada linea
  // Primero intentar endpoint /line con withSims=true (el que SÍ devuelve simInfo.pin/puk)
  // Luego /line/pinpuk como fallback
  try {
    var api = LikesAPI.getApiInstance();
    for (var li = 0; li < allLines.length; li++) {
      if (allLines[li].linea && (!allLines[li].pin || !allLines[li].puk)) {
        try {
          var lineInfo = await api.getLineInfo(allLines[li].linea);
          if (lineInfo) {
            var info = Array.isArray(lineInfo) ? lineInfo[0] : (lineInfo.data || lineInfo);
            if (info) {
              // El PIN/PUK real esta en simInfo (estructura de la API Likes)
              if (info.simInfo) {
                if (!allLines[li].pin) allLines[li].pin = info.simInfo.pin || info.simInfo.pinCode || "";
                if (!allLines[li].puk) allLines[li].puk = info.simInfo.puk || info.simInfo.pukCode || "";
                if (!allLines[li].iccid) allLines[li].iccid = info.simInfo.icc || info.simInfo.iccid || info.icc || "";
              }
              if (!allLines[li].pin) allLines[li].pin = info.pin || info.pinCode || info.puk1 || "";
              if (!allLines[li].puk) allLines[li].puk = info.puk || info.pukCode || info.puk1 || "";
              if (!allLines[li].iccid) allLines[li].iccid = info.icc || info.iccid || info.iccidNumber || "";
            }
          }
        } catch(e) {
          // Fallback: endpoint especifico de PIN/PUK
          try {
            var pinpukResp = await api.getLinePINPUK(allLines[li].linea);
            if (pinpukResp) {
              var pinpukData = pinpukResp.data || pinpukResp;
              if (Array.isArray(pinpukData)) pinpukData = pinpukData[0];
              if (pinpukData) {
                if (!allLines[li].pin) allLines[li].pin = pinpukData.pin || pinpukData.pinCode || pinpukData.puk1 || "";
                if (!allLines[li].puk) allLines[li].puk = pinpukData.puk || pinpukData.pukCode || pinpukData.puk1 || "";
                if (!allLines[li].iccid) allLines[li].iccid = pinpukData.icc || pinpukData.iccid || pinpukData.iccidNumber || "";
              }
            }
          } catch(e2) {}
        }
      }
    }
  } catch(e) {}
  
  const linesByStatus = {};
  const lineNumbers = [];
  allLines.forEach(l => {
    const estado = l.estado || 'desconocido';
    linesByStatus[estado] = (linesByStatus[estado] || 0) + 1;
    if (l.linea && !lineNumbers.includes(l.linea)) {
      lineNumbers.push(l.linea);
    }
  });

  const customerName = apiCustomer.name || apiCustomer.firstName || (apiCustomer.firstName ? apiCustomer.firstName + ' ' + (apiCustomer.lastName || '') : '') || cliente.nombre + ' ' + (cliente.apellidos || '');

  // Obtener facturas ISP de este cliente
  var ispFacturas2 = [];
  var fiscalId2 = cliente.dni_nif || '';
  try { ispFacturas2 = db.prepare("SELECT * FROM isp_facturas WHERE fiscal_id=? ORDER BY periodo DESC, id DESC").all(fiscalId2); } catch(e) {}
  var facturasAgrupadas2 = {};
  ispFacturas2.forEach(function(f) {
    var p = f.periodo || 'desconocido';
    if (!facturasAgrupadas2[p]) facturasAgrupadas2[p] = [];
    facturasAgrupadas2[p].push(f);
  });

  res.render('clients/view', {
    title: 'Cliente: ' + customerName,
    fiscalId: cliente.dni_nif || '',
    cliente,
    apiOverview,
    apiCustomer,
    apiSubscriptions,
    contratosS3: contratosS32,
    kycDocsApi: kycDocsApi2,
    kycDocs: kycDocsApi2,
    apiOrders,
    apiInvoices,
    ispFacturas: ispFacturas2,
    facturasAgrupadas: facturasAgrupadas2,
    apiInstallations,
    instalacionId: apiInstallations.length > 0 ? apiInstallations[0].installationId || apiInstallations[0].id || "" : "",
    apiPortabilities,
    apiPayments,
    contratos,
    apiContratos: [],
    lineas: allLines,
    tickets,
    altasOrdenes,
    kycDocsPorOrden,
    documentos,
    linesByStatus: JSON.stringify(linesByStatus),
    lineNumbers: lineNumbers,
    apiActions: { canBlock: true, canChangeTariff: true, canDuplicateSim: true, canViewConsumption: true }
  });
});

router.get('/:id/editar', requireAuth, (req, res) => {
  const cliente = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!cliente) return res.redirect('/clientes');
  res.render('clients/edit', { title: 'Editar Cliente', cliente, errors: [] });
});

router.post('/:id/editar', requireAuth, (req, res) => {
  const { nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente } = req.body;
  db.prepare(`
    UPDATE clients SET nombre=?, apellidos=?, dni_nif=?, email=?, telefono=?, telefono2=?, direccion=?, ciudad=?, provincia=?, codigo_postal=?, notas=?, tipo_cliente=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente, req.params.id);
  db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('cliente_actualizado', 'Cliente ' + nombre + ' actualizado', req.params.id);
  res.redirect('/clientes/' + req.params.id);
});

router.post('/:id/eliminar', requireAuth, (req, res) => {
  try {
    var clientData = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
    if (clientData) {
      var existing = db.prepare("SELECT id FROM trash WHERE original_id = ? AND tipo = 'client'").get(req.params.id);
      if (!existing) {
        db.prepare("INSERT INTO trash (tipo, original_id, data, created_at) VALUES ('client', ?, ?, datetime('now'))").run(req.params.id, JSON.stringify(clientData));
      }
    }
    db.prepare("DELETE FROM clients WHERE id = ?").run(req.params.id);
    db.prepare("INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)").run('cliente_eliminado', 'Cliente #' + req.params.id + ' eliminado (con undo)', req.params.id);
    res.redirect('/clientes?undo=' + req.params.id);
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
});

router.post('/:id/line/:lineNumber/block', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.blockLine(req.params.lineNumber, req.body.blocked !== false);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/line/:lineNumber/consumption', requireAuth, async (req, res) => {
  try {
    var ln = req.params.lineNumber;
    // Solo consultar si parece un numero de telefono real (solo digitos, no IDs tipo 15-WD_...)
    if (!ln || /^[A-Z]/i.test(ln) || ln.includes('_') || ln.includes('-')) {
      return res.json({ ok: false, error: 'Linea no soporta consulta de consumo individual' });
    }
    const api = LikesAPI.getApiInstance();
    const result = await api.getLineGB(ln);
    const payload = result.data || result;
    res.json({ ok: true, data: payload });
  } catch (e) {
    res.json({ ok: false, error: 'Consumo no disponible para esta linea: ' + e.message });
  }
});

router.post('/:id/line/:lineNumber/change-tariff', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.changeProduct(req.body);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/line/:lineNumber/metodo-pago', requireAuth, (req, res) => {
  try {
    var clientId = req.params.id;
    var cliente = db.prepare('SELECT * FROM clients WHERE id=?').get(clientId);
    if (!cliente) cliente = db.prepare('SELECT * FROM clients WHERE dni_nif=?').get(clientId);
    if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    var lineas = JSON.parse(cliente.lineas_pago || '{}');
    lineas[req.params.lineNumber] = req.body.metodo_pago;
    db.prepare('UPDATE clients SET lineas_pago=? WHERE id=?').run(JSON.stringify(lineas), cliente.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/:id/line/:lineNumber/cdrs', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.getLineCDRs(req.params.lineNumber);
    let cdrs = Array.isArray(result) ? result : (result.data || result.cdrs || result.records || result.items || result.calls || []);
    if (!Array.isArray(cdrs)) cdrs = [];
    res.json({ ok: true, data: cdrs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/line/:lineNumber/duplicate-sim', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.lineChangeSim(req.body);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/:id/compatible-products', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.getProducts();
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Undo delete
router.post('/undo/:id', requireAuth, (req, res) => {
  try {
    var trash = db.prepare("SELECT * FROM trash WHERE original_id = ? AND tipo = 'client' ORDER BY created_at DESC LIMIT 1").get(req.params.id);
    if (!trash) return res.status(404).json({ error: 'No hay backup para deshacer' });
    var data = JSON.parse(trash.data);
    var existing = db.prepare("SELECT id FROM clients WHERE id = ?").get(data.id);
    if (existing) return res.json({ ok: false, message: 'El cliente ya existe' });
    db.prepare("INSERT INTO clients (id, nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      data.id, data.nombre, data.apellidos, data.dni_nif, data.email, data.telefono, data.telefono2, data.direccion, data.ciudad, data.provincia, data.codigo_postal, data.notas, data.tipo_cliente
    );
    db.prepare("DELETE FROM trash WHERE id = ?").run(trash.id);
    db.prepare("INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)").run('cliente_recuperado', 'Cliente #' + data.id + ' recuperado de papelera', data.id);
    res.json({ ok: true, message: 'Cliente recuperado' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Export clients to CSV
router.get('/export/csv', requireAuth, (req, res) => {
  try {
    var clients = db.prepare("SELECT id, nombre, apellidos, dni_nif, email, telefono, direccion, ciudad, tipo_cliente, created_at FROM clients ORDER BY created_at DESC").all();
    var csv = '\uFEFF'; // BOM for Excel UTF-8
    csv += 'ID,Nombre,Apellidos,DNI/NIF,Email,Teléfono,Dirección,Ciudad,Tipo,Fecha Alta\n';
    clients.forEach(function(c) {
      var row = [c.id, c.nombre, c.apellidos, c.dni_nif, c.email, c.telefono, c.direccion, c.ciudad, c.tipo_cliente, c.created_at];
      csv += row.map(function(v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; }).join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=clientes_' + getToday() + '.csv');
    res.send(csv);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Bulk delete clients (by IDs)
router.post('/bulk/delete', requireAuth, (req, res) => {
  try {
    var ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Se requiere array de IDs' });
    var deleted = 0;
    var stmt = db.prepare("DELETE FROM clients WHERE id = ?");
    ids.forEach(function(id) {
      var info = stmt.run(id);
      if (info.changes > 0) deleted++;
    });
    db.prepare("INSERT INTO activity_log (tipo, descripcion) VALUES (?, ?)").run('bulk_delete', 'Eliminados ' + deleted + ' clientes (IDs: ' + ids.join(',') + ')');
    res.json({ ok: true, deleted: deleted });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Bulk update status (by IDs)
router.post('/bulk/status', requireAuth, (req, res) => {
  try {
    var ids = req.body.ids;
    var estado = req.body.estado;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Se requiere array de IDs' });
    if (!estado) return res.status(400).json({ error: 'Se requiere estado' });
    var updated = 0;
    var stmt = db.prepare("UPDATE clients SET tipo_cliente = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    ids.forEach(function(id) {
      var info = stmt.run(estado, id);
      if (info.changes > 0) updated++;
    });
    db.prepare("INSERT INTO activity_log (tipo, descripcion) VALUES (?, ?)").run('bulk_status', 'Actualizados ' + updated + ' clientes a estado ' + estado);
    res.json({ ok: true, updated: updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Campo editable (IBAN, campos legacy)
router.post('/:id/campo', requireAuth, (req, res) => {
  try {
    var campo = req.body.campo;
    var valor = req.body.valor;
    var col = campo === 'aeat_status' ? 'aeat_status' : campo === 'scoring' ? 'scoring' : campo === 'riesgo' ? 'riesgo' : campo === 'iban' ? 'iban' : null;
    if (!col) return res.status(400).json({ ok: false, error: 'Campo inválido' });
    var clientId = req.params.id;
    var cliente = db.prepare('SELECT id FROM clients WHERE id=?').get(clientId);
    if (!cliente) cliente = db.prepare('SELECT id FROM clients WHERE dni_nif=?').get(clientId);
    if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    db.prepare('UPDATE clients SET ' + col + '=? WHERE id=?').run(valor, cliente.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});


// ============================================================
// ENDPOINT: Scoring local del cliente (GET /clientes/:id/scoring)
// ============================================================
router.get("/:id/scoring", requireAuth, async (req, res) => {
  try {
    var clientId = req.params.id;
    var cliente = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif = ?").get(clientId);
    if (!cliente) {
      return res.status(404).json({ ok: false, error: "Cliente no encontrado" });
    }
    var fiscalId = cliente.dni_nif || cliente.likes_customer_id || "";
    var api = LikesAPI.getApiInstance();
    var detalles = [];
    var puntuacion = 5;
    var riesgo = "medio";

    // 1. Usar scoring real de la API de Likes si existe
    try {
      var scoreResp = await api.request("GET", "/customer?fiscalId=" + encodeURIComponent(fiscalId));
      var cust = scoreResp.data || scoreResp;
      if (cust.hasScoreResult !== undefined) {
        detalles.push("Scoring API Likes disponible");
        if (cust.hasScoreResult === true) {
          puntuacion += 2;
          detalles.push("Cliente con score positivo en Likes");
        }
      }
    } catch(e) {
      detalles.push("Sin scoring de API Likes");
    }

    // 2. Historial facturas
    var facturasPagadas = { total: 0, pagadas: 0 };
    try {
      facturasPagadas = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN estado = \"pagada\" OR estado = \"paid\" OR pagado = 1 THEN 1 ELSE 0 END) as pagadas FROM isp_facturas WHERE fiscal_id = ?").get(fiscalId);
    } catch(e) {}
    var totalFacturas = facturasPagadas.total || 0;
    var pagadas = facturasPagadas.pagadas || 0;
    if (totalFacturas > 0) {
      var ratioPago = pagadas / totalFacturas;
      if (ratioPago >= 0.9) { puntuacion += 2; detalles.push("Alto ratio de pago: " + Math.round(ratioPago * 100) + "%"); }
      else if (ratioPago >= 0.7) { puntuacion += 1; detalles.push("Ratio de pago medio: " + Math.round(ratioPago * 100) + "%"); }
      else { puntuacion -= 1; detalles.push("Bajo ratio de pago: " + Math.round(ratioPago * 100) + "%"); }
    } else {
      detalles.push("Sin historial de facturas en DB local");
    }

    // 3. Validación DNI/NIF
    var dni = (fiscalId || "").toUpperCase();
    // DNI: 8 digitos + letra, NIE: XYZ + 7 digitos + letra, NIF: 1 letra + 7 digitos + letra, Otros: pasaporte, etc
    var dniValido = /^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[A-Z]\d{7}[A-Z]|\d{8}|[A-Z0-9]{6,15})$/i.test(dni) && dni.length >= 6;
    if (dniValido) { puntuacion += 1; detalles.push("DNI/NIF con formato válido"); }
    else if (dni) { puntuacion -= 1; detalles.push("DNI/NIF formato inválido: " + dni); }
    else { detalles.push("Sin DNI/NIF"); }

    // 4. Email y teléfono
    if (cliente.email || cliente.telefono) { puntuacion += 1; detalles.push("Contacto completo"); }
    else { detalles.push("Falta email o teléfono"); }

    // 5. Líneas activas
    try {
      var lineasActivas = JSON.parse(cliente.lineas || "[]").filter(function(l) { return l.estado === "Activa" || l.status === "ACTIVE"; }).length;
      if (lineasActivas > 0) { puntuacion += 1; detalles.push(lineasActivas + " línea(s) activa(s)"); }
    } catch(e) { detalles.push("Sin líneas activas"); }

    // Normalizar 1-10
    if (puntuacion < 1) puntuacion = 1;
    if (puntuacion > 10) puntuacion = 10;
    if (puntuacion >= 8) riesgo = "bajo";
    else if (puntuacion >= 5) riesgo = "medio";
    else riesgo = "alto";

    res.json({ ok: true, scoring: puntuacion, risk: riesgo, detalles: detalles, recomendacion: riesgo === "alto" ? "Revisar antes de nueva contratación" : riesgo === "medio" ? "Cliente estándar" : "Cliente confiable" });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// ENDPOINT: Consumo diario por linea (POST /clientes/:id/line/:line/daily-consumption)
// ============================================================
router.post("/:id/line/:line/daily-consumption", requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.getLineCDRs(req.params.line);
    var cdrs = Array.isArray(result) ? result : (result.data || result.cdrs || result.records || result.items || result.calls || []);
    if (!Array.isArray(cdrs)) cdrs = [];

    // Agrupar CDRs por fecha y calcular GB, llamadas, SMS
    var consumoDiario = {};
    cdrs.forEach(function(cdr) {
      var fecha = cdr.date || cdr.fecha || cdr.startDate || cdr.start_date || cdr.callDate || cdr.calldate || "";
      if (!fecha) return;
      var dia = fecha.substring(0, 10);
      if (!consumoDiario[dia]) {
        consumoDiario[dia] = { date: dia, gb: 0, calls: 0, sms: 0, cost: 0 };
      }
      var duracion = parseFloat(cdr.duracion || cdr.duration || cdr.seconds || cdr.secs || 0);
      var volumen = parseFloat(cdr.volumen || cdr.volume || cdr.bytes || cdr.kb || cdr.mb || 0);
      var coste = parseFloat(cdr.coste || cdr.cost || cdr.cargo || cdr.price || cdr.importe || 0);
      var tipo = (cdr.type || cdr.tipo || cdr.callType || cdr.call_type || "").toLowerCase();

      if (tipo === "sms" || tipo === "mensaje" || tipo === "texto" || tipo === "message") {
        consumoDiario[dia].sms += 1;
        consumoDiario[dia].cost += coste;
      } else if (tipo === "llamada" || tipo === "call" || tipo === "voz" || tipo === "voice" || tipo === "outgoing" || tipo === "incoming" || tipo === "entrante" || tipo === "saliente") {
        consumoDiario[dia].calls += 1;
        consumoDiario[dia].cost += coste;
        if (duracion > 0) {
          consumoDiario[dia].gb += duracion / 3600 * 0.0005;
        }
      } else if (tipo === "datos" || tipo === "data" || tipo === "internet" || tipo === "navegacion" || tipo === "gprs" || tipo === "lte" || tipo === "4g" || tipo === "5g") {
        consumoDiario[dia].cost += coste;
        if (volumen > 0) {
          if (cdr.bytes) consumoDiario[dia].gb += volumen / (1024 * 1024 * 1024);
          else if (cdr.kb) consumoDiario[dia].gb += volumen / (1024 * 1024);
          else if (cdr.mb) consumoDiario[dia].gb += volumen / 1024;
          else consumoDiario[dia].gb += volumen;
        }
      } else {
        if (volumen > 0 && duracion === 0) {
          if (cdr.bytes) consumoDiario[dia].gb += volumen / (1024 * 1024 * 1024);
          else if (cdr.kb) consumoDiario[dia].gb += volumen / (1024 * 1024);
          else if (cdr.mb) consumoDiario[dia].gb += volumen / 1024;
          else consumoDiario[dia].gb += volumen;
        } else if (duracion > 0) {
          consumoDiario[dia].calls += 1;
        }
      }
    });

    var dailyData = Object.keys(consumoDiario).sort().reverse().map(function(d) {
      return {
        date: d,
        gb: Math.round(consumoDiario[d].gb * 10000) / 10000,
        calls: consumoDiario[d].calls,
        sms: consumoDiario[d].sms
      };
    });

    res.json({ ok: true, data: dailyData });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// ENDPOINT: Info de línea (POST /clientes/:id/line/:line/info)
// ============================================================
router.post("/:id/line/:line/info", requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var lineNumber = req.params.line;

    // Intentar endpoint específico de PIN/PUK + info
    var pinpukResp = await api.request("GET", "/line/pinpuk?lineNumber=" + encodeURIComponent(lineNumber));
    var pinpukData = pinpukResp && pinpukResp.data ? pinpukResp.data : pinpukResp;
    if (Array.isArray(pinpukData)) pinpukData = pinpukData[0];

    // Fallback a getLineInfo
    var lineInfo = {};
    try {
      var infoResp = await api.getLineInfo(lineNumber);
      lineInfo = infoResp && infoResp.data ? infoResp.data : infoResp;
      if (Array.isArray(lineInfo)) lineInfo = lineInfo[0];
    } catch(e) {}

    // Combinar datos
    var result = {
      iccid: pinpukData?.icc || pinpukData?.iccid || pinpukData?.iccidNumber || lineInfo?.icc || lineInfo?.iccid || lineInfo?.iccidNumber || '',
      pin: pinpukData?.pin || pinpukData?.pinCode || pinpukData?.puk1 || lineInfo?.pin || lineInfo?.pinCode || lineInfo?.puk1 || '',
      puk: pinpukData?.puk || pinpukData?.pukCode || pinpukData?.puk1 || lineInfo?.puk || lineInfo?.pukCode || lineInfo?.puk1 || '',
      titular: lineInfo?.holderName || lineInfo?.clientName || lineInfo?.customerName || lineInfo?.titular || '',
      dni: lineInfo?.fiscalId || lineInfo?.dni || lineInfo?.nif || '',
      spn: lineInfo?.spn || lineInfo?.operator || lineInfo?.spnName || '',
      status: lineInfo?.status || lineInfo?.estado || '',
      creditLimit: lineInfo?.creditLimit || lineInfo?.credit_limit || lineInfo?.limit || ''
    };

    res.json({ ok: true, data: result });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Proxy para descargar contratos firmados desde S3 con token presignado
router.get('/contrato/s3/:orderId', requireAuth, async (req, res) => {
  try {
    var orderId = req.params.orderId;
    var api = LikesAPI.getApiInstance();
    var pdfUrl = null;
    // 1. Intentar con API de Likes - multiples endpoints
    try {
      var api = LikesAPI.getApiInstance();
      // 1a. Intentar con documentation
      var ordersResp = await api.request('GET', '/draft-order-v2?orderId=' + encodeURIComponent(orderId) + '&withDocumentation=true');
      var order = ordersResp.data || ordersResp;
      var docs = order.documentation || order.documents || [];
      for (var doc of docs) {
        if (doc.downloadURL && doc.downloadURL.startsWith('http')) { pdfUrl = doc.downloadURL; console.log('[Contrato] URL documentation API para', orderId); break; }
        if (doc.url && doc.url.startsWith('http')) { pdfUrl = doc.url; console.log('[Contrato] URL doc.url API para', orderId); break; }
      }
      // 1b. Buscar en toda la respuesta cualquier URL que contenga "contract" o "firma"
      if (!pdfUrl) {
        (function findContractUrl(obj) {
          if (!obj || typeof obj !== 'object') return;
          for (var k in obj) {
            var v = obj[k];
            if (v && typeof v === 'string' && v.startsWith('http') && (k.toLowerCase().includes('contract') || k.toLowerCase().includes('firma') || k.toLowerCase().includes('signed') || k.toLowerCase().includes('contrato'))) {
              pdfUrl = v; return;
            }
            if (typeof v === 'object') findContractUrl(v);
          }
        })(ordersResp);
      }
      // 1c. Si no hay docs, intentar order detail
      if (!pdfUrl) {
        try {
          var detailResp = await api.request('GET', '/draft-order-v2/' + encodeURIComponent(orderId));
          var detail = detailResp.data || detailResp;
          if (detail.downloadURL && detail.downloadURL.startsWith('http')) pdfUrl = detail.downloadURL;
          else if (detail.signedContractUrl && detail.signedContractUrl.startsWith('http')) pdfUrl = detail.signedContractUrl;
          else if (detail.contractUrl && detail.contractUrl.startsWith('http')) pdfUrl = detail.contractUrl;
          else if (detail.pdfUrl && detail.pdfUrl.startsWith('http')) pdfUrl = detail.pdfUrl;
        } catch(e) {}
      }
      if (pdfUrl) console.log('[Contrato] URL encontrada para', orderId);
    } catch(e) { console.log('[Contrato] API falló:', e.message.substring(0, 80)); }
    // 2. Fallback: intentar con API customer documents
    if (!pdfUrl) {
      try {
        var fiscalId = req.params.id || (req.originalUrl || '').match(/\/clientes\/([^/]+)\//)?.[1];
        if (fiscalId) {
          var custDocs = await api.request('GET', '/customer?fiscalId=' + encodeURIComponent(fiscalId) + '&withDocumentation=true');
          var docsData = custDocs.data?.documentation || custDocs.documentation || [];
          if (Array.isArray(docsData)) {
            for (var di2 = 0; di2 < docsData.length; di2++) {
              var d2 = docsData[di2];
              if (d2.downloadURL && d2.downloadURL.startsWith('http')) { pdfUrl = d2.downloadURL; break; }
            }
          }
        }
      } catch(e2) { console.log('[Contrato] Customer docs fallback error:', e2.message); }
    }
    if (!pdfUrl) return res.status(404).send('Contrato no disponible');
    var https = require('https');
    https.get(pdfUrl, function(proxyRes) {
      if (proxyRes.statusCode !== 200) return res.status(404).send('Contrato no disponible');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="contrato-' + orderId + '.pdf"');
      proxyRes.pipe(res);
    }).on('error', function(e) {
      res.status(500).send('Error al descargar contrato: ' + e.message);
    });
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// ENDPOINT: Documentos KYC del cliente (GET /clientes/:id/kyc)
router.get('/:id/kyc', requireAuth, async (req, res) => {
  try {
    var clientId = req.params.id;
    var cliente = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif = ?").get(clientId);
    if (!cliente) return res.status(404).json({ ok: false, error: "Cliente no encontrado" });
    var fiscalId = cliente.dni_nif || cliente.likes_customer_id || '';
    var api = LikesAPI.getApiInstance();
    var custResp = await api.getCustomerDocuments(fiscalId);
    var cust = custResp.data || custResp;
    var docs = cust.documentation || [];
    var result = docs.map(function(d) {
      return { downloadURL: d.downloadURL, uploadURL: d.uploadURL, fileName: d.fileName || d.name || (d.downloadURL.includes('obverse') ? 'obverseDocument.jpeg' : 'reverseDocument.jpeg') };
    });
    res.json({ ok: true, data: result });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// NUEVOS ENDPOINTS (migrados de clientes-movilbro)
// ============================================================

// Buscar cliente por teléfono (para CodeOpen overlay)
router.get('/api/find-by-phone/:phone', requireAuth, async (req, res) => {
  try {
    var phone = req.params.phone.replace(/[^0-9]/g, '');
    if (phone.length < 9) return res.json({ ok: false });
    var api = LikesAPI.getApiInstance();
    var customers = await api.getCustomers();
    if (Array.isArray(customers)) {
      for (var c of customers) {
        var cPhone = String(c.phone || c.mobile || c.telefono || c.contactInfo?.phone || '').replace(/[^0-9]/g, '');
        if (cPhone && (cPhone.includes(phone) || phone.includes(cPhone) || phone.slice(-9) === cPhone.slice(-9))) {
          var fiscalId = c.fiscalId || c.fiscal_id || c.dni || c.fiscalNumber || '';
          if (fiscalId) return res.json({ ok: true, fiscalId: fiscalId, name: c.name || c.firstName || '' });
        }
      }
    }
    res.json({ ok: false });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// PIN/PUK con 4 fallbacks
router.post('/:id/line/:line/pinpuk', requireAuth, async (req, res) => {
  var api = LikesAPI.getApiInstance();
  var lineNum = req.params.line;
  // Helper para extraer pin/puk de cualquier objeto (busca tambien en simInfo)
  function extractPinPuk(obj) {
    if (!obj) return null;
    var d = obj.data || obj;
    if (Array.isArray(d)) d = d[0];
    if (!d) return null;
    // Buscar en simInfo primero (estructura real de la API)
    if (d.simInfo && (d.simInfo.pin || d.simInfo.puk)) return { pin: d.simInfo.pin, puk: d.simInfo.puk, icc: d.simInfo.icc || d.icc || '' };
    // Buscar en raiz
    if (d.pin || d.puk || d.pinCode || d.pukCode) return { pin: d.pin || d.pinCode, puk: d.puk || d.pukCode, icc: d.icc || d.iccid || '' };
    // Buscar en sims array
    if (Array.isArray(d.sims) && d.sims.length > 0 && (d.sims[0].pin || d.sims[0].puk)) return { pin: d.sims[0].pin, puk: d.sims[0].puk, icc: d.sims[0].icc || '' };
    // Buscar en customer
    if (d.customer && (d.customer.pin || d.customer.puk)) return { pin: d.customer.pin, puk: d.customer.puk, icc: d.customer.icc || '' };
    return null;
  }
  // 1. Intentar /line/pinpuk endpoint especifico
  try {
    var ppd = extractPinPuk(await api.getLinePINPUK(lineNum));
    if (ppd) return res.json({ ok: true, data: ppd });
  } catch(e) {}
  // 2. Intentar /line con withSims=true (el que SÍ devuelve simInfo.pin/puk)
  try {
    var lid = extractPinPuk(await api.getLineInfo(lineNum));
    if (lid) return res.json({ ok: true, data: lid });
  } catch(e2) {}
  // 3. Intentar /line/sim
  try {
    var simd = extractPinPuk(await api.request('GET', '/line/sim?lineNumber=' + encodeURIComponent(lineNum)));
    if (simd) return res.json({ ok: true, data: simd });
  } catch(e3) {}
  // 4. Intentar /line sin extras
  try {
    var i2d = extractPinPuk(await api.request('GET', '/line?lineNumber=' + encodeURIComponent(lineNum) + '&withSims=true'));
    if (i2d) return res.json({ ok: true, data: i2d });
  } catch(e4) {}
  res.json({ ok: false, error: 'No se pudo obtener PIN/PUK' });
});

// Generar nuevo PIN/PUK
router.post('/:id/line/:line/generate-pinpuk', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.request('POST', '/line/generatePinPuk', { lineNumber: req.params.line });
    res.json({ ok: true, data: result && result.data ? result.data : result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Full consumption: GB + CDRs + PINPUK + Info + SVAs + SIM
router.post('/:id/line/:line/full-consumption', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var lineNumber = req.params.line;
    var results = { gb: null, pinpuk: null, lineInfo: null, svas: [], cdrs: [], sim: null, creditLimit: null };
    try { var gb = await api.getLineGB(lineNumber); results.gb = gb && gb.data ? gb.data : gb; } catch(e) {}
    try { var cdrs = await api.getLineCDRs(lineNumber); results.cdrs = Array.isArray(cdrs) ? cdrs : (cdrs && cdrs.data ? cdrs.data : []); } catch(e) {}
    try { var pinpuk = await api.getLinePINPUK(lineNumber); results.pinpuk = pinpuk && pinpuk.data ? pinpuk.data : pinpuk; } catch(e) {}
    try { var info = await api.getLineInfo(lineNumber); results.lineInfo = Array.isArray(info) ? info[0] : (info && info.data ? info.data : info); } catch(e) {}
    try { var svas = await api.getLineSVAs(lineNumber); results.svas = Array.isArray(svas) ? svas : (svas && svas.data ? svas.data : []); } catch(e) {}
    try { var sim = await api.request('GET', '/line/sim?lineNumber=' + encodeURIComponent(lineNumber)); results.sim = sim && sim.data ? sim.data : sim; } catch(e) {}
    try { var cl = await api.getLineCreditLimit(lineNumber); results.creditLimit = cl && cl.data ? cl.data : cl; } catch(e) {}
    res.json({ ok: true, data: results });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Generar QR para eSIM
router.get('/:id/line/:line/qr', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var lineNumber = req.params.line;
    var info = await api.getLineInfo(lineNumber);
    var lineData = Array.isArray(info) ? info[0] : (info && info.data ? info.data : info);
    var icc = '';
    var pin = '';
    var puk = '';
    if (lineData && lineData.sims && lineData.sims.length > 0) {
      icc = lineData.sims[0].icc || lineData.sims[0].iccid || '';
      pin = lineData.sims[0].pin || '';
      puk = lineData.sims[0].puk || '';
    }
    var qrText = 'ICC:' + icc + '\nPIN:' + pin + '\nPUK:' + puk + '\nLINE:' + lineNumber;
    var QR = require('qrcode');
    var qrBuffer = await QR.toBuffer(qrText, { type: 'png', width: 300, margin: 2 });
    res.type('image/png').send(qrBuffer);
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// SVAs (roaming, etc.)
router.post('/:id/line/:line/svas', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.updateLineSVAs(req.params.line, req.body);
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Actualizar límite de crédito
router.post('/:id/line/:line/credit-limit', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.setLineCreditLimit(req.params.line, req.body.limit || req.body.amount || 0);
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Crear ticket
router.post('/:id/ticket', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var cliente = db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif=?").get(req.params.id);
    var fiscalId = (cliente && (cliente.dni_nif || cliente.likes_customer_id)) || req.params.id;
    var result = await api.createTicket({ fiscalId: fiscalId, ...req.body });
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Productos opcionales compatibles (bonos)
router.get('/:id/line/:line/compatible-optional-products', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var cliente = db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif=?").get(req.params.id);
    var fiscalId = (cliente && (cliente.dni_nif || cliente.likes_customer_id)) || req.params.id;
    var optional = await api.request('GET', '/subscription/getCompatibleOptionalProducts?fiscalId=' + encodeURIComponent(fiscalId) + '&lineNumber=' + encodeURIComponent(req.params.line));
    var products = optional && optional.data ? optional.data : (Array.isArray(optional) ? optional : []);
    res.json({ ok: true, data: products });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Añadir producto opcional (bono)
router.post('/:id/line/:line/add-optional-product', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var cliente = db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif=?").get(req.params.id);
    var fiscalId = (cliente && (cliente.dni_nif || cliente.likes_customer_id)) || req.params.id;
    var result = await api.addOptionalProduct({ fiscalId: fiscalId, lineNumber: req.params.line, ...req.body });
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Tipologías de tickets
router.get('/:id/ticket-typologies', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.getTicketTypologies();
    res.json({ ok: true, data: Array.isArray(result) ? result : (result && result.data ? result.data : []) });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Subir documento KYC
router.post('/:id/upload-kyc', requireAuth, cmUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió archivo' });
    var cliente = db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif=?").get(req.params.id);
    var fiscalId = (cliente && (cliente.dni_nif || cliente.likes_customer_id)) || req.params.id;
    var tipo = req.body.tipo || 'obverseDocument';
    var api = LikesAPI.getApiInstance();
    var fileBuf = fs.readFileSync(req.file.path);
    var apiOk = false, driveId = null, driveLink = '';
    try {
      var custResp = await api.getCustomerDocuments(fiscalId);
      var cust = custResp && custResp.data ? custResp.data : custResp;
      var docs = Array.isArray(cust.documentation) ? cust.documentation : (Array.isArray(cust.documents) ? cust.documents : []);
      var docInfo = docs.find(function(d) { return (d.type === tipo || d.documentType === tipo); }) || docs[0];
      if (docInfo && docInfo.uploadURL) {
        var axios = require('axios');
        await axios.put(docInfo.uploadURL, fileBuf, { headers: { 'Content-Type': req.file.mimetype || 'image/jpeg' } });
        apiOk = true;
      }
    } catch(apiErr) { console.error('[Clientes] API KYC upload error:', apiErr.message); }
    try {
      if (drive.isAvailable()) {
        var folderName = 'KYC_' + fiscalId.replace(/[^a-zA-Z0-9]/g, '_');
        var driveRootId = process.env.DRIVE_ROOT_FOLDER_ID || '1JrStvTy-l0msOmfwT1S0Jupg6Ru6Zemx';
        var kycFolder = await drive.ensureFolder(driveRootId, folderName);
        if (kycFolder) {
          var google = require('googleapis').google;
          var d2 = google.drive({ version: 'v3', auth: drive.getAuth() });
          var result = await d2.files.create({
            requestBody: { name: (req.file.originalname || tipo + '_' + Date.now() + '.jpg'), parents: [kycFolder] },
            media: { mimeType: req.file.mimetype || 'image/jpeg', body: fs.createReadStream(req.file.path) },
            fields: 'id, webViewLink'
          });
          if (result && result.data) { driveId = result.data.id; driveLink = result.data.webViewLink; }
        }
      }
    } catch(driveErr) { console.error('[Clientes] Drive KYC upload error:', driveErr.message); }
    try { fs.unlinkSync(req.file.path); } catch(e) {}
    res.json({ ok: true, message: 'Documento subido' + (apiOk ? ' (API + Drive)' : ' (solo Drive)'), apiOk: apiOk, driveId: driveId, driveLink: driveLink });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Subir contrato firmado
router.post('/:id/upload-contract', requireAuth, cmUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió archivo' });
    var cliente = db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif=?").get(req.params.id);
    var fiscalId = (cliente && (cliente.dni_nif || cliente.likes_customer_id)) || req.params.id;
    var api = LikesAPI.getApiInstance();
    var fileBuf = fs.readFileSync(req.file.path);
    var apiOk = false, driveId = null, driveLink = '';
    try {
      var custResp = await api.getCustomerDocuments(fiscalId);
      var cust = custResp && custResp.data ? custResp.data : custResp;
      var docs = Array.isArray(cust.documentation) ? cust.documentation : (Array.isArray(cust.documents) ? cust.documents : []);
      var docFirma = docs.find(function(d) { var t = (d.type || d.documentType || '').toLowerCase(); return t.includes('firma') || t.includes('contract') || t.includes('contrato'); });
      if (docFirma && docFirma.uploadURL) {
        var axios = require('axios');
        await axios.put(docFirma.uploadURL, fileBuf, { headers: { 'Content-Type': 'application/pdf' } });
        apiOk = true;
      }
    } catch(apiErr) { console.error('[Clientes] API contract upload error:', apiErr.message); }
    try {
      if (drive.isAvailable()) {
        var now = new Date();
        var year = now.getFullYear(), month = String(now.getMonth() + 1).padStart(2, '0');
        var uploadResult = await drive.uploadToDrive(fileBuf, 'contrato_' + fiscalId + '_' + Date.now() + '.pdf', year, month);
        if (uploadResult) { driveId = uploadResult.id; driveLink = uploadResult.webViewLink; }
      }
    } catch(driveErr) { console.error('[Clientes] Drive contract upload error:', driveErr.message); }
    try { fs.unlinkSync(req.file.path); } catch(e) {}
    res.json({ ok: true, message: 'Contrato subido' + (apiOk ? ' (API + Drive)' : ' (solo Drive)'), apiOk: apiOk, driveId: driveId, driveLink: driveLink });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Calcular scoring online
router.post('/:id/calculate-scoring', requireAuth, async (req, res) => {
  try {
    var cliente = db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif=?").get(req.params.id);
    var fiscalId = (cliente && (cliente.dni_nif || cliente.likes_customer_id)) || req.params.id;
    var api = LikesAPI.getApiInstance();
    var detalles = [];
    var detalleCompleto = [];
    var puntuacion = 5;
    var riesgo = 'medio';

    // 1. API Likes scoring
    try {
      var custResp = await api.request('GET', '/customer?fiscalId=' + encodeURIComponent(fiscalId));
      var custData = custResp.data || custResp;
      var sc = parseFloat(custData.scoring || custData.score || custData.creditScore || custData.rating || -1);
      if (sc >= 0) { puntuacion = sc; detalles.push('Basado en scoring de API Likes: ' + sc + '/10'); detalleCompleto.push({ factor: 'Scoring API Likes', valor: sc + '/10', impacto: 'base ' + sc, color: sc >= 6 ? 'success' : 'warning' }); }
      if (custData.aeatStatus) {
        detalles.push('Según AEAT: ' + custData.aeatStatus);
        if (custData.aeatStatus.toLowerCase().includes('ok') || custData.aeatStatus.toLowerCase().includes('valid')) { puntuacion += 1; detalleCompleto.push({ factor: 'Situación AEAT', valor: custData.aeatStatus, impacto: '+1 punto', color: 'success' }); }
        else { puntuacion -= 1; detalleCompleto.push({ factor: 'Situación AEAT', valor: custData.aeatStatus, impacto: '-1 punto', color: 'danger' }); }
      }
    } catch(e) { detalles.push('API Likes no devuelve scoring'); detalleCompleto.push({ factor: 'Scoring API Likes', valor: 'No disponible', impacto: 'neutro', color: 'secondary' }); }

    // 2. Facturas ISP
    try {
      var facRow = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN estado='pagada' OR estado='paid' OR pagado=1 THEN 1 ELSE 0 END) as pagadas, SUM(CASE WHEN estado='pagada' OR estado='paid' OR pagado=1 THEN 0 ELSE importe END) as deuda FROM isp_facturas WHERE fiscal_id=?").get(fiscalId);
      if (facRow && facRow.total > 0) {
        var ratio = facRow.pagadas / facRow.total;
        var deuda = parseFloat(facRow.deuda || 0).toFixed(2);
        detalles.push('De ' + facRow.total + ' facturas ISP, ' + facRow.pagadas + ' pagadas (' + Math.round(ratio*100) + '%)' + (deuda > 0 ? ', deuda pendiente: ' + deuda + '€' : ''));
        if (ratio >= 0.9) { puntuacion += 2; detalleCompleto.push({ factor: 'Pago facturas ISP', valor: facRow.pagadas + '/' + facRow.total + ' pagadas', impacto: '+2 puntos', color: 'success' }); }
        else if (ratio >= 0.7) { puntuacion += 1; detalleCompleto.push({ factor: 'Pago facturas ISP', valor: facRow.pagadas + '/' + facRow.total + ' pagadas', impacto: '+1 punto', color: 'success' }); }
        else { puntuacion -= 1; detalleCompleto.push({ factor: 'Pago facturas ISP', valor: facRow.pagadas + '/' + facRow.total + ' pagadas', impacto: '-1 punto', color: 'danger' }); }
        if (deuda > 0) { puntuacion -= 1; detalleCompleto.push({ factor: 'Deuda pendiente ISP', valor: deuda + '€', impacto: '-1 punto', color: 'danger' }); }
      } else { detalles.push('No hay facturas ISP en DB'); detalleCompleto.push({ factor: 'Pago facturas ISP', valor: 'Sin historial', impacto: 'neutro', color: 'secondary' }); }
    } catch(e) {}

    // 3. DNI/NIF
    var dniClean = fiscalId.toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (/^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[A-Z]\d{7}[A-Z]|\d{8}|[A-Z]\d{8})$/i.test(dniClean)) { puntuacion += 1; detalleCompleto.push({ factor: 'Formato DNI/NIF/CIF', valor: fiscalId, impacto: '+1 punto', color: 'success' }); }
    else if (dniClean) { puntuacion -= 1; detalleCompleto.push({ factor: 'Formato DNI/NIF/CIF', valor: fiscalId, impacto: '-1 punto (inválido)', color: 'danger' }); }

    // 4. Antigüedad del cliente
    try {
      var fCreacion = cliente ? (cliente.created_at || '') : '';
      if (!fCreacion) {
        try {
          var custInfo = await api.request('GET', '/customer?fiscalId=' + encodeURIComponent(fiscalId));
          if (custInfo) {
            var cd = custInfo.data || custInfo;
            fCreacion = cd.created || cd.created_at || cd.creationDate || cd.registrationDate || cd.fecha_alta || cd.fecha_creacion || '';
          }
        } catch(e) {}
      }
      if (fCreacion) {
        var meses = Math.floor((Date.now() - new Date(fCreacion).getTime()) / (30 * 24 * 60 * 60 * 1000));
        if (meses >= 24) { puntuacion += 2; detalleCompleto.push({ factor: 'Antigüedad como cliente', valor: meses + ' meses', impacto: '+2 puntos (fidelidad)', color: 'success' }); }
        else if (meses >= 12) { puntuacion += 1; detalleCompleto.push({ factor: 'Antigüedad como cliente', valor: meses + ' meses', impacto: '+1 punto', color: 'success' }); }
        else { detalleCompleto.push({ factor: 'Antigüedad como cliente', valor: (meses || '<1') + ' meses', impacto: 'neutro (poco tiempo)', color: 'secondary' }); }
      } else { detalleCompleto.push({ factor: 'Antigüedad como cliente', valor: 'Desconocida', impacto: 'neutro', color: 'secondary' }); }
    } catch(e) {}

    // 5. Número de líneas activas
    try {
      var subsData = null;
      try { subsData = await api.request('GET', '/subscription?fiscalId=' + encodeURIComponent(fiscalId)); } catch(e) {}
      var subsList = subsData && subsData.data ? (Array.isArray(subsData.data) ? subsData.data : [subsData.data]) : (Array.isArray(subsData) ? subsData : []);
      if (subsList.length > 0) {
        var activas = subsList.filter(function(s) {
          var st = (s.status || '').toLowerCase();
          return st === 'active' || st === 'activa' || st === 'activo';
        }).length;
        if (activas >= 3) { puntuacion += 1; detalleCompleto.push({ factor: 'Líneas activas', valor: activas + ' activas', impacto: '+1 punto (cliente consolidado)', color: 'success' }); }
        else if (activas >= 1) { detalleCompleto.push({ factor: 'Líneas activas', valor: activas + ' activa(s)', impacto: 'neutro', color: 'secondary' }); }
        else { puntuacion -= 1; detalleCompleto.push({ factor: 'Líneas activas', valor: '0 activas', impacto: '-1 punto (sin actividad)', color: 'danger' }); }
      }
    } catch(e) {}

    // 6. Verificación de dirección con Nominatim (OpenStreetMap, gratis)
    try {
      var direccion = cliente ? (cliente.direccion || cliente.address || '') : '';
      if (!direccion || direccion.length < 5) { try { var custInfo2 = await api.request('GET', '/customer?fiscalId=' + encodeURIComponent(fiscalId) + '&withAddress=true'); if (custInfo2 && custInfo2.data) { var ba = custInfo2.data.billingAddress || {}; direccion = (ba.street || ba.address || '') + ' ' + (ba.city || ''); } } catch(e) {} }
      if (direccion && direccion.length > 5) {
        var https = require('https');
        var addrClean = direccion.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s,.-]/g, ' ').trim().substring(0, 100);
        var result = await new Promise(function(resolve) {
          https.get('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(addrClean) + '&format=json&limit=1&countrycodes=es', { headers: { 'User-Agent': 'MovilbroCRM/1.0' } }, function(r) {
            var b = '';
            r.on('data', function(c) { b += c; });
            r.on('end', function() { try { var d = JSON.parse(b); resolve(d && d.length > 0 ? d[0] : null); } catch(e) { resolve(null); } });
            r.on('error', function() { resolve(null); });
          }).on('error', function() { resolve(null); });
        });
        if (result && result.lat && result.lon) {
          var tipo = result.type || result.class || 'lugar';
          puntuacion += 1;
          detalleCompleto.push({ factor: 'Dirección verificada', valor: addrClean.substring(0, 50) + '... (' + tipo + ')', impacto: '+1 punto (dirección real)', color: 'success' });
        } else {
          detalleCompleto.push({ factor: 'Dirección verificada', valor: 'No confirmada en OpenStreetMap', impacto: 'neutro', color: 'secondary' });
        }
      } else {
        detalleCompleto.push({ factor: 'Dirección verificada', valor: 'Sin datos de dirección', impacto: 'neutro', color: 'secondary' });
      }
    } catch(e) { detalleCompleto.push({ factor: 'Dirección verificada', valor: 'Error en verificación', impacto: 'neutro', color: 'secondary' }); }

    // 7. Validación de IBAN si existe
    try {
      if (cliente && cliente.lineas_pago) {
        var lp = cliente.lineas_pago;
        if (typeof lp === 'string') try { lp = JSON.parse(lp); } catch(e) { lp = null; }
        if (lp && typeof lp === 'object') {
          var ibanes = Object.values(lp).filter(function(v) { return typeof v === 'string' && v.toUpperCase().startsWith('ES'); });
          if (ibanes.length > 0) {
            puntuacion += 1;
            detalleCompleto.push({ factor: 'IBAN registrado', valor: ibanes.length + ' cuenta(s)', impacto: '+1 punto', color: 'success' });
          } else {
            detalleCompleto.push({ factor: 'IBAN registrado', valor: 'Sin IBAN', impacto: 'neutro', color: 'secondary' });
          }
        }
      }
    } catch(e) {}

    // 8. KYC/Contrato firmado
    try {
      var kycRow = db.prepare("SELECT COUNT(*) as total FROM kyc WHERE fiscal_id=? AND estado='completado'").get(fiscalId);
      if (kycRow && kycRow.total > 0) {
        puntuacion += 1;
        detalleCompleto.push({ factor: 'KYC/Contrato firmado', valor: 'Completado', impacto: '+1 punto', color: 'success' });
      } else {
        detalleCompleto.push({ factor: 'KYC/Contrato firmado', valor: 'Pendiente', impacto: 'neutro', color: 'secondary' });
      }
    } catch(e) {}

    // 9. Tickets/incidencias abiertos
    try {
      var ticRow = db.prepare("SELECT COUNT(*) as total FROM tickets WHERE fiscal_id=? AND estado!='closed' AND estado!='resuelto' AND estado!='cerrado'").get(fiscalId);
      if (ticRow && ticRow.total > 0) {
        puntuacion -= ticRow.total;
        detalleCompleto.push({ factor: 'Tickets abiertos', valor: ticRow.total + ' pendientes', impacto: '-' + ticRow.total + ' punto(s)', color: 'danger' });
      } else {
        detalleCompleto.push({ factor: 'Tickets abiertos', valor: '0 pendientes', impacto: 'neutro', color: 'success' });
      }
    } catch(e) {}

    // 10. Email domain check (DNS MX)
    try {
      var email = cliente ? (cliente.email || '') : '';
      if (!email) { try { var ec = await api.request('GET', '/customer?fiscalId=' + encodeURIComponent(fiscalId)); if (ec && ec.data) email = ec.data.email || ''; } catch(e) {} }
      if (email && email.includes('@')) {
        var domain = email.split('@')[1].toLowerCase();
        var dns = require('dns');
        try {
          await new Promise(function(resolve, reject) { dns.resolveMx(domain, function(err, addresses) { if (err || !addresses || addresses.length === 0) { detalleCompleto.push({ factor: 'Email válido', valor: domain, impacto: 'neutro (dominio sin MX)', color: 'secondary' }); } else { puntuacion += 1; detalleCompleto.push({ factor: 'Email válido', valor: domain, impacto: '+1 punto (dominio existe)', color: 'success' }); } resolve(); }); });
        } catch(e) { detalleCompleto.push({ factor: 'Email válido', valor: domain, impacto: 'neutro', color: 'secondary' }); }
      } else { detalleCompleto.push({ factor: 'Email válido', valor: 'No disponible', impacto: 'neutro', color: 'secondary' }); }
    } catch(e) {}

    // 11. Teléfono formato
    try {
      var tel = cliente ? (cliente.telefono || '') : '';
      if (!tel) { try { var ec2 = await api.request('GET', '/customer?fiscalId=' + encodeURIComponent(fiscalId)); if (ec2 && ec2.data) tel = ec2.data.phone || ''; } catch(e) {} }
      if (tel) {
        var digits = tel.replace(/\D/g, '');
        if (digits.length === 9) { puntuacion += 1; detalleCompleto.push({ factor: 'Teléfono válido', valor: tel, impacto: '+1 punto (9 dígitos)', color: 'success' }); }
        else { detalleCompleto.push({ factor: 'Teléfono válido', valor: tel, impacto: 'neutro (formato extraño)', color: 'secondary' }); }
      } else { detalleCompleto.push({ factor: 'Teléfono válido', valor: 'No disponible', impacto: 'neutro', color: 'secondary' }); }
    } catch(e) {}

    // 12. BOE automatic search (public debts, embargoes)
    try {
      var https = require('https');
      var boeResult = await new Promise(function(resolve) {
        https.get('https://www.boe.es/buscar/boe.php?campo%5B%5D=NIF&dato%5B%5D=' + encodeURIComponent(fiscalId) + '&campo%5B%5D=TIT&operador%5B%5D=and&page_h_t=1&lang=es', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, function(r) {
          var b = '';
          r.on('data', function(c) { b += c; });
          r.on('end', function() {
            var noResults = b.includes('No se han encontrado') || b.includes('0 resultados') || b.includes('sin resultados');
            if (noResults) { detalleCompleto.push({ factor: 'BOE (embargos/deudas)', valor: 'Sin resultados', impacto: 'neutro (limpio)', color: 'success' }); }
            else if (b.includes('resultado')) { puntuacion -= 2; detalleCompleto.push({ factor: 'BOE (embargos/deudas)', valor: 'Con resultados', impacto: '-2 puntos', color: 'danger' }); }
            else { detalleCompleto.push({ factor: 'BOE (embargos/deudas)', valor: 'No se pudo consultar', impacto: 'neutro', color: 'secondary' }); }
            resolve();
          });
          r.on('error', function() { detalleCompleto.push({ factor: 'BOE (embargos/deudas)', valor: 'Error de consulta', impacto: 'neutro', color: 'secondary' }); resolve(); });
        }).on('error', function() { detalleCompleto.push({ factor: 'BOE (embargos/deudas)', valor: 'Error de conexión', impacto: 'neutro', color: 'secondary' }); resolve(); });
      });
    } catch(e) { detalleCompleto.push({ factor: 'BOE (embargos/deudas)', valor: 'Error', impacto: 'neutro', color: 'secondary' }); }

    puntuacion = Math.max(1, Math.min(10, Math.round(puntuacion)));
    if (puntuacion >= 7) riesgo = 'bajo';
    else if (puntuacion >= 4) riesgo = 'medio';
    else riesgo = 'alto';
    var recomendacion = riesgo === 'alto' ? '⚠️ Revisar antes de nueva contratación. Cliente con riesgo alto.' : (riesgo === 'medio' ? '➡️ Cliente estándar. Se recomienda seguimiento periódico.' : '✅ Cliente confiable. Bajo riesgo crediticio.');
    res.json({ ok: true, fiscalId: fiscalId, scoring: puntuacion, risk: riesgo, detalles: detalles, detalleCompleto: detalleCompleto, fiable: riesgo === 'bajo', recomendacion: recomendacion });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Facturas en Drive (nube)
router.get('/:id/drive-invoices', requireAuth, async (req, res) => {
  try {
    var cliente = db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif=?").get(req.params.id);
    var fiscalId = (cliente && (cliente.dni_nif || cliente.likes_customer_id)) || req.params.id;
    if (!drive.isAvailable()) return res.json({ ok: false, error: 'Drive no disponible' });
    var nubeId = await drive.getNubeFolderId();
    if (!nubeId) return res.json({ ok: false, error: 'No se encontró carpeta nube' });
    var years = await drive.listFolderContents(nubeId);
    var result = [];
    for (var y of years) {
      if (!y.isFolder) continue;
      var months = await drive.listFolderContents(y.id);
      for (var m of months) {
        if (!m.isFolder) continue;
        var files = await drive.listFolderContents(m.id);
        var idLower = fiscalId.toLowerCase().replace(/[^0-9a-z]/g, '');
        var matching = files.filter(function(f) {
          if (f.isFolder) return false;
          return f.name.toLowerCase().includes(idLower);
        });
        matching.forEach(function(f) {
          result.push({ fileName: f.name, year: y.name, month: m.name, driveId: f.id, size: f.size, created: f.created, link: f.link || ('https://drive.google.com/file/d/' + f.id + '/view') });
        });
      }
    }
    var grouped = {};
    result.forEach(function(f) {
      var key = f.year + '-' + f.month;
      if (!grouped[key]) grouped[key] = { year: f.year, month: f.month, files: [] };
      grouped[key].files.push(f);
    });
    var keys = Object.keys(grouped).sort().reverse();
    res.json({ ok: true, data: keys.map(function(k) { return grouped[k]; }), total: result.length });
  } catch(e) {
    console.error('[Clientes] drive-invoices error:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// Obtener parte de trabajo de instalación
router.post('/:id/installation/:installId/work-order', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    // Probar múltiples endpoints para encontrar el parte
    var workOrder = null;
    var errors = [];

    // 1) Intentar endpoint dedicado de work-order
    try { workOrder = await api.request('GET', '/installation/' + req.params.installId + '/work-order'); } catch(e) { errors.push('/installation/' + req.params.installId + '/work-order: ' + e.message); }
    if (workOrder) {
      // Buscar URL real en la respuesta (no solo un número OT)
      var woUrl = workOrder.url || workOrder.downloadUrl || workOrder.parteUrl || workOrder.link || workOrder.documentUrl || '';
      if (!woUrl || !woUrl.startsWith('http')) {
        // Escarbar más profundo en busca de http
        (function findUrl(obj) {
          if (!obj || typeof obj !== 'object') return;
          for (var k in obj) {
            var v = obj[k];
            if (v && typeof v === 'string' && v.startsWith('http')) { woUrl = v; return; }
            if (typeof v === 'object') findUrl(v);
          }
        })(workOrder);
      }
      if (woUrl && woUrl.startsWith('http')) return res.json({ ok: true, data: { url: woUrl, parteUrl: woUrl, raw: workOrder } });
      // Si no hay URL pero sí hay datos, devolverlos igual para debug
      return res.json({ ok: true, data: workOrder });
    }

    // 2) Obtener detalle completo de instalación (más fiable)
    try {
      var detail = await api.request('GET', '/installation?installationId=' + encodeURIComponent(req.params.installId));
      if (detail) {
        // Buscar parteUrl en cualquier nivel del objeto
        var allVals = {};
        (function flatten(obj, prefix) {
          if (!obj || typeof obj !== 'object') return;
          for (var k in obj) {
            var v = obj[k];
            var key = prefix ? prefix + '.' + k : k;
            if (v !== null && v !== undefined && typeof v !== 'object') allVals[key] = v;
            else if (typeof v === 'object') flatten(v, key);
          }
        })(detail, '');
        // Buscar cualquier campo que contenga una URL http (el parte real de Kairos365)
        var urlCandidates = Object.keys(allVals).filter(function(k) {
          var v = allVals[k];
          return v && typeof v === 'string' && v.startsWith('http');
        });
        for (var i = 0; i < urlCandidates.length; i++) {
          var v = allVals[urlCandidates[i]];
          if (v && typeof v === 'string' && v.startsWith('http')) {
            return res.json({ ok: true, data: { url: v, parteUrl: v } });
          }
        }
        // También buscar campos con nombres relacionados (parte, pdf, etc.)
        var parteKeys = Object.keys(allVals).filter(function(k) {
          var kl = k.toLowerCase();
          return kl.includes('parte') || kl.includes('workorder') || kl.includes('work_order') || kl.includes('work.order') || kl.includes('pdf') || kl.includes('attachment');
        });
        for (var i = 0; i < parteKeys.length; i++) {
          var v = allVals[parteKeys[i]];
          if (v && typeof v === 'string' && v.startsWith('http')) {
            return res.json({ ok: true, data: { url: v, parteUrl: v } });
          }
        }
        // También buscar en el objeto raw directamente
        var directKeys = ['parteUrl', 'parte_url', 'workOrderUrl', 'workOrderPdf', 'workOrderPdfUrl', 'work_order_pdf', 'documentoUrl', 'attachmentUrl', 'attachment'];
        for (var j = 0; j < directKeys.length; j++) {
          var found = findField(detail, [directKeys[j]]);
          if (found) return res.json({ ok: true, data: { url: found, parteUrl: found } });
        }
      }
    } catch(e) { errors.push(e.message); }

    // 3) Intentar con diferentes IDs (UUID sin guiones, primera parte numérica)
    var idVariants = [req.params.installId, req.params.installId.replace(/-/g, ''), req.params.installId.split('-')[0]];
    for (var k = 0; k < idVariants.length; k++) {
      if (idVariants[k] === req.params.installId) continue;
      try {
        var detail2 = await api.request('GET', '/installation?installationId=' + encodeURIComponent(idVariants[k]));
        if (detail2) {
          var found2 = findField(detail2, directKeys);
          if (found2) return res.json({ ok: true, data: { url: found2, parteUrl: found2 } });
        }
      } catch(e) {}
    }

    // 4) Intentar obtener desde orden del cliente (draft-order)
    try {
      var fiscalId = req.params.id;
      if (fiscalId) {
        var overview = await api.request('GET', '/customer/overview?fiscalId=' + encodeURIComponent(fiscalId) + '&includeOrders=true');
        var ordersData = overview.orders || (overview.data && overview.data.orders) || [];
        if (Array.isArray(ordersData) && ordersData.length > 0) {
          for (var oi = 0; oi < ordersData.length; oi++) {
            var o = ordersData[oi];
            var oId = o.id || o.orderId || (o.data && o.data.id) || '';
            if (oId) {
              try {
                var draftOrder = await api.request('GET', '/draft-order-v2?orderId=' + encodeURIComponent(oId) + '&withDocumentation=true');
                if (draftOrder) {
                  var docs = draftOrder.documentation || draftOrder.documents || [];
                  if (Array.isArray(docs)) {
                    for (var di = 0; di < docs.length; di++) {
                      var dw = docs[di].downloadURL || docs[di].url || '';
                      if (dw && dw.startsWith('http')) {
                        return res.json({ ok: true, data: { url: dw, parteUrl: dw } });
                      }
                    }
                  }
                  // Buscar URL en toda la respuesta
                  var allDocVals = {};
                  (function flattenDoc(obj, prefix) {
                    if (!obj || typeof obj !== 'object') return;
                    for (var k in obj) { var v = obj[k]; var key = prefix ? prefix + '.' + k : k; if (v && typeof v !== 'object') allDocVals[key] = v; else if (typeof v === 'object') flattenDoc(v, key); }
                  })(draftOrder, '');
                  var docUrls = Object.keys(allDocVals).filter(function(k) { var v = allDocVals[k]; return v && typeof v === 'string' && v.startsWith('http') && (k.toLowerCase().includes('parte') || k.toLowerCase().includes('work') || k.toLowerCase().includes('contrato') || k.toLowerCase().includes('pdf')); });
                  for (var ui = 0; ui < docUrls.length; ui++) {
                    return res.json({ ok: true, data: { url: allDocVals[docUrls[ui]], parteUrl: allDocVals[docUrls[ui]] } });
                  }
                }
              } catch(e2) {}
            }
          }
        }
      }
    } catch(e3) { errors.push(e3.message); }

    return res.json({ ok: false, error: 'No se encontró parte de trabajo', errors: errors });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ENDPOINT DEBUG - Muestra datos crudos de la API para un cliente
router.get('/:id/api-debug', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var fiscalId = req.params.id;
    var results = {};

    // 1. Customer overview (datos principales)
    try { results.overview = await api.request('GET', '/customer/overview?fiscalId=' + encodeURIComponent(fiscalId) + '&includeCustomer=true&includeSubscriptions=true&includeOrders=true&includeInvoices=true'); } catch(e) { results.overview_error = e.message; }

    // 2. Subscriptions
    try { results.subscriptions = await api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(fiscalId) + '&brand_id=264'); } catch(e) { results.subscriptions_error = e.message; }

    // 3. Lines
    try { results.lines = await api.request('GET', '/line?fiscalId=' + encodeURIComponent(fiscalId) + '&brand_id=264'); } catch(e) { results.lines_error = e.message; }

    // 4. Orders
    try { results.orders = await api.request('GET', '/orders?brand_id=264'); } catch(e) { results.orders_error = e.message; }

    // 5. Customer docs
    try { results.customerDocs = await api.request('GET', '/customer?fiscalId=' + encodeURIComponent(fiscalId) + '&withDocumentation=true'); } catch(e) { results.customerDocs_error = e.message; }

    // Mostrar estructura (no datos completos) para depuracion
    var debug = {
      fiscalId: fiscalId,
      overview_keys: results.overview ? Object.keys(results.overview).slice(0, 20) : [],
      overview_sample: results.overview ? JSON.stringify(results.overview).substring(0, 500) : null,
      subscriptions_count: Array.isArray(results.subscriptions) ? results.subscriptions.length : (results.subscriptions ? (results.subscriptions.data || results.subscriptions.subscriptions || []).length : 0),
      subscriptions_first: Array.isArray(results.subscriptions) && results.subscriptions.length > 0 ? Object.keys(results.subscriptions[0]).slice(0, 15) : null,
      lines_count: Array.isArray(results.lines) ? results.lines.length : (results.lines ? (results.lines.data || results.lines.lines || []).length : 0),
      lines_first: Array.isArray(results.lines) && results.lines.length > 0 ? Object.keys(results.lines[0]).slice(0, 15) : null,
      orders_count: Array.isArray(results.orders) ? results.orders.length : (results.orders ? (results.orders.data || results.orders.orders || []).length : 0),
      errors: [results.overview_error, results.subscriptions_error, results.lines_error, results.orders_error, results.customerDocs_error].filter(Boolean)
    };
    res.json(debug);
  } catch(e) { res.json({ error: e.message }); }
});

// Obtener resumen de orden (draft order) para mostrar en la ficha cliente
router.get('/:id/order/:orderId/summary', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var orderData = await api.getDraftOrder(req.params.orderId);
    if (!orderData) return res.json({ ok: false, error: 'No se encontró la orden' });
    res.json({ ok: true, data: orderData });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Proxy para descargar archivos KYC desde Drive (evita cross-origin)
router.get('/drive-download', requireAuth, async (req, res) => {
  try {
    var fileId = req.query.fileId;
    if (!fileId) return res.status(400).send('fileId requerido');
    var dApi = require('../helpers/drive').getDrive();
    if (!dApi) return res.status(502).send('Drive no disponible');
    var result = await dApi.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'stream' });
    res.setHeader('Content-Type', result.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="' + (req.query.name || 'documento') + '"');
    result.data.pipe(res);
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// Pagina completa de gestion de linea
router.get('/:id/line/:line/gestion', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var lineNumber = req.params.line;
    var cliente = db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif=?").get(req.params.id);
    var fiscalId = (cliente && (cliente.dni_nif || cliente.likes_customer_id)) || req.params.id;
    res.render('clients/gestion', { title: 'Gestión ' + lineNumber, lineNumber: lineNumber, fiscalId: fiscalId, layout: false });
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// Pagina completa de consumo por linea
router.get('/:id/line/:line/consumo', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var lineNumber = req.params.line;
    var cliente = db.prepare("SELECT * FROM clients WHERE id=?").get(req.params.id);
    if (!cliente) cliente = db.prepare("SELECT * FROM clients WHERE dni_nif=?").get(req.params.id);
    var fiscalId = (cliente && (cliente.dni_nif || cliente.likes_customer_id)) || req.params.id;
    res.render('clients/consumo', { title: 'Consumo ' + lineNumber, lineNumber: lineNumber, fiscalId: fiscalId, layout: false });
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
});

module.exports = router;
