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

// ---------- Helpers de mapeo (simplificados) ----------
function mapCustomer(c) {
  if (!c || typeof c !== 'object') return {};
  return {
    name: c.name || '',
    firstName: c.firstName || c.first_name || '',
    lastName: c.lastName || c.last_name || c.surname || '',
    fiscalId: c.fiscalId || c.fiscal_id || c.fiscalNumber || '',
    email: c.email || (c.contactInfo && c.contactInfo.email) || '',
    phone: c.phone || c.contactPhone || (c.contactInfo && c.contactInfo.phone) || '',
    customerType: c.customerType || c.customer_type || 'Residential',
    created: c.created || c.created_at || c.createdAt || '',
    status: c.status || 'CREATED',
    aeatStatus: c.aeatStatus || c.aeat_status || c.aeatValidation || c.aeat || '',
    scoring: c.scoring || c.score || c.rating || c.creditScore || '',
    riskLevel: c.riskLevel || c.risk_level || c.risk || '',
    paymentMethod: c.paymentMethod || c.payment_method || (c.paymentInfo && c.paymentInfo.method) || '',
    iban: c.iban || c.bankAccount || (c.paymentInfo && c.paymentInfo.iban) || '',
    billingAddress: c.billingAddress || c.address || {},
    contactInfo: c.contactInfo || {},
    paymentInfo: c.paymentInfo || {}
  };
}

function mapSubs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function(s) {
    return {
      id: s.id || s.subscriptionId || '',
      productName: s.productName || s.product || s.tarifa || '-',
      lineNumber: s.lineNumber || s.line || s.phone || s.msisdn || s.fixedNumber || '',
      status: s.status || s.estado || 'activa',
      startDate: s.startDate || s.start_date || s.created || s.fecha_alta || '',
      endDate: s.endDate || s.end_date || '',
      icc: s.icc || s.iccid || '',
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

function mapOrders(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function(o) {
    var st = (o.status || o.estado || 'desconocido').toUpperCase();
    var stMap = { COMPLETED:'Completado', PENDING_PROVIDER:'Pendiente proveedor', PENDING:'Pendiente', PROCESSING:'Procesando', ACTIVE:'Activo', CANCELLED:'Cancelado', REJECTED:'Rechazado', CREATED:'Creado', DRAFT:'Borrador', ERROR:'Error' };
    return {
      id: o.id || o.orderId || '',
      status: st,
      statusES: stMap[st] || st,
      productName: o.productName || o.product || o.tarifa || '-',
      lineNumber: o.lineNumber || o.line || o.phone || o.fixedNumber || '-',
      total: o.total || o.amount || o.price || 0,
      created: o.created || o.created_at || o.createdAt || o.date || '',
      statusHistory: Array.isArray(o.statusHistory) ? o.statusHistory : (Array.isArray(o.history) ? o.history : [])
    };
  });
}

function mapOrdersDetail(detail) {
  if (!detail || typeof detail !== 'object') return {};
  var data = detail.data || detail;
  return {
    id: data.id || data.orderId || '',
    productName: data.productName || data.product || data.tarifa || '-',
    lineNumber: data.lineNumber || data.line || data.fixedNumber || '-',
    total: data.total || data.amount || data.price || 0,
    created: data.created || data.created_at || data.createdAt || '',
    status: (data.status || data.estado || 'desconocido').toUpperCase(),
    shippingAddress: data.shippingAddress || data.address || '',
    shippingMethod: data.shippingMethod || data.shipping || '',
    paymentMethod: data.paymentMethod || data.payment || '',
    contractUrl: data.contractUrl || data.signedContractUrl || '',
    items: Array.isArray(data.items) ? data.items : (Array.isArray(data.lines) ? data.lines : []),
    notes: data.notes || data.comments || '',
    ict: data.ict || '',
    icc: data.icc || data.iccid || '',
    technician: data.technician || data.tecnico || '',
    scheduledDate: data.scheduledDate || data.scheduled_date || '',
    completedDate: data.completedDate || data.completed_date || ''
  };
}

function mapInvoices(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function(f) {
    var fees = [];
    (f.fees || f.lines || f.items || []).forEach(function(fee) {
      fees.push({
        productName: fee.productName || fee.name || fee.concept || '-',
        price: parseFloat(fee.price || fee.amount || 0),
        lineNumber: fee.lineNumber || fee.line || ''
      });
    });
    return {
      id: f.id || f.invoiceId || '',
      number: f.number || f.invoiceNumber || '',
      period: f.period || f.periodo || f.billingPeriod || '',
      concept: f.concept || f.concepto || f.description || 'Factura',
      amount: parseFloat(f.amount || f.importe || f.total || 0),
      issuedDate: f.issuedDate || f.issued_date || f.fecha_emision || f.date || '',
      dueDate: f.dueDate || f.due_date || f.fecha_vencimiento || '',
      status: f.status || f.estado || 'pending',
      fees: fees,
      currency: f.currency || 'EUR'
    };
  });
}

function mapInstallations(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function(i) {
    function find(o, keys) {
      if (!o || typeof o !== 'object') return '';
      var objKeys = Object.keys(o);
      for (var k of keys) {
        var found = objKeys.find(function(ak) { return ak.toLowerCase().includes(k.toLowerCase()); });
        if (found && o[found] !== null && o[found] !== undefined && o[found] !== '') return String(o[found]);
      }
      return '';
    }
    return {
      id: i.id || i.installationId || '',
      address: find(i, ['direccion','address','street','calle','installationAddress']),
      city: find(i, ['city','ciudad','cityName','poblacion']),
      productName: find(i, ['producto','product','productName','tarifa']) || '-',
      status: find(i, ['estado','status','state']) || 'desconocido',
      scheduledDate: find(i, ['scheduledDate','scheduled_date','fecha_programada','plannedDate']),
      completedDate: find(i, ['completedDate','completed_date','fecha_real','installationDate','endDate']),
      technician: find(i, ['tecnico','technician','instalador','installer']),
      ot: find(i, ['ot','orderId','workOrder','orden_trabajo']),
      router: find(i, ['router','routerModel','equipo']),
      ont: find(i, ['ont','ontModel']),
      cto: find(i, ['cto','ctoId']),
      contrata: find(i, ['contrata','contract','contratista','proveedor']),
      parteUrl: find(i, ['parteUrl','parte_url','workOrderUrl','workOrderPdf','workOrderPdfUrl','work_order_pdf','documentoUrl','attachmentUrl','attachment']),
      notes: find(i, ['notas','notes','observaciones','comments']),
      history: i.timeline || i.history || i.events || i.statusHistory || []
    };
  });
}

// ---------- Listado de clientes ----------
router.get('/', requireAuth, async (req, res) => {
  var search = (req.query.search || '').trim();
  var page = Math.max(1, parseInt(req.query.page) || 1);
  var limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));

  var apiClientes = [];
  try {
    var api = LikesAPI.getApiInstance();
    var customers = await api.getCustomers();
    apiClientes = (customers || []).map(function(c) {
      return {
        origen: 'API',
        id: c.id || '',
        nombre: c.name || c.firstName || '',
        apellidos: c.lastName || c.surname || '',
        email: c.email || (c.contactInfo && c.contactInfo.email) || '',
        telefono: c.phone || (c.contactInfo && c.contactInfo.phone) || '',
        dni_nif: c.fiscalId || c.fiscalNumber || c.fiscal_id || '',
        direccion: ((c.billingAddress && c.billingAddress.street) || '') + ' ' + ((c.billingAddress && (c.billingAddress.cityName || c.billingAddress.city)) || ''),
        tipo: c.customerType || 'Residential',
        estado: c.status || 'CREATED',
        created_at: c.created || null
      };
    });
  } catch(e) {
    console.error('[CM] API customers error:', e.message);
  }

  // Filtrar por búsqueda
  var q = search.toLowerCase();
  if (q) {
    apiClientes = apiClientes.filter(function(c) {
      return (c.nombre + ' ' + c.apellidos).toLowerCase().includes(q)
        || c.dni_nif.toLowerCase().includes(q)
        || c.telefono.includes(q)
        || c.email.toLowerCase().includes(q);
    });
  }

  // Ordenar por fecha descendente
  apiClientes.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });

  var total = apiClientes.length;
  var totalPages = Math.ceil(total / limit);
  var offset = (page - 1) * limit;
  var clientes = apiClientes.slice(offset, offset + limit);

  res.render('clientes-movilbro/list', {
    title: 'Clientes Movilbro',
    clientes: clientes,
    search: search,
    page: page,
    limit: limit,
    total: total,
    totalPages: totalPages
  });
});

// ---------- Detalle 360° ----------
router.get('/:fiscalId', requireAuth, async (req, res) => {
  var fiscalId = req.params.fiscalId;
  var api = LikesAPI.getApiInstance();

  var overview = {};
  var customer = {};
  var subscriptions = [];
  var orders = [];
  var invoices = [];
  var installations = [];
  var portabilities = [];
  var payments = [];
  var kycDocs = [];
  var contratosS3 = [];

  try {
    var raw = await api.getCustomerOverview(fiscalId);
    var data = raw && raw.data ? raw.data : raw;
    overview = data;
    customer = mapCustomer(data.customer || data);
    subscriptions = mapSubs(data.subscriptions);
    var subscriptionsAll = subscriptions.slice();
    // Solo activas
    subscriptions = subscriptions.filter(function(s) {
      var st = (s.status || '').toLowerCase();
      return st === 'active' || st === 'activa';
    });
    orders = mapOrders(data.orders);
    // Enrich orders with detail from draft order API
    try {
      var ordersEnhanced = [];
      for (var oi = 0; oi < orders.length; oi++) {
        var o = orders[oi];
        if (o.id) {
          try {
            var detail = await api.getDraftOrder(o.id);
            if (detail && detail.data) {
              o = Object.assign(o, mapOrdersDetail(detail));
            }
          } catch(e) {}
        }
        ordersEnhanced.push(o);
      }
      orders = ordersEnhanced;
    } catch(e) {}
    invoices = mapInvoices(data.invoices);
    installations = mapInstallations(data.installations);
    if (Array.isArray(data.portabilities)) portabilities = data.portabilities;
    if (Array.isArray(data.payments)) payments = data.payments;

    // KYC docs from overview customer.documentation
    var custDocs = data.customer && Array.isArray(data.customer.documentation) ? data.customer.documentation : [];
    custDocs.forEach(function(d) {
      var docUrl = d.path ? 'https://prod-likes-customer-documents.s3.eu-central-1.amazonaws.com/' + d.path : '';
      kycDocs.push({
        tipo: d.type || d.tipo || d.documentType || 'documento',
        archivo: d.path || d.name || '',
        url: d.downloadURL || docUrl,
        uploadURL: d.uploadURL || '',
        documentType: d.type || d.tipo || d.documentType || ''
      });
    });
    // Contratos S3 desde órdenes completadas (y contratos firmados del customer.documentation)
    if (data.customer && Array.isArray(data.customer.documents)) {
      data.customer.documents.forEach(function(d) {
        if (d.type === 'signedContract' || d.type === 'contrato' || (d.name && d.name.toLowerCase().includes('contract'))) {
          contratosS3.push({ orderId: d.orderId || d.id || '—', url: d.downloadURL || d.url || '', uploadURL: d.uploadURL || '' });
        }
      });
    }
    orders.forEach(function(o) {
      if (o.status === 'COMPLETED' && o.id && !contratosS3.find(function(c) { return c.orderId === o.id; })) {
        contratosS3.push({ orderId: o.id, url: 'https://prod-likes-customer-documents.s3.eu-central-1.amazonaws.com/264/' + o.id + '/signedContract.pdf', uploadURL: '' });
      }
    });
  } catch(e) {
    console.error('[CM] Overview error:', e.message);
  }

  // Cargar facturas ISP locales
  var ispFacturas = [];
  try { ispFacturas = db.prepare("SELECT * FROM isp_facturas WHERE fiscal_id=? ORDER BY periodo DESC, id DESC").all(fiscalId); } catch(e) {}
  var facturasAgrupadas = {};
  ispFacturas.forEach(function(f) {
    var p = f.periodo || 'desconocido';
    if (!facturasAgrupadas[p]) facturasAgrupadas[p] = [];
    facturasAgrupadas[p].push(f);
  });

  // Construir lista de líneas unificada
  var allLines = [];
  subscriptions.forEach(function(s) {
    var prods = s.products && s.products.length ? s.products : (s.productName ? [{ productName: s.productName, lineNumber: s.lineNumber, status: s.status, icc: s.icc, pin: s.pin, puk: s.puk }] : []);
    prods.forEach(function(p) {
      if (p.lineNumber && !allLines.find(function(l) { return l.linea === p.lineNumber; })) {
        allLines.push({
          linea: p.lineNumber,
          producto: p.productName || '',
          estado: (p.status || '').toLowerCase(),
          iccid: p.icc || '',
          pin: p.pin || '',
          puk: p.puk || '',
          subscriptionId: s.id || ''
        });
      }
    });
  });

  // Build full lines (including terminated/suspended) for terminated view
  var allLinesFull = [];
  if (typeof subscriptionsAll !== 'undefined' && subscriptionsAll.length > 0) {
    subscriptionsAll.forEach(function(s) {
      var prods = s.products && s.products.length ? s.products : (s.productName ? [{ productName: s.productName, lineNumber: s.lineNumber, status: s.status, icc: s.icc, pin: s.pin, puk: s.puk }] : []);
      prods.forEach(function(p) {
        if (p.lineNumber && !allLinesFull.find(function(l) { return l.linea === p.lineNumber; })) {
          allLinesFull.push({
            linea: p.lineNumber,
            producto: p.productName || '',
            estado: (p.status || '').toLowerCase(),
            iccid: p.icc || '',
            pin: p.pin || '',
            puk: p.puk || '',
            subscriptionId: s.id || ''
          });
        }
      });
    });
  } else {
    allLinesFull = allLines.slice();
  }

  // PIN/PUK + GB + info para cada línea (auto-carga)
  var allLinesData = {};
  for (var li = 0; li < allLines.length; li++) {
    var linea = allLines[li].linea;
    if (!linea) continue;
    var lineData = { gb: null, pinpuk: null, lineInfo: null, svas: [] };
    // PIN/PUK
    if (!allLines[li].pin || !allLines[li].puk) {
      try {
        var pinpukResp = await api.getLinePINPUK(linea);
        if (pinpukResp) {
          var ppd = pinpukResp.data || pinpukResp;
          if (Array.isArray(ppd)) ppd = ppd[0];
          if (ppd) {
            if (!allLines[li].pin) allLines[li].pin = ppd.pin || ppd.pinCode || '';
            if (!allLines[li].puk) allLines[li].puk = ppd.puk || ppd.pukCode || '';
            if (!allLines[li].iccid) allLines[li].iccid = ppd.icc || ppd.iccid || '';
            lineData.pinpuk = ppd;
          }
        }
      } catch(e) {
        try {
          var lineInfo = await api.getLineInfo(linea);
          if (lineInfo) {
            var liData = Array.isArray(lineInfo) ? lineInfo[0] : (lineInfo.data || lineInfo);
            if (!allLines[li].pin) allLines[li].pin = liData.pin || '';
            if (!allLines[li].puk) allLines[li].puk = liData.puk || '';
            if (!allLines[li].iccid) allLines[li].iccid = liData.icc || liData.iccid || '';
            lineData.lineInfo = liData;
          }
        } catch(e2) {}
      }
    }
    // GB
    try {
      var gbRaw = await api.getLineGB(linea);
      lineData.gb = gbRaw && gbRaw.data ? gbRaw.data : gbRaw;
    } catch(e) {}
    // SVAs
    try {
      var svasRaw = await api.getLineSVAs(linea);
      lineData.svas = Array.isArray(svasRaw) ? svasRaw : (svasRaw && svasRaw.data ? svasRaw.data : []);
    } catch(e) {}
    allLinesData[linea] = lineData;
  }

  var linesByStatus = {};
  var lineNumbers = [];
  allLines.forEach(function(l) {
    var st = l.estado || 'desconocido';
    linesByStatus[st] = (linesByStatus[st] || 0) + 1;
    if (l.linea && !lineNumbers.includes(l.linea)) lineNumbers.push(l.linea);
  });

  res.render('clientes-movilbro/detail', {
    title: customer.name || customer.firstName || fiscalId + ' — Movilbro',
    fiscalId: fiscalId,
    customer: customer,
    overview: overview,
    subscriptions: subscriptions,
    allLines: allLines,
    linesByStatus: JSON.stringify(linesByStatus),
    lineNumbers: lineNumbers,
    orders: orders,
    invoices: invoices,
    installations: installations,
    portabilities: portabilities,
    payments: payments,
    kycDocs: kycDocs,
    contratosS3: contratosS3,
    ispFacturas: ispFacturas,
    facturasAgrupadas: facturasAgrupadas,
    allLinesData: allLinesData,
    allLinesFull: allLinesFull,
    allSubsFull: subscriptionsAll
  });
});

// ---------- API endpoints AJAX ----------

// Consumo GB por línea
router.post('/:fiscalId/line/:line/consumption', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var gb = await api.getLineGB(req.params.line);
    res.json({ ok: true, data: gb && gb.data ? gb.data : gb });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// CDRs de línea
router.post('/:fiscalId/line/:line/cdrs', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var cdrs = await api.getLineCDRs(req.params.line);
    res.json({ ok: true, data: Array.isArray(cdrs) ? cdrs : (cdrs && cdrs.data ? cdrs.data : []) });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// PIN/PUK de línea con múltiples fallbacks
router.post('/:fiscalId/line/:line/pinpuk', requireAuth, async (req, res) => {
  var api = LikesAPI.getApiInstance();
  var lineNum = req.params.line;
  // Fallback 1: getLinePINPUK directo
  try {
    var pp = await api.getLinePINPUK(lineNum);
    if (pp) {
      var ppd = pp.data || pp;
      if (Array.isArray(ppd)) ppd = ppd[0];
      if (ppd && (ppd.pin || ppd.puk || ppd.pinCode || ppd.pukCode)) {
        return res.json({ ok: true, data: ppd });
      }
    }
  } catch(e) {}
  // Fallback 2: getLineInfo
  try {
    var li = await api.getLineInfo(lineNum);
    if (li) {
      var lid = li.data || li;
      if (Array.isArray(lid)) lid = lid[0];
      if (lid && (lid.pin || lid.puk)) {
        return res.json({ ok: true, data: lid });
      }
    }
  } catch(e2) {}
  // Fallback 3: direct request /line/sim
  try {
    var sim = await api.request('GET', '/line/sim?lineNumber=' + encodeURIComponent(lineNum));
    if (sim) {
      var simd = sim.data || sim;
      if (Array.isArray(simd)) simd = simd[0];
      if (simd && (simd.pin || simd.puk || simd.pinCode || simd.pukCode)) {
        return res.json({ ok: true, data: simd });
      }
    }
  } catch(e3) {}
  // Fallback 4: getLineInfo with withSims=true
  try {
    var inf2 = await api.request('GET', '/line?lineNumber=' + encodeURIComponent(lineNum) + '&withSims=true');
    if (inf2) {
      var i2d = inf2.data || inf2;
      if (Array.isArray(i2d)) i2d = i2d[0];
      if (i2d && (i2d.pin || i2d.puk)) {
        return res.json({ ok: true, data: i2d });
      }
    }
  } catch(e4) {}
  res.json({ ok: false, error: 'No se pudo obtener PIN/PUK tras 4 intentos' });
});

// Generar nuevo PIN/PUK
router.post('/:fiscalId/line/:line/generate-pinpuk', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.request('POST', '/line/generatePinPuk', { lineNumber: req.params.line });
    res.json({ ok: true, data: result && result.data ? result.data : result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Info detallada de línea (con múltiples fuentes de fallback)
router.post('/:fiscalId/line/:line/info', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var results = {};
    var lineNumber = req.params.line;
    // PIN/PUK de 3 fuentes distintas
    var pinFrom = null, pukFrom = null;
    try {
      var pinpuk = await api.getLinePINPUK(lineNumber);
      var pp = pinpuk && pinpuk.data ? pinpuk.data : pinpuk;
      if (Array.isArray(pp)) pp = pp[0]||{};
      results.pinpuk = pp;
      if (pp.pin||pp.pinCode) pinFrom = 'pinpuk';
      if (pp.puk||pp.pukCode) pukFrom = 'pinpuk';
    } catch(e) {}
    // Info general (incluye PIN/PUK si los tiene)
    try {
      var info = await api.getLineInfo(lineNumber);
      var li = Array.isArray(info) ? info[0] : (info && info.data ? info.data : info);
      results.lineInfo = li;
      if (!pinFrom && (li.pin)) { if (!results.pinpuk) results.pinpuk = {}; results.pinpuk.pin = li.pin; pinFrom = 'lineInfo'; }
      if (!pukFrom && (li.puk)) { if (!results.pinpuk) results.pinpuk = {}; results.pinpuk.puk = li.puk; pukFrom = 'lineInfo'; }
      if ((!pinFrom||!pukFrom) && li.products && Array.isArray(li.products)) {
        li.products.forEach(function(p) {
          if (!pinFrom && p.pin) { if (!results.pinpuk) results.pinpuk = {}; results.pinpuk.pin = p.pin; pinFrom = 'products'; }
          if (!pukFrom && p.puk) { if (!results.pinpuk) results.pinpuk = {}; results.pinpuk.puk = p.puk; pukFrom = 'products'; }
        });
      }
    } catch(e) {}
    // SIM info (tercera fuente)
    try {
      var simInfo = await api.request('GET', '/line/sim?lineNumber=' + encodeURIComponent(lineNumber));
      var sim = simInfo && simInfo.data ? simInfo.data : simInfo;
      if (Array.isArray(sim)) sim = sim[0]||{};
      results.sim = sim;
      if (!pinFrom && (sim.pin)) { if (!results.pinpuk) results.pinpuk = {}; results.pinpuk.pin = sim.pin; pinFrom = 'sim'; }
      if (!pukFrom && (sim.puk)) { if (!results.pinpuk) results.pinpuk = {}; results.pinpuk.puk = sim.puk; pukFrom = 'sim'; }
    } catch(e) {}
    // GB
    try {
      var gb = await api.getLineGB(lineNumber);
      results.gb = gb && gb.data ? gb.data : gb;
    } catch(e) {}
    // SVAs
    try {
      var svas = await api.getLineSVAs(lineNumber);
      results.svas = Array.isArray(svas) ? svas : (svas && svas.data ? svas.data : []);
    } catch(e) {}
    res.json({ ok: true, data: results });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Full consumption: GB + CDRs + PINPUK + Info + SVAs + SIM en una llamada
router.post('/:fiscalId/line/:line/full-consumption', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var lineNumber = req.params.line;
    var results = { gb: null, pinpuk: null, lineInfo: null, svas: [], cdrs: [], sim: null };
    try { var gb = await api.getLineGB(lineNumber); results.gb = gb && gb.data ? gb.data : gb; } catch(e) {}
    try { var cdrs = await api.getLineCDRs(lineNumber); results.cdrs = Array.isArray(cdrs) ? cdrs : (cdrs && cdrs.data ? cdrs.data : []); } catch(e) {}
    try { var pinpuk = await api.getLinePINPUK(lineNumber); results.pinpuk = pinpuk && pinpuk.data ? pinpuk.data : pinpuk; } catch(e) {}
    try { var info = await api.getLineInfo(lineNumber); results.lineInfo = Array.isArray(info) ? info[0] : (info && info.data ? info.data : info); } catch(e) {}
    try { var svas = await api.getLineSVAs(lineNumber); results.svas = Array.isArray(svas) ? svas : (svas && svas.data ? svas.data : []); } catch(e) {}
    try { var sim = await api.request('GET', '/line/sim?lineNumber=' + encodeURIComponent(lineNumber)); results.sim = sim && sim.data ? sim.data : sim; } catch(e) {}
    res.json({ ok: true, data: results });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// SVAs (roaming, etc.)
router.post('/:fiscalId/line/:line/svas', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.updateLineSVAs(req.params.line, req.body);
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Bloquear/desbloquear línea
router.post('/:fiscalId/line/:line/block', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var blocked = req.body.blocked === true || req.body.blocked === 'true';
    var result = await api.blockLine(req.params.line, blocked);
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Cambiar tarifa
router.post('/:fiscalId/line/:line/change-tariff', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.changeProduct({
      line: req.params.line,
      productId: req.body.productId,
      newProductId: req.body.newProductId,
      ...req.body
    });
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Duplicar SIM
router.post('/:fiscalId/line/:line/duplicate-sim', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.lineChangeSim({
      line: req.params.line,
      ...req.body
    });
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Crear ticket
router.post('/:fiscalId/ticket', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.createTicket({
      fiscalId: req.params.fiscalId,
      ...req.body
    });
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Productos compatibles para cambio de tarifa
router.get('/:fiscalId/line/:line/compatible-products', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    // Intentar obtener productos compatibles desde API
    try {
      var compatibles = await api.request('GET', '/subscription/getCompatibleMainProducts?fiscalId=' + encodeURIComponent(req.params.fiscalId) + '&lineNumber=' + encodeURIComponent(req.params.line));
      var products = compatibles && compatibles.data ? compatibles.data : (Array.isArray(compatibles) ? compatibles : []);
      if (products.length > 0) return res.json({ ok: true, data: products });
    } catch(e) {}
    // Fallback: productos generales
    try {
      var allProducts = await api.getProducts();
      if (allProducts && allProducts.length > 0) {
        return res.json({ ok: true, data: allProducts.map(function(p) {
          return { id: p.id || p.productId || '', name: p.name || p.productName || p.description || '', price: p.price || p.finalPrice || 0, family: p.family || '' };
        }) });
      }
    } catch(e) {}
    res.json({ ok: true, data: [] });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Productos opcionales compatibles (bonos)
router.get('/:fiscalId/line/:line/compatible-optional-products', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var optional = await api.request('GET', '/subscription/getCompatibleOptionalProducts?fiscalId=' + encodeURIComponent(req.params.fiscalId) + '&lineNumber=' + encodeURIComponent(req.params.line));
    var products = optional && optional.data ? optional.data : (Array.isArray(optional) ? optional : []);
    res.json({ ok: true, data: products });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Añadir producto opcional (bono)
router.post('/:fiscalId/line/:line/add-optional-product', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.addOptionalProduct({
      fiscalId: req.params.fiscalId,
      lineNumber: req.params.line,
      ...req.body
    });
    res.json({ ok: true, data: result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// Tipologías de tickets
router.get('/:fiscalId/ticket-typologies', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.getTicketTypologies();
    res.json({ ok: true, data: Array.isArray(result) ? result : (result && result.data ? result.data : []) });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---------- Buscar cliente por teléfono (para CodeOpen overlay) ----------
router.get('/api/find-by-phone/:phone', requireAuth, async (req, res) => {
  try {
    var phone = req.params.phone.replace(/[^0-9]/g, '');
    if (phone.length < 9) return res.json({ ok: false });
    var api = LikesAPI.getApiInstance();
    var customers = await api.getCustomers();
    if (Array.isArray(customers)) {
      for (var c of customers) {
        var cPhone = String(c.phone || c.mobile || c.telefono || '').replace(/[^0-9]/g, '');
        if (cPhone && (cPhone.includes(phone) || phone.includes(cPhone) || phone.slice(-9) === cPhone.slice(-9))) {
          var fiscalId = c.fiscalId || c.fiscal_id || c.dni || '';
          if (fiscalId) return res.json({ ok: true, fiscalId: fiscalId, name: c.name || '' });
        }
      }
    }
    res.json({ ok: false });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---------- Subir documento KYC ----------
router.post('/:fiscalId/upload-kyc', requireAuth, cmUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió archivo' });
    var fiscalId = req.params.fiscalId;
    var tipo = req.body.tipo || 'obverseDocument';
    var api = LikesAPI.getApiInstance();
    var fileBuf = fs.readFileSync(req.file.path);
    var apiOk = false, driveId = null, driveLink = '';

    // Intentar subir a API Likes
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
    } catch(apiErr) { console.error('[CM] API upload error:', apiErr.message); }

    // Subir a Drive como backup
    try {
      var drive = require('../helpers/drive');
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
    } catch(driveErr) { console.error('[CM] Drive upload error:', driveErr.message); }

    // Limpiar temp
    try { fs.unlinkSync(req.file.path); } catch(e) {}

    res.json({ ok: true, message: 'Documento ' + tipo + ' subido' + (apiOk ? ' (API + Drive)' : ' (solo Drive)'), apiOk: apiOk, driveId: driveId, driveLink: driveLink });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Subir contrato firmado ----------
router.post('/:fiscalId/upload-contract', requireAuth, cmUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió archivo' });
    var fiscalId = req.params.fiscalId;
    var api = LikesAPI.getApiInstance();
    var fileBuf = fs.readFileSync(req.file.path);
    var apiOk = false, driveId = null, driveLink = '';

    // Intentar subir a API Likes como documento de firma
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
    } catch(apiErr) { console.error('[CM] API contract upload error:', apiErr.message); }

    // Subir a Drive nube
    try {
      var drive = require('../helpers/drive');
      if (drive.isAvailable()) {
        var now = new Date();
        var year = now.getFullYear(), month = String(now.getMonth() + 1).padStart(2, '0');
        var uploadResult = await drive.uploadToDrive(fileBuf, 'contrato_' + fiscalId + '_' + Date.now() + '.pdf', year, month);
        if (uploadResult) { driveId = uploadResult.id; driveLink = uploadResult.webViewLink; }
      }
    } catch(driveErr) { console.error('[CM] Drive contract upload error:', driveErr.message); }

    try { fs.unlinkSync(req.file.path); } catch(e) {}

    res.json({ ok: true, message: 'Contrato subido' + (apiOk ? ' (API + Drive)' : ' (solo Drive)'), apiOk: apiOk, driveId: driveId, driveLink: driveLink });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Calcular scoring online ----------
router.post('/:fiscalId/calculate-scoring', requireAuth, async (req, res) => {
  try {
    var fiscalId = req.params.fiscalId;
    var api = LikesAPI.getApiInstance();
    var detalles = [];
    var puntuacion = 5;
    var riesgo = 'medio';

    // 1. Scoring de API Likes si disponible
    try {
      var custResp = await api.request('GET', '/customer?fiscalId=' + encodeURIComponent(fiscalId));
      var custData = custResp.data || custResp;
      var sc = parseFloat(custData.scoring || custData.score || custData.creditScore || custData.rating || -1);
      if (sc >= 0) {
        puntuacion = sc;
        detalles.push('Scoring API Likes: ' + sc + '/10');
      }
      if (custData.aeatStatus) {
        detalles.push('AEAT: ' + custData.aeatStatus);
        if (custData.aeatStatus.toLowerCase().includes('ok') || custData.aeatStatus.toLowerCase().includes('valid')) puntuacion += 1;
        else puntuacion -= 1;
      }
    } catch(e) {
      detalles.push('Sin scoring de API Likes');
    }

    // 2. Historial facturas ISP locales
    try {
      var facRow = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN estado='pagada' OR estado='paid' OR pagado=1 THEN 1 ELSE 0 END) as pagadas FROM isp_facturas WHERE fiscal_id=?").get(fiscalId);
      if (facRow && facRow.total > 0) {
        var ratio = facRow.pagadas / facRow.total;
        detalles.push(facRow.pagadas + '/' + facRow.total + ' facturas pagadas (' + Math.round(ratio*100) + '%)');
        if (ratio >= 0.9) puntuacion += 2;
        else if (ratio >= 0.7) puntuacion += 1;
        else puntuacion -= 1;
      } else {
        detalles.push('Sin historial de facturas ISP');
      }
    } catch(e) {}

    // 3. DNI/NIF válido
    var dniClean = fiscalId.toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (/^\d{8}[A-Z]$/.test(dniClean)) { puntuacion += 1; detalles.push('DNI/NIF válido'); }
    else if (dniClean) { puntuacion -= 1; detalles.push('DNI/NIF formato inválido'); }

    // 4. Normalizar
    puntuacion = Math.max(1, Math.min(10, Math.round(puntuacion)));
    if (puntuacion >= 7) riesgo = 'bajo';
    else if (puntuacion >= 4) riesgo = 'medio';
    else riesgo = 'alto';

    res.json({
      ok: true,
      fiscalId: fiscalId,
      scoring: puntuacion,
      risk: riesgo,
      detalles: detalles,
      fiable: riesgo === 'bajo',
      recomendacion: riesgo === 'alto' ? '⚠️ Revisar antes de nueva contratación' : (riesgo === 'medio' ? '➡️ Cliente estándar' : '✅ Cliente confiable')
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Facturas en Drive (nube) ----------
router.get('/:fiscalId/drive-invoices', requireAuth, async (req, res) => {
  try {
    var fiscalId = req.params.fiscalId;
    var drive = require('../helpers/drive');
    if (!drive.isAvailable()) {
      return res.json({ ok: false, error: 'Drive no disponible' });
    }

    // Buscar en la carpeta nube/YYYY/MM/ archivos PDF que contengan el fiscalId
    var nubeId = await drive.getNubeFolderId();
    if (!nubeId) return res.json({ ok: false, error: 'No se encontró carpeta nube' });

    // Listar años
    var years = await drive.listFolderContents(nubeId);
    var result = [];

    for (var y of years) {
      if (!y.isFolder) continue;
      var months = await drive.listFolderContents(y.id);
      for (var m of months) {
        if (!m.isFolder) continue;
        var files = await drive.listFolderContents(m.id);
        var matching = files.filter(function(f) {
          if (f.isFolder) return false;
          var nameLower = f.name.toLowerCase();
          var idLower = fiscalId.toLowerCase().replace(/[^0-9a-z]/g, '');
          return nameLower.includes(idLower) || nameLower.endsWith('.pdf');
        });
        // Si hay muchos archivos, filtrar solo los que contienen el fiscalId
        if (matching.length > 10) {
          matching = files.filter(function(f) {
            var nameLower = f.name.toLowerCase();
            var idLower = fiscalId.toLowerCase().replace(/[^0-9a-z]/g, '');
            return nameLower.includes(idLower);
          });
        }
        matching.forEach(function(f) {
          result.push({
            fileName: f.name,
            year: y.name,
            month: m.name,
            driveId: f.id,
            size: f.size,
            created: f.created,
            link: f.link || ('https://drive.google.com/file/d/' + f.id + '/view')
          });
        });
      }
    }

    // Agrupar por año/mes
    var grouped = {};
    result.forEach(function(f) {
      var key = f.year + '-' + f.month;
      if (!grouped[key]) grouped[key] = { year: f.year, month: f.month, files: [] };
      grouped[key].files.push(f);
    });

    var keys = Object.keys(grouped).sort().reverse();
    var output = keys.map(function(k) { return grouped[k]; });

    res.json({ ok: true, data: output, total: result.length });
  } catch(e) {
    console.error('[CM] drive-invoices error:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ---------- Obtener parte de trabajo de instalación ----------
router.post('/:fiscalId/installation/:installId/work-order', requireAuth, async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var workOrder = await api.getInstallationWorkOrder(req.params.installId);
    if (!workOrder) {
      return res.json({ ok: false, error: 'No se encontró parte de trabajo' });
    }
    res.json({ ok: true, data: workOrder });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
