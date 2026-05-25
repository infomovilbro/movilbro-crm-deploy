const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const router = express.Router();

function getApi() {
  var settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  var config = {};
  settings.forEach(function(s) { config[s.key] = s.value; });
  return new LikesAPI({
    apiUrl: config.likes_api_url,
    email: config.likes_client_id,
    password: config.likes_client_secret,
    brandId: config.likes_brand_id
  });
}

var FAMILY_MAP = {
  'mobile': 'M\u00f3vil', 'fiber': 'Fibra', 'tv': 'TV', 'device': 'Dispositivo',
  'international': 'Internacional', 'convergent': 'Convergente', 'energy': 'Energ\u00eda',
  'fixed': 'Fijo', 'satellite': 'Sat\u00e9lite', 'other': 'Otra'
};

var STATUS_MAP = {
  'active':'activa','activa':'activa',
  'suspended':'suspendida','suspendida':'suspendida',
  'terminated':'baja','canceled':'baja','cancelled':'baja','baja':'baja',
  'pending':'pendiente','pendiente':'pendiente',
  'pending_installation':'pendiente','pending_activation':'pendiente',
  'pending_termination':'pendiente baja',
  'pending_portability':'pendiente portabilidad',
  'pending_product_change':'pendiente cambio',
  'blocked':'bloqueada','suspended_blocked':'bloqueada'
};

// Detect tariff changes: if same line has a newer activa sub, the "baja" is a cambio
function reclasificarCambios(subs) {
  var lineActiva = {};
  subs.forEach(function(s) {
    if (s.linea && (s.estado === 'activa' || s.estado === 'suspendida' || s.estado === 'pendiente')) {
      var d = s.fecha_alta || s.created_at || '';
      if (!lineActiva[s.linea] || d > lineActiva[s.linea].fecha) {
        lineActiva[s.linea] = { fecha: d, idx: -1 };
      }
    }
  });
  subs.forEach(function(s) {
    if (s.estado === 'baja' && s.linea && lineActiva[s.linea]) {
      s.estado = 'cambio tarifa';
      s._esCambio = true;
    }
  });
  return subs;
}

function buildComprehensivePhoneMap(customers) {
  var map = {};
  customers.forEach(function(c) {
    var phones = [c.phone, c.contactPhone, (c.contactInfo || {}).phone, c.mobilePhone, c.telephone, c.fax];
    phones.forEach(function(p) {
      if (p) {
        var cleaned = p.replace(/[^\d]/g, '');
        if (cleaned) {
          map[cleaned] = c;
          if (cleaned.length > 9) map[cleaned.slice(-9)] = c;
          if (cleaned.length <= 9) map['34' + cleaned] = c;
        }
      }
    });
  });
  return map;
}

function findCustomerName(sub, customers) {
  var prod = (sub.products && sub.products[0]) || {};
  var phone = (prod.lineNumber || sub.phone || '').replace(/[^\d]/g, '');
  var fiscalId = (sub.fiscalId || '').trim().toLowerCase();

  // 1. Try fiscalId match (exact)
  if (fiscalId) {
    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      if (c.fiscalId && c.fiscalId.trim().toLowerCase() === fiscalId) {
        var n = c.name || c.firstName || '';
        var a = c.lastName || c.surname || '';
        if (n) return (n + ' ' + a).trim();
      }
    }
  }

  // 2. Try phone match via comprehensive map
  if (phone) {
    var phoneMap = buildComprehensivePhoneMap(customers);
    var cust = phoneMap[phone] || phoneMap['34' + phone] || (phone.length > 9 ? phoneMap[phone.slice(-9)] : null);
    if (cust) {
      var n = cust.name || cust.firstName || '';
      var a = cust.lastName || cust.surname || '';
      if (n) return (n + ' ' + a).trim();
    }
  }

  // 3. Try local DB
  if (phone) {
    try {
      var local = db.prepare("SELECT nombre, apellidos FROM clients WHERE telefono = ? OR telefono2 = ? OR REPLACE(telefono, ' ', '') = ? OR REPLACE(telefono2, ' ', '') = ?").get(phone, phone, phone, phone);
      if (local && local.nombre) return (local.nombre + ' ' + (local.apellidos || '')).trim();
    } catch(e) {}
  }

  // 4. Try sub.customer embedded object
  var cn = sub.customer || sub.client || sub.customerInfo || {};
  var n = cn.name || cn.firstName || cn.displayName || cn.fullName || '';
  var a = cn.lastName || cn.surname || '';
  if (n) return (n + ' ' + a).trim();

  // 5. Sub-level name fields
  n = sub.customer_name || sub.client_name || sub.customerName || sub.clientName || sub.name || '';
  if (n) return n;

  return phone || '';
}

function mapSubscriptions(allSubs, customers) {
  return allSubs.map(function(sub) {
    var prod = (sub.products && sub.products[0]) || {};
    var subLinea = prod.lineNumber || sub.line || sub.linea || sub.phone || '';
    var estadoRaw = (prod.status || sub.status || sub.estado || 'activa').toLowerCase();
    var telefono = prod.lineNumber || sub.phone || '';
    var cn = sub.customer || sub.client || sub.customerInfo || {};
    return {
      id: sub.subscriptionId || sub.id || sub.likes_id,
      client_id: null,
      linea: subLinea,
      producto: prod.productName || sub.productName || sub.product || sub.producto || '',
      familia: FAMILY_MAP[(prod.family || sub.family || '').toLowerCase()] || prod.family || sub.family || '',
      precio: prod.finalPrice || sub.finalPrice || 0,
      estado: STATUS_MAP[estadoRaw] || estadoRaw,
      fecha_alta: sub.created || sub.sellDate || sub.created_at || sub.fecha_alta || sub.startDate || null,
      fecha_baja: sub.endDate || sub.cancelled_at || sub.fecha_baja || null,
      cliente_nombre: findCustomerName(sub, customers),
      cliente_apellidos: cn.surname || cn.lastName || '',
      cliente_telefono: telefono,
      cliente_email: cn.email || '',
      from_api: true
    };
  });
}

function computeCharts(subs) {
  var statusCounts = {};
  var productCounts = {};
  var monthlyCounts = {};
  var familyStatusMap = {};
  var allStatuses = {};

  subs.forEach(function(s) {
    var st = s.estado || 'desconocido';
    statusCounts[st] = (statusCounts[st] || 0) + 1;
    var pr = s.producto || 'Sin producto';
    productCounts[pr] = (productCounts[pr] || 0) + 1;
    var fa = s.familia || 'Otra';
    if (!familyStatusMap[fa]) familyStatusMap[fa] = {};
    familyStatusMap[fa][st] = (familyStatusMap[fa][st] || 0) + 1;
    allStatuses[st] = true;
    if (s.fecha_alta) {
      var d = new Date(s.fecha_alta);
      if (!isNaN(d.getTime())) {
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        monthlyCounts[key] = (monthlyCounts[key] || 0) + 1;
      }
    }
  });

  var productSorted = Object.keys(productCounts).sort(function(a, b) {
    return productCounts[b] - productCounts[a];
  }).slice(0, 8).map(function(k) {
    return { label: k, value: productCounts[k] };
  });

  var monthlySorted = Object.keys(monthlyCounts).sort().map(function(k) {
    var p = k.split('-');
    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return { label: meses[parseInt(p[1]) - 1] + ' ' + p[0], value: monthlyCounts[k] };
  });

  var ST_COLORS = { 'activa':'#198754','suspendida':'#ffc107','baja':'#dc3545','cambio tarifa':'#6f42c1','pendiente':'#0d6efd','pendiente baja':'#dc3545','pendiente portabilidad':'#0d6efd','pendiente cambio':'#ffc107','bloqueada':'#6c757d' };
  var statusColors = Object.keys(statusCounts).map(function(k) { return ST_COLORS[k] || '#6c757d'; });

  // Family x Status stacked
  var familyNames = Object.keys(familyStatusMap).sort();
  var statusPriority = ['activa','suspendida','pendiente','baja','cambio tarifa','bloqueada'];
  var presentStatuses = statusPriority.filter(function(st) { return allStatuses[st]; });
  var otherStatuses = Object.keys(allStatuses).filter(function(st) { return presentStatuses.indexOf(st) === -1; });
  var sortedStatuses = presentStatuses.concat(otherStatuses);

  var stackedDatasets = sortedStatuses.map(function(st) {
    return {
      label: st.charAt(0).toUpperCase() + st.slice(1),
      data: familyNames.map(function(fam) { return familyStatusMap[fam][st] || 0; }),
      backgroundColor: ST_COLORS[st] || '#6c757d'
    };
  });

  // Compute detail: for each status, list of subs {linea, producto, fecha_alta}
  var statusDetail = {};
  subs.forEach(function(s) {
    var st = s.estado || 'desconocido';
    if (!statusDetail[st]) statusDetail[st] = [];
    if (statusDetail[st].length < 50) { // cap at 50 to avoid huge payload
      statusDetail[st].push({ linea: s.linea, producto: s.producto, familia: s.familia, fecha_alta: s.fecha_alta });
    }
  });

  return {
    status: { labels: Object.keys(statusCounts), data: Object.values(statusCounts), colors: statusColors, detail: statusDetail },
    products: { labels: productSorted.map(function(p) { return p.label; }), data: productSorted.map(function(p) { return p.value; }) },
    monthly: { labels: monthlySorted.map(function(m) { return m.label; }), data: monthlySorted.map(function(m) { return m.value; }) },
    familyStacked: { labels: familyNames, datasets: stackedDatasets }
  };
}

router.get('/', requireAuth, async function(req, res) {
  try {
    var estadoFilter = req.query.estado || '';
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 100;

    var localSubs = [];
    var apiSubscriptions = [];
    var apiCount = 0;
    var apiError = null;

    var query = 'SELECT s.*, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos, c.telefono as cliente_telefono FROM subscriptions s JOIN clients c ON s.client_id = c.id';
    var params = [];
    if (estadoFilter) { query += ' WHERE s.estado = ?'; params.push(estadoFilter); }
    query += ' ORDER BY s.created_at DESC';
    localSubs = db.prepare(query).all(...params);

    // Fetch API data
    try {
      var api = getApi();
      var allSubs = [];
      var allCustomers = [];

      // Get customers first
      try { allCustomers = await api.getCustomers(); } catch (e) {
        console.error('Customer fetch error:', e.message);
      }

      // If no customers from API, try local DB
      if (allCustomers.length === 0) {
        try {
          var localClients = db.prepare('SELECT nombre, apellidos, telefono, dni_nif as fiscalId FROM clients WHERE telefono IS NOT NULL').all();
          localClients.forEach(function(c) {
            allCustomers.push({ name: c.nombre, lastName: c.apellidos, phone: c.telefono, fiscalId: c.fiscalId || '' });
          });
        } catch(e) {}
      }

      // Iterate customers by fiscalId (injecting fiscalId into subs for name resolution)
      var fiscalIds = allCustomers.length > 0
        ? allCustomers.map(function(c) { return c.fiscalId; }).filter(Boolean)
        : [];

      // Fallback: direct endpoint if no fiscalIds
      if (fiscalIds.length === 0) {
        try { var d = await api.getSubscriptions(); if (Array.isArray(d) && d.length > 0) allSubs = d; } catch(e) {}
      }

      for (var i = 0; i < fiscalIds.length; i += 10) {
        var batch = fiscalIds.slice(i, i + 10);
        var results = await Promise.allSettled(batch.map(function(fid) {
          return api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(fid) + '&brand_id=' + api.brandId)
            .then(function(data) {
              var items = api.extractData(data);
              if (Array.isArray(items)) items.forEach(function(item) { item.fiscalId = fid; });
              return items;
            });
        }));
        results.forEach(function(r) {
          if (r.status === 'fulfilled' && Array.isArray(r.value)) {
            r.value.forEach(function(v) { allSubs.push(v); });
          }
        });
      }

      if (allSubs.length > 0) {
        apiSubscriptions = mapSubscriptions(allSubs, allCustomers);
        apiCount = apiSubscriptions.length;
      }
    } catch (error) {
      apiError = error.message;
      console.error('API error:', error.message);
    }

    // Merge
    var merged = [];
    localSubs.forEach(function(s) { merged.push(s); });
    apiSubscriptions.forEach(function(s) { merged.push(s); });
    merged.sort(function(a, b) {
      var da = a.fecha_alta || a.created_at || '';
      var db2 = b.fecha_alta || b.created_at || '';
      return da < db2 ? 1 : da > db2 ? -1 : 0;
    });

    // Separate real bajas from tariff changes
    merged = reclasificarCambios(merged);

    var charts = computeCharts(merged);
    var totalItems = merged.length;
    var totalPages = Math.ceil(totalItems / limit);
    var pageItems = merged.slice((page - 1) * limit, page * limit);

    res.render('subscriptions/list', {
      title: 'Suscripciones',
      suscripciones: pageItems,
      charts: charts,
      estadoFilter: estadoFilter,
      apiCount: apiCount,
      apiError: apiError,
      page: page,
      limit: limit,
      totalItems: totalItems,
      totalPages: totalPages
    });
  } catch (err) {
    console.error('CRITICAL:', err);
    res.status(500).send('Error al cargar suscripciones: ' + err.message);
  }
});

router.get('/nueva', requireAuth, function(req, res) {
  var clientes = db.prepare('SELECT id, nombre, apellidos FROM clients ORDER BY nombre').all();
  res.render('subscriptions/create', { title: 'Nueva Suscripci\u00f3n', clientes: clientes, sub: {}, errors: [] });
});

router.post('/nueva', requireAuth, function(req, res) {
  var data = req.body;
  if (!data.client_id || !data.producto) {
    var clientes = db.prepare('SELECT id, nombre, apellidos FROM clients ORDER BY nombre').all();
    return res.render('subscriptions/create', { title: 'Nueva Suscripci\u00f3n', clientes: clientes, sub: data, errors: ['Cliente y producto son obligatorios'] });
  }
  db.prepare('INSERT INTO subscriptions (client_id, linea, producto, fecha_alta) VALUES (?, ?, ?, ?)').run(data.client_id, data.linea, data.producto, data.fecha_alta || new Date().toISOString());
  res.redirect('/suscripciones');
});

router.post('/:id/estado', requireAuth, function(req, res) {
  db.prepare('UPDATE subscriptions SET estado = ?, fecha_baja = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.body.estado, req.body.fecha_baja || null, req.params.id);
  res.redirect('/suscripciones');
});

module.exports = router;
