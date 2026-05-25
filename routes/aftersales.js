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

module.exports = router;
