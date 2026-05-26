const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const router = express.Router();

const { getApiInstance } = LikesAPI;

router.get('/', requireAuth, async (req, res) => {
  try {
    let apiOrders = [];
    try {
      const api = getApiInstance();
      var rawOrders = [];

      // Strategy 1: request with brand_id + extractData
      try {
        var raw = await api.request('GET', '/orders?brand_id=' + api.brandId);
        rawOrders = api.extractData(raw);
      } catch (e) {}

      // Strategy 2: try without brand_id
      if (!rawOrders.length) {
        try {
          var raw2 = await api.request('GET', '/orders');
          rawOrders = api.extractData(raw2);
        } catch (e) {}
      }

      // Strategy 3: fallback to getOrders
      if (!rawOrders.length) {
        try { rawOrders = await api.getOrders(); } catch (e) {}
      }

      apiOrders = (Array.isArray(rawOrders) ? rawOrders : []).map(o => ({
        id: 'api-' + (o.id || o.order_id || o.orderId || Math.random().toString(36).slice(2, 8)),
        client_id: null,
        cliente_nombre: o.customer_name || o.customerName || (o.customer && o.customer.name) || o.name || o.client_name || 'API',
        tipo: o.type || o.tipo || o.product_type || 'general',
        producto: o.product_name || o.productName || (o.product && o.product.name) || o.producto || o.product || '',
        estado: o.status || o.estado || 'pendiente',
        detalles: o.details || o.detalles || o.description || '',
        likes_order_id: o.id || o.order_id || o.orderId || '',
        created_at: o.created_at || o.createdAt || o.date || o.fecha || new Date().toISOString(),
        source: 'api'
      }));
    } catch (e) {
      console.error('Error fetching API orders:', e.message);
    }

    const localOrders = db.prepare(`
      SELECT o.*, c.nombre as cliente_nombre, 'local' as source
      FROM orders o JOIN clients c ON o.client_id = c.id
      ORDER BY o.created_at DESC
    `).all();

    const apiIds = new Set(apiOrders.map(o => o.likes_order_id).filter(Boolean));
    const merged = [...apiOrders, ...localOrders.filter(o => !o.likes_order_id || !apiIds.has(o.likes_order_id))];

    const statusCount = {};
    const monthCount = {};
    const typeCount = {};
    merged.forEach(o => {
      const st = o.estado || 'pendiente';
      statusCount[st] = (statusCount[st] || 0) + 1;

      const s = o.tipo || 'general';
      typeCount[s] = (typeCount[s] || 0) + 1;

      let d = new Date(o.created_at);
      if (isNaN(d.getTime())) d = new Date();
      const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      monthCount[mk] = (monthCount[mk] || 0) + 1;
    });

    const monthKeys = Object.keys(monthCount).sort();
    const monthLabels = monthKeys.map(k => {
      const [y, m] = k.split('-');
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return months[parseInt(m) - 1] + ' ' + y;
    });
    const monthData = monthKeys.map(k => monthCount[k]);

    const typeKeys = Object.keys(typeCount);
    const typeData = typeKeys.map(k => typeCount[k]);

    const statusKeys = Object.keys(statusCount);
    const statusData = statusKeys.map(k => statusCount[k]);

    res.render('orders/list', {
      title: 'Órdenes',
      orders: merged,
      charts: {
        status: { labels: statusKeys, data: statusData },
        monthly: { labels: monthLabels, data: monthData },
        type: { labels: typeKeys, data: typeData }
      }
    });
  } catch (err) {
    console.error('Orders route error:', err);
    const localOrders = db.prepare(`
      SELECT o.*, c.nombre as cliente_nombre, 'local' as source
      FROM orders o JOIN clients c ON o.client_id = c.id
      ORDER BY o.created_at DESC
    `).all();
    res.render('orders/list', { title: 'Órdenes', orders: localOrders, charts: { status: { labels: [], data: [] }, monthly: { labels: [], data: [] }, type: { labels: [], data: [] } } });
  }
});

router.get('/nueva', requireAuth, (req, res) => {
  const clientes = db.prepare('SELECT id, nombre, apellidos, telefono FROM clients ORDER BY nombre').all();
  res.render('orders/create', { title: 'Nueva Orden', clientes, orden: {}, errors: [] });
});

router.post('/nueva', requireAuth, (req, res) => {
  const { client_id, tipo, producto, detalles } = req.body;
  if (!client_id || !tipo) {
    const clientes = db.prepare('SELECT id, nombre, apellidos, telefono FROM clients ORDER BY nombre').all();
    return res.render('orders/create', { title: 'Nueva Orden', clientes, orden: req.body, errors: ['Cliente y tipo son obligatorios'] });
  }
  const result = db.prepare('INSERT INTO orders (client_id, tipo, producto, detalles) VALUES (?, ?, ?, ?)').run(client_id, tipo, producto, detalles);
  const cliente = db.prepare('SELECT nombre, apellidos FROM clients WHERE id = ?').get(client_id);
  db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('orden_creada', `Orden ${tipo} creada para ${cliente.nombre}`, client_id);
  try { const { notifyNewOrder } = require('./telegram-bot'); notifyNewOrder('\uD83D\uDCE6 <b>' + tipo + '</b> para <b>' + cliente.nombre + '</b> (#' + result.lastInsertRowid + ')'); } catch(e) {}
  res.redirect('/ordenes');
});

router.get('/:id', requireAuth, (req, res) => {
  const orden = db.prepare(`
    SELECT o.*, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos, c.telefono as cliente_telefono, c.email as cliente_email
    FROM orders o JOIN clients c ON o.client_id = c.id WHERE o.id = ?
  `).get(req.params.id);
  if (!orden) return res.redirect('/ordenes');
  res.render('orders/view', { title: `Orden #${orden.id}`, orden });
});

router.post('/:id/estado', requireAuth, (req, res) => {
  const { estado } = req.body;
  db.prepare('UPDATE orders SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(estado, req.params.id);
  res.redirect(`/ordenes/${req.params.id}`);
});

module.exports = router;
