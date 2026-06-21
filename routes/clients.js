const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const router = express.Router();

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

  locales.forEach(l => {
    if (!seenLocalIds.has(l.id)) {
      merged.push({
        origen: 'LOCAL',
        id_local: l.id,
        nombre: l.nombre,
        apellidos: l.apellidos || '',
        email: l.email || '',
        telefono: l.telefono || '',
        dni_nif: l.dni_nif || '',
        direccion: l.direccion || '',
        ciudad: l.ciudad || '',
        tipo: l.tipo_cliente || 'particular',
        estado: '',
        created_at: l.created_at
      });
    }
  });

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
    localCount: locales.length
  });
});

router.get('/nuevo', requireAuth, (req, res) => {
  res.render('clients/create', { title: 'Nuevo Cliente', cliente: {}, errors: [] });
});

router.post('/nuevo', requireAuth, (req, res) => {
  const { nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente } = req.body;
  if (!nombre || !telefono) {
    return res.render('clients/create', { title: 'Nuevo Cliente', cliente: req.body, errors: ['Nombre y teléfono son obligatorios'] });
  }
  const result = db.prepare(`
    INSERT INTO clients (nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente);
  db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('cliente_creado', 'Cliente ' + nombre + ' ' + (apellidos || '') + ' creado', result.lastInsertRowid);
  res.redirect('/clientes');
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
    var statusHistory = [];
    if (Array.isArray(o.statusHistory)) {
      statusHistory = o.statusHistory;
    } else if (Array.isArray(o.status_history)) {
      statusHistory = o.status_history;
    } else if (Array.isArray(o.history)) {
      statusHistory = o.history;
    }
    var estado = (o.status || o.estado || o.state || 'desconocido').toUpperCase();
    var estadoMap = { 'COMPLETED':'Completado','PENDING_PROVIDER':'Pendiente proveedor','PENDING':'Pendiente','PROCESSING':'Procesando','ACTIVE':'Activo','CANCELLED':'Cancelado','CANCELED':'Cancelado','REJECTED':'Rechazado','CREATED':'Creado','DRAFT':'Borrador','ERROR':'Error' };
    var prodName = o.productName || o.product || o.description || o.service || o.tarifa || o.offerName || o.offer_name || o.planName || o.plan_name || '-';
    var lineaNum = o.lineNumber || o.line || o.phone || o.numero || o.msisdn || o.fixedNumber || o.linea || '-';
    return {
      id: o.id || o.orderId || o.order_id,
      idShort: (o.id || o.orderId || o.order_id || '').toString().substring(0, 8) + '...',
      status: estado,
      statusES: estadoMap[estado] || estado,
      productName: prodName,
      lineNumber: lineaNum,
      total: o.total || o.amount || o.price || o.importe || 0,
      created: o.created || o.created_at || o.createdAt || o.date || o.fecha || o.fecha_creacion,
      updated: o.updated || o.updated_at || o.updatedAt || o.modified || o.lastUpdated,
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
      history: histEvents,
      partUrl: findField(i, ['partUrl', 'part_url', 'reportUrl', 'downloadUrl', 'documentUrl']),
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
    apiOrders = mapApiOrders(data.orders);
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

  var allLines = [];
  apiSubscriptions.forEach(function(s) {
    var prods = s.products && s.products.length ? s.products : (s.productName ? [{productName: s.productName, lineNumber: s.lineNumber, status: s.status, icc: s.icc}] : []);
    prods.forEach(function(p) {
      if (p.lineNumber && !allLines.find(function(l) { return l.linea === p.lineNumber; })) {
        allLines.push({ linea: p.lineNumber, producto: p.productName || '', estado: (p.status || '').toLowerCase(), iccid: p.icc || '', pin: '', puk: '', contrato_id: null, fecha_alta: null });
      }
    });
  });
  var linesByStatus = {};
  var lineNumbers = [];
  allLines.forEach(function(l) {
    linesByStatus[l.estado || 'desconocido'] = (linesByStatus[l.estado || 'desconocido'] || 0) + 1;
    if (l.linea && !lineNumbers.includes(l.linea)) lineNumbers.push(l.linea);
  });

  // Obtener documentos KYC de este cliente
  var kycDocs = [];
  try { kycDocs = db.prepare("SELECT d.*, o.datos_cliente FROM altas_kyc_docs d JOIN altas_ordenes o ON d.orden_id=o.id WHERE o.likes_customer_id=? OR o.datos_cliente LIKE ? ORDER BY d.created_at DESC").all(fiscalId, '%' + fiscalId + '%'); } catch(e) {}
  // Intentar obtener documentos desde API
  try {
    var apiDocs = await api.request('GET', '/customer/documents?fiscalId=' + encodeURIComponent(fiscalId));
    if (apiDocs && Array.isArray(apiDocs)) {
      apiDocs.forEach(function(d) {
        if (!kycDocs.some(function(k) { return k.archivo === d.name || k.upload_url === d.url; })) {
          kycDocs.push({ tipo: d.type || d.tipo || 'documento', archivo: d.name || d.fileName || '', upload_url: d.url || d.downloadUrl || '', download_url: d.url || d.downloadUrl || '', estado: 'subido' });
        }
      });
    } else if (apiDocs && apiDocs.data && Array.isArray(apiDocs.data)) {
      apiDocs.data.forEach(function(d) {
        if (!kycDocs.some(function(k) { return k.archivo === d.name; })) {
          kycDocs.push({ tipo: d.type || d.tipo || 'documento', archivo: d.name || d.fileName || '', upload_url: d.url || d.downloadUrl || '', download_url: d.url || d.downloadUrl || '', estado: 'subido' });
        }
      });
    }
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
    cliente: clienteData,
    apiOverview: apiOverview,
    apiCustomer: apiCustomer,
    apiSubscriptions: apiSubscriptions,
    apiOrders: apiOrders,
    apiInvoices: apiInvoices,
    ispFacturas: ispFacturas,
    facturasAgrupadas: facturasAgrupadas,
    apiInstallations: apiInstallations,
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
    lineNumbers: JSON.stringify(lineNumbers),
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
      const data = raw && raw.data ? raw : raw;
      apiOverview = data;
      const cust = data.customer || data;
      apiCustomer = mapApiCustomer(cust);
      apiSubscriptions = mapApiSubscriptions(data.subscriptions);
      apiOrders = mapApiOrders(data.orders);
      apiInvoices = mapApiInvoices(data.invoices);
      apiInstallations = mapApiInstallations(data.installations);
      if (Array.isArray(data.portabilities)) apiPortabilities = data.portabilities;
      if (Array.isArray(data.payments)) apiPayments = data.payments;
    } catch (e) {
      console.error('Error fetching API overview for client:', e.message);
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

  const allLines = [...lineas];
  apiSubscriptions.forEach(s => {
    const prods = s.products && s.products.length ? s.products : (s.productName ? [{
      productName: s.productName,
      lineNumber: s.lineNumber,
      status: s.status,
      icc: s.icc
    }] : []);
    prods.forEach(p => {
      const ln = p.lineNumber || '';
      if (ln && !allLines.find(l => l.linea === ln)) {
        allLines.push({
          linea: ln,
          producto: p.productName || s.productName || '',
          estado: (p.status || s.status || 'activa').toLowerCase(),
          iccid: p.icc || s.icc || '',
          pin: s.pin || '',
          puk: s.puk || '',
          contrato_id: null,
          fecha_alta: s.startDate || s.created || null
        });
      }
    });
  });

  // Intentar obtener PIN/PUK de API para cada linea
  try {
    var api = LikesAPI.getApiInstance();
    for (var li = 0; li < allLines.length; li++) {
      if (allLines[li].linea && (!allLines[li].pin || !allLines[li].puk)) {
        try {
          var lineInfo = await api.getLineInfo(allLines[li].linea);
          if (lineInfo) {
            var info = Array.isArray(lineInfo) ? lineInfo[0] : (lineInfo.data || lineInfo);
            if (info) {
              if (!allLines[li].pin) allLines[li].pin = info.pin || info.pinCode || info.puk1 || '';
              if (!allLines[li].puk) allLines[li].puk = info.puk || info.pukCode || info.puk1 || '';
              if (!allLines[li].iccid) allLines[li].iccid = info.icc || info.iccid || info.iccidNumber || '';
            }
          }
        } catch(e) {}
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
    cliente,
    apiOverview,
    apiCustomer,
    apiSubscriptions,
    apiOrders,
    apiInvoices,
    ispFacturas: ispFacturas2,
    facturasAgrupadas: facturasAgrupadas2,
    apiInstallations,
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
    lineNumbers: JSON.stringify(lineNumbers),
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
    const api = LikesAPI.getApiInstance();
    const result = await api.getLineGB(req.params.lineNumber);
    const payload = result.data || result;
    res.json({ ok: true, data: payload });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
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
    var lineas = JSON.parse(db.prepare('SELECT lineas_pago FROM clients WHERE id=?').get(req.params.id)?.lineas_pago || '{}');
    lineas[req.params.lineNumber] = req.body.metodo_pago;
    db.prepare('UPDATE clients SET lineas_pago=? WHERE id=?').run(JSON.stringify(lineas), req.params.id);
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

// Campo editable (AEAT, scoring, riesgo)
router.post('/:id/campo', requireAuth, (req, res) => {
  try {
    var campo = req.body.campo;
    var valor = req.body.valor;
    var col = campo === 'aeat_status' ? 'aeat_status' : campo === 'scoring' ? 'scoring' : campo === 'riesgo' ? 'riesgo' : campo === 'iban' ? 'iban' : null;
    if (!col) return res.status(400).json({ ok: false, error: 'Campo inválido' });
    db.prepare('UPDATE clients SET ' + col + '=? WHERE id=?').run(valor, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
