const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const router = express.Router();

function getApi() {
  const settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  const config = {};
  settings.forEach(s => config[s.key] = s.value);
  return new LikesAPI({
    apiUrl: config.likes_api_url,
    email: config.likes_client_id,
    password: config.likes_client_secret,
    brandId: config.likes_brand_id
  });
}

router.get('/', requireAuth, async (req, res) => {
  const estadoFilter = req.query.estado || '';
  let suscripciones = [];
  let apiSubscriptions = [];
  let apiError = null;

  let query = `
    SELECT s.*, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos, c.telefono as cliente_telefono
    FROM subscriptions s JOIN clients c ON s.client_id = c.id
  `;
  const params = [];
  if (estadoFilter) {
    query += ` WHERE s.estado = ?`;
    params.push(estadoFilter);
  }
  query += ` ORDER BY s.created_at DESC`;
  suscripciones = db.prepare(query).all(...params);

  try {
    const api = getApi();
    const raw = await api.getSubscriptions();
    if (Array.isArray(raw) && raw.length > 0) {
      apiSubscriptions = raw.map(sub => ({
        id: sub.id || sub.likes_id,
        api_id: sub.id,
        client_id: null,
        likes_subscription_id: sub.id || sub.likes_id,
        linea: sub.line || sub.linea || sub.phone || '',
        producto: sub.product || sub.producto || sub.productName || '',
        estado: (sub.status || sub.estado || 'activa').toLowerCase(),
        fecha_alta: sub.created_at || sub.fecha_alta || sub.startDate || null,
        fecha_baja: sub.cancelled_at || sub.fecha_baja || sub.endDate || null,
        cliente_nombre: sub.customer?.name || sub.customer_name || sub.client_name || '',
        cliente_apellidos: sub.customer?.surname || '',
        cliente_telefono: sub.customer?.phone || sub.phone || sub.line || '',
        from_api: true
      }));
    }
  } catch (error) {
    apiError = error.message;
  }

  const merged = [...suscripciones, ...apiSubscriptions];
  merged.sort((a, b) => {
    const da = a.fecha_alta || a.created_at || '';
    const db2 = b.fecha_alta || b.created_at || '';
    return da < db2 ? 1 : da > db2 ? -1 : 0;
  });

  res.render('subscriptions/list', {
    title: 'Suscripciones',
    suscripciones: merged,
    estadoFilter,
    apiCount: apiSubscriptions.length,
    apiError
  });
});

router.get('/nueva', requireAuth, (req, res) => {
  const clientes = db.prepare('SELECT id, nombre, apellidos FROM clients ORDER BY nombre').all();
  res.render('subscriptions/create', { title: 'Nueva Suscripción', clientes, sub: {}, errors: [] });
});

router.post('/nueva', requireAuth, (req, res) => {
  const { client_id, linea, producto, fecha_alta } = req.body;
  if (!client_id || !producto) {
    const clientes = db.prepare('SELECT id, nombre, apellidos FROM clients ORDER BY nombre').all();
    return res.render('subscriptions/create', { title: 'Nueva Suscripción', clientes, sub: req.body, errors: ['Cliente y producto son obligatorios'] });
  }
  db.prepare('INSERT INTO subscriptions (client_id, linea, producto, fecha_alta) VALUES (?, ?, ?, ?)').run(client_id, linea, producto, fecha_alta || new Date().toISOString());
  res.redirect('/suscripciones');
});

router.post('/:id/estado', requireAuth, (req, res) => {
  const { estado, fecha_baja } = req.body;
  db.prepare('UPDATE subscriptions SET estado = ?, fecha_baja = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(estado, fecha_baja || null, req.params.id);
  res.redirect('/suscripciones');
});

module.exports = router;
