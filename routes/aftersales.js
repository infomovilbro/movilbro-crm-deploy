const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');
const { db } = require('../database');

const { getApiInstance } = LikesAPI;

async function apiData(fn, fallback = []) {
  try {
    const api = getApiInstance();
    const data = await fn(api);
    return Array.isArray(data) && data.length ? data : fallback;
  } catch { return fallback; }
}

// ---- PORTABILIDADES ----
router.get('/portabilities', async (req, res) => {
  try {
    const portabilities = await apiData(api => api.getPortabilities());
    res.render('aftersales/portabilities', { title: 'Portabilidades', portabilities, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/portabilities', { title: 'Portabilidades', portabilities: [], error: err.message, layout: 'layout' });
  }
});

// ---- INSTALACIONES ----
router.get('/installations', async (req, res) => {
  try {
    const installations = await apiData(api => api.getInstallations());
    res.render('aftersales/installations', { title: 'Instalaciones', installations, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/installations', { title: 'Instalaciones', installations: [], error: err.message, layout: 'layout' });
  }
});

router.post('/installations', async (req, res) => {
  try {
    const api = getApiInstance();
    const result = await api.request('POST', '/installation', req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function mapInstallation(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const o = raw.data || raw.installation || raw;
  // Log ALL keys from the raw object for debugging
  console.log('[Installation detail] RAW keys:', Object.keys(o).join(', '), '| nested:', Object.keys(raw).join(', '));
  
  // Auto-detect: busca el primer valor no vacío para cada campo usando múltiples estrategias
  const pick = (...keys) => {
    for (const k of keys) {
      const v = o[k];
      if (v !== null && v !== undefined && v !== '') return String(v);
      // Try camelCase variations
      const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const v2 = o[camel];
      if (v2 !== null && v2 !== undefined && v2 !== '') return String(v2);
      // Try snake_case variations
      const snake = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      const v3 = o[snake];
      if (v3 !== null && v3 !== undefined && v3 !== '') return String(v3);
    }
    // If nothing found, try to find ANY key that contains the field name
    const allKeys = Object.keys(o);
    for (const k of keys) {
      const lower = k.toLowerCase();
      const found = allKeys.find(ak => ak.toLowerCase().includes(lower));
      if (found && o[found] !== null && o[found] !== undefined && o[found] !== '') return String(o[found]);
    }
    return '';
  };

  const result = {
    DNI: pick('dni', 'nif', 'fiscalId', 'fiscal_id', 'documento', 'identificacion'),
    Cliente: pick('cliente', 'customer', 'customerName', 'customer_name', 'nombre', 'name', 'fullName', 'full_name'),
    Dirección: pick('direccion', 'address', 'street', 'calle', 'direccion_instalacion', 'installationAddress', 'installation_address'),
    Teléfono: pick('telefono', 'phone', 'telephone', 'contactPhone', 'contact_phone', 'movil'),
    Email: pick('email', 'mail', 'correo_electronico', 'customerEmail', 'customer_email'),
    Estado: pick('estado', 'status', 'state', 'situacion'),
    Producto: pick('producto', 'product', 'productName', 'product_name', 'tarifa', 'service'),
    'Fecha Instalación': pick('fecha_instalacion', 'fechaInstalacion', 'installationDate', 'installation_date', 'fecha', 'date', 'scheduleDate', 'schedule_date', 'startDate', 'start_date'),
    'Fecha Programada': pick('fecha_programada', 'scheduledDate', 'scheduled_date', 'programmedDate'),
    'Fecha Compleción': pick('fecha_complecion', 'completionDate', 'completion_date', 'endDate', 'end_date', 'finishedAt'),
    Creado: pick('created', 'createdAt', 'created_at', 'fecha_creacion', 'creationDate'),
    Actualizado: pick('modified', 'updatedAt', 'updated_at', 'lastModified', 'last_modified'),
    Router: pick('router', 'routerModel', 'router_model', 'equipo', 'device'),
    ONT: pick('ont', 'ontModel', 'ont_model', 'ontId', 'ont_id'),
    CTO: pick('cto', 'ctoId', 'cto_id', 'ctoName', 'cto_name'),
    OT: pick('ot', 'orderId', 'order_id', 'workOrder', 'work_order', 'orden_trabajo'),
    Contrata: pick('contrata', 'contract', 'contractId', 'contract_id', 'contratista', 'proveedor'),
    Técnico: pick('tecnico', 'technician', 'instalador', 'installer', 'worker'),
    Notas: pick('notas', 'notes', 'observaciones', 'comentarios', 'comments', 'description'),
    timeline: o.timeline || o.history || o.events || o.statusHistory || o.status_history || [],
  };
  console.log('[Installation detail] mapped result:', JSON.stringify(result, null, 2));
  return result;
}

router.get('/installations/:id/detail', async (req, res) => {
  try {
    const api = getApiInstance();
    const data = await api.request('GET', '/installation?installationId=' + encodeURIComponent(req.params.id));
    console.log('[Installation detail] raw response for id=' + req.params.id + ':', JSON.stringify(data, null, 2));
    const mapped = mapInstallation(data);
    res.json({ success: true, data: mapped, raw: data });
  } catch (err) {
    console.error('[Installation detail] error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- ÓRDENES ----
router.get('/orders', async (req, res) => {
  try {
    const api = getApiInstance();
    let rawOrders = [];

    // Strategy 1: request with brand_id + extractData
    try {
      const raw = await api.request('GET', '/orders?brand_id=' + api.brandId);
      rawOrders = api.extractData(raw);
    } catch (e) {}

    // Strategy 2: try without brand_id
    if (!rawOrders.length) {
      try {
        const raw = await api.request('GET', '/orders');
        rawOrders = api.extractData(raw);
      } catch (e) {}
    }

    // Strategy 3: fallback to getOrders (which has its own try/catch)
    if (!rawOrders.length) {
      try { rawOrders = await api.getOrders(); } catch (e) {}
    }

    // Normalize field mapping
    const apiOrders = rawOrders.map(function(o) {
      return {
        id: o.id || o.orderId || o.order_id || '',
        orderId: o.id || o.orderId || o.order_id || '',
        status: o.status || o.estado || 'UNKNOWN',
        estado: o.status || o.estado || 'PENDIENTE',
        created_at: o.created_at || o.createdAt || o.date || o.fecha || '',
        created: o.created_at || o.createdAt || o.date || o.fecha || '',
        customerName: o.customer_name || o.customerName || (o.customer && o.customer.name) || o.name || o.client_name || '',
        cliente_nombre: o.customer_name || o.customerName || (o.customer && o.customer.name) || o.name || o.client_name || '',
        lineNumber: o.line_number || o.lineNumber || o.linea || '',
        linea: o.line_number || o.lineNumber || o.linea || '',
        productName: o.product_name || o.productName || (o.product && o.product.name) || o.producto || o.product || '',
        producto: o.product_name || o.productName || (o.product && o.product.name) || o.producto || o.product || '',
        price: o.price || o.precio || o.total || '',
        precio: o.price || o.precio || o.total || '',
        products: o.products || o.product || '',
        tipo: o.type || o.tipo || o.product_type || 'general'
      };
    });

    // Fallback: local DB orders
    const localOrders = db.prepare(`
      SELECT o.*, c.nombre as cliente_nombre
      FROM orders o JOIN clients c ON o.client_id = c.id
      ORDER BY o.created_at DESC LIMIT 50
    `).all().map(function(o) {
      o.status = o.estado;
      o.customerName = o.cliente_nombre;
      o.lineNumber = '';
      o.productName = o.producto || '';
      o.price = '';
      o.source = 'local';
      return o;
    });

    const orders = apiOrders.length ? apiOrders : localOrders;

    // Compute chart data server-side
    var statusCount = {}, monthCount = {}, typeCount = {};
    orders.forEach(function(o) {
      var st = (o.status || o.estado || 'UNKNOWN').toUpperCase();
      statusCount[st] = (statusCount[st] || 0) + 1;

      var tp = o.tipo || 'general';
      typeCount[tp] = (typeCount[tp] || 0) + 1;

      var d = new Date(o.created_at || o.created);
      if (isNaN(d.getTime())) d = new Date();
      var mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      monthCount[mk] = (monthCount[mk] || 0) + 1;
    });

    var monthKeys = Object.keys(monthCount).sort();
    var monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    var monthLabels = monthKeys.map(function(k) {
      var parts = k.split('-');
      return monthNames[parseInt(parts[1]) - 1] + ' ' + parts[0];
    });
    var monthData = monthKeys.map(function(k) { return monthCount[k]; });

    res.render('aftersales/orders', {
      title: 'Órdenes',
      orders: orders,
      charts: {
        status: { labels: Object.keys(statusCount), data: Object.values(statusCount) },
        monthly: { labels: monthLabels, data: monthData },
        type: { labels: Object.keys(typeCount), data: Object.values(typeCount) }
      },
      layout: 'layout'
    });
  } catch (err) {
    console.error('Orders route error:', err);
    var fallback = db.prepare(`
      SELECT o.*, c.nombre as cliente_nombre
      FROM orders o JOIN clients c ON o.client_id = c.id
      ORDER BY o.created_at DESC LIMIT 50
    `).all().map(function(o) {
      o.status = o.estado; o.customerName = o.cliente_nombre; o.source = 'local';
      return o;
    });
    res.render('aftersales/orders', {
      title: 'Órdenes',
      orders: fallback,
      charts: { status: { labels: [], data: [] }, monthly: { labels: [], data: [] }, type: { labels: [], data: [] } },
      error: err.message,
      layout: 'layout'
    });
  }
});

// ---- ENVÍOS ----
router.get('/shipments', async (req, res) => {
  try {
    const shipments = await apiData(api => api.getShipments());
    res.render('aftersales/shipments', { title: 'Envíos', shipments, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/shipments', { title: 'Envíos', shipments: [], error: err.message, layout: 'layout' });
  }
});

// ---- PENALIZACIONES ROUTER ----
router.get('/router-penalties', async (req, res) => {
  try {
    const penalties = await apiData(api => api.getRouterPenalties());
    res.render('aftersales/router-penalties', { title: 'Penalizaciones', penalties, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/router-penalties', { title: 'Penalizaciones', penalties: [], error: err.message, layout: 'layout' });
  }
});

// ---- PROCESOS ----
router.get('/processes', async (req, res) => {
  try {
    const processes = await apiData(api => api.getProcesses());
    res.render('aftersales/processes', { title: 'Procesos', processes, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/processes', { title: 'Procesos', processes: [], error: err.message, layout: 'layout' });
  }
});

// Order detail view
router.get('/orders/:id', async (req, res) => {
  try {
    var api = getApiInstance();
    var order = null;
    try {
      var raw = await api.request('GET', '/orders?brand_id=' + api.brandId);
      var items = api.extractData(raw);
      order = items.find(function(o) { return String(o.id || o.orderId || o.order_id) === req.params.id; });
    } catch(e) {}
    if (!order) {
      var local = db.prepare('SELECT o.*, c.nombre as cliente_nombre, c.telefono, c.email FROM orders o LEFT JOIN clients c ON o.client_id = c.id WHERE o.id = ?').get(req.params.id);
      if (local) {
        order = {
          id: local.id,
          orderId: local.id,
          cliente_nombre: local.cliente_nombre || 'Local',
          customerName: local.cliente_nombre || 'Local',
          linea: '',
          lineNumber: '',
          producto: local.producto || '',
          productName: local.producto || '',
          estado: local.estado || 'PENDIENTE',
          status: local.estado || 'PENDIENTE',
          tipo: local.tipo || 'general',
          detalles: local.detalles || '',
          description: local.detalles || '',
          created_at: local.created_at,
          source: 'local',
          telefono: local.telefono,
          email: local.email
        };
      }
    } else {
      order.source = 'api';
    }
    if (!order) return res.status(404).send('Orden no encontrada');
    res.render('aftersales/detalle-orden', { title: 'Orden #' + req.params.id, orden: order, layout: 'layout' });
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// Cancel/update order status
router.post('/orders/:id/status', async (req, res) => {
  try {
    var estado = req.body.estado || 'CANCELED';
    var local = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (local) {
      db.prepare('UPDATE orders SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(estado, req.params.id);
      return res.json({ ok: true, message: 'Estado actualizado a ' + estado });
    }
    var api = getApiInstance();
    try {
      await api.request('POST', '/orders/' + req.params.id + '/status', { status: estado });
      return res.json({ ok: true, message: 'Orden cancelada en API' });
    } catch(e) {
      // Try alternate endpoint
      try {
        await api.request('PUT', '/order/' + req.params.id, { blocked: estado === 'CANCELED' });
        return res.json({ ok: true, message: 'Orden cancelada en API' });
      } catch(e2) {
        return res.json({ ok: false, error: 'No se pudo cancelar en API: ' + e2.message });
      }
    }
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
