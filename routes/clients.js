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
    apiClientes = customers.map(c => ({
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

  res.render('clients/list', {
    title: 'Clientes',
    clientes: filtered,
    search,
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
    aeatStatus: customerData.aeatStatus || customerData.aeat_status || customerData.aeatValidation || '',
    scoring: customerData.scoring || customerData.score || customerData.rating || '',
    riskLevel: customerData.riskLevel || customerData.risk_level || customerData.risk || '',
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
    return {
      id: o.id || o.orderId || o.order_id,
      status: o.status || o.estado || o.state || 'desconocido',
      productName: o.productName || o.product || o.description || o.service || o.tarifa || '-',
      lineNumber: o.lineNumber || o.line || o.phone || o.numero || o.msisdn || '-',
      total: parseFloat(o.total || o.amount || o.price || o.importe || 0),
      created: o.created || o.created_at || o.createdAt || o.date || o.fecha || o.fecha_creacion,
      updated: o.updated || o.updated_at || o.updatedAt || o.modified || o.lastUpdated,
      statusHistory: statusHistory,
      type: o.type || o.tipo || o.order_type || 'general',
      customerName: o.customer_name || o.customerName || (o.customer && o.customer.name) || o.client_name || ''
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

function extractDocsFromRaw(data) {
  var arr = [];
  if (Array.isArray(data.documents)) arr = data.documents;
  else if (Array.isArray(data.files)) arr = data.files;
  else if (Array.isArray(data.attachments)) arr = data.attachments;
  return arr.map(function(d) {
    return {
      name: d.name || d.fileName || d.filename || d.originalName || 'Documento',
      url: d.url || d.downloadUrl || d.fileUrl || d.path || '',
      type: d.type || d.mimeType || d.contentType || d.fileType || 'application/octet-stream'
    };
  });
}

function mapApiInstallations(instArr) {
  if (!Array.isArray(instArr)) return [];
  return instArr.map(function(i) {
    return {
      id: i.id || i.installationId || i.installation_id || '',
      address: i.address || i.direccion || (i.address?.street || '') + (i.address?.cityName || i.address?.city ? ', ' + (i.address?.cityName || i.address?.city) : ''),
      city: i.city || i.ciudad || i.address?.cityName || i.address?.city || '',
      productName: i.productName || i.product || i.service || '-',
      status: i.status || i.estado || 'desconocido',
      scheduledDate: i.scheduledDate || i.scheduled_date || i.fecha_programada || i.date || i.plannedDate || '',
      completedDate: i.completedDate || i.completed_date || i.fecha_real || i.installationDate || i.actualDate || '',
      notes: i.notes || i.notas || i.comments || '',
      technician: i.technician || i.tecnico || '',
      addressDetail: i.addressDetail || i.detalle_direccion || i.address,
      documents: extractDocsFromRaw(i)
    };
  });
}

async function enrichInstallationsWithDocuments(installations) {
  if (!installations || !installations.length) return installations;
  var needsEnrich = installations.filter(function(inst) {
    return !inst.documents || inst.documents.length === 0;
  });
  if (needsEnrich.length === 0) return installations;
  var api = LikesAPI.getApiInstance();
  await Promise.allSettled(needsEnrich.map(function(inst) {
    return api.getInstallationDetail(inst.id).then(function(detail) {
      if (!detail) return;
      var rawData = detail && detail.data ? detail.data : (detail || {});
      var docs = extractDocsFromRaw(rawData);
      if (docs.length > 0) inst.documents = docs;
    }).catch(function() {});
  }));
  return installations;
}

async function fetchContractDocsForOrders(apiOrders) {
  if (!Array.isArray(apiOrders) || !apiOrders.length) return [];
  var contracts = [];
  var api = LikesAPI.getApiInstance();
  var orderIds = apiOrders.filter(function(o) { return o.likes_order_id; }).map(function(o) { return o.likes_order_id; });
  await Promise.allSettled(orderIds.map(function(oid) {
    return api.getDraftOrder(oid).then(function(detail) {
      if (!detail) return;
      var raw = detail && detail.data ? detail.data : (detail || {});
      var docs = extractDocsFromRaw(raw);
      docs.forEach(function(d) {
        contracts.push({ orderId: oid, name: d.name || ('Contrato #' + oid), url: d.url || d.downloadUrl || '', type: d.type || 'application/pdf' });
      });
    }).catch(function() {});
  }));
  return contracts;
}

router.get('/fiscal/:fiscalId', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const raw = await api.request('GET', '/customer/overview?fiscalId=' + encodeURIComponent(req.params.fiscalId) + '&includeCustomer=true&includeSubscriptions=true&includeOrders=true&includeInstallations=true&includeInvoices=true&includePayments=true');
    const data = raw && raw.data ? raw.data : raw;
    const cust = data.customer || data;
    const apiCustomer = mapApiCustomer(cust);
    const fiscalId = req.params.fiscalId;

    res.render('clients/view', {
      title: 'Cliente: ' + (apiCustomer.name || fiscalId),
      cliente: {
        id: null,
        nombre: apiCustomer.name || apiCustomer.firstName || '',
        apellidos: apiCustomer.lastName || apiCustomer.surname || '',
        dni_nif: fiscalId,
        telefono: apiCustomer.phone || '',
        telefono2: '',
        email: apiCustomer.email || '',
        direccion: apiCustomer.billingAddress?.street || '',
        ciudad: apiCustomer.billingAddress?.cityName || '',
        provincia: '',
        codigo_postal: apiCustomer.billingAddress?.zipCode || '',
        created_at: apiCustomer.created || '',
        likes_customer_id: fiscalId,
        notas: '',
        metodo_pago: apiCustomer.paymentMethod || '',
        iban: apiCustomer.iban || '',
        tipo_cliente: apiCustomer.customerType || 'particular',
        stripe_payment_method: ''
      },
      contratos: [],
      suscripciones: mapApiSubscriptions(data.subscriptions),
      tickets: [],
      linesByStatus: JSON.stringify({}),
      lineNumbers: JSON.stringify([]),
      apiActions: { canBlock: true, canChangeTariff: true, canDuplicateSim: true, canViewConsumption: true },
      apiCustomer: apiCustomer,
      apiSubscriptions: mapApiSubscriptions(data.subscriptions),
      apiOrders: mapApiOrders(data.orders),
      apiInvoices: mapApiInvoices(data.invoices),
      apiInstallations: await enrichInstallationsWithDocuments(mapApiInstallations(data.installations)),
      apiContractDocs: await fetchContractDocsForOrders(data.orders),
      apiPortabilities: Array.isArray(data.portabilities) ? data.portabilities : [],
      apiPayments: Array.isArray(data.payments) ? data.payments : [],
      altasOrdenes: [],
      kycDocsPorOrden: {},
      documentos: []
    });
  } catch(e) {
    console.error('[Clientes] Error fetching API client:', e.message);
    if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
      res.status(504).send('La API de Likes Telecom tardó demasiado en responder. Inténtalo de nuevo más tarde.');
    } else {
      res.render('clients/view', {
        title: 'Cliente: ' + req.params.fiscalId,
        cliente: { id: null, nombre: req.params.fiscalId, apellidos: '', dni_nif: req.params.fiscalId, telefono: '', telefono2: '', email: '', direccion: '', ciudad: '', provincia: '', codigo_postal: '', created_at: '', likes_customer_id: '', notas: '', metodo_pago: '', iban: '', tipo_cliente: 'particular', stripe_payment_method: '' },
        contratos: [], suscripciones: [], tickets: [], linesByStatus: '{}', lineNumbers: '[]',
        apiActions: { canBlock: true, canChangeTariff: true, canDuplicateSim: true, canViewConsumption: true },
        apiCustomer: {}, apiSubscriptions: [], apiOrders: [], apiInvoices: [], apiInstallations: [], apiPortabilities: [], apiPayments: [],
        altasOrdenes: [], kycDocsPorOrden: {}, documentos: [], apiContractDocs: [],
        apiError: 'No se pudieron cargar datos de API Likes: ' + e.message
      });
    }
  }
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
      apiInstallations = await enrichInstallationsWithDocuments(mapApiInstallations(data.installations));
      if (Array.isArray(data.portabilities)) apiPortabilities = data.portabilities;
      if (Array.isArray(data.payments)) apiPayments = data.payments;
    } catch (e) {
      console.error('Error fetching API overview for client:', e.message);
    }
  }

  const apiContractDocs = await fetchContractDocsForOrders(apiOrders);
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

  res.render('clients/view', {
    title: 'Cliente: ' + customerName,
    cliente,
    apiOverview,
    apiCustomer,
    apiSubscriptions,
    apiOrders,
    apiInvoices,
    apiInstallations,
    apiPortabilities,
    apiPayments,
    apiContractDocs,
    contratos,
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
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.redirect('/clientes');
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
    const [gbResult, cdrsRaw] = await Promise.all([
      api.getLineGB(req.params.lineNumber),
      api.getLineCDRs(req.params.lineNumber).catch(() => null)
    ]);
    const gb = gbResult.data || gbResult;

    let monthly = [];
    if (cdrsRaw) {
      let cdrs = Array.isArray(cdrsRaw) ? cdrsRaw : (cdrsRaw.data || cdrsRaw.cdrs || cdrsRaw.records || cdrsRaw.items || cdrsRaw.calls || []);
      if (!Array.isArray(cdrs)) cdrs = [];

      const now = new Date();
      const monthMap = {};

      cdrs.forEach(cdr => {
        const dateStr = cdr.fecha || cdr.date || cdr.period || cdr.startDate || cdr.start_date || '';
        if (!dateStr) return;
        const month = dateStr.substring(0, 7);
        if (month < '2025-01') return;

        const tipo = (cdr.tipo || cdr.type || cdr.callType || '').toLowerCase();
        const concepto = (cdr.concepto || cdr.concept || cdr.description || '').toLowerCase();
        const isData = tipo === 'exceso' || tipo === 'data' || tipo === 'datos' || tipo === 'gb' ||
          concepto.includes('gb') || concepto.includes('datos') || concepto.includes('data') ||
          concepto.includes('exceso');

        const unidades = parseFloat(cdr.unidades || cdr.volume || cdr.gbUsed || cdr.gb || 0);
        if (!isData || !unidades || unidades <= 0) return;

        monthMap[month] = (monthMap[month] || 0) + unidades;
      });

      const totalGB = parseFloat(gb.totalGB || gb.total_gb || gb.total || gb.totalGb || gb.allowance || 0);

      monthly = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, gbUsados]) => ({
          mes,
          gbUsados: Math.round(gbUsados * 100) / 100,
          gbTotales: totalGB
        }));
    }

    res.json({
      ok: true,
      data: {
        gb: {
          totalGB: parseFloat(gb.totalGB || gb.total_gb || gb.total || gb.totalGb || gb.allowance || 0),
          usedGB: parseFloat(gb.usedGB || gb.used_gb || gb.used || gb.consumed || gb.consumption || gb.usage || 0),
          remainingGB: parseFloat(gb.remainingGB || gb.remaining_gb || gb.remaining || gb.remainingGb || gb.balance || gb.left || 0),
          roamingGB: parseFloat(gb.roamingGB || gb.roaming_gb || gb.roaming || gb.roaming_used || 0)
        },
        monthly
      }
    });
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

module.exports = router;
