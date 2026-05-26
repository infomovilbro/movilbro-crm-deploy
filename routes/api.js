const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const router = express.Router();

function getApi(req) {
  const settings = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('likes_%');
  const config = {};
  settings.forEach(s => config[s.key] = s.value);
  return new LikesAPI({
    apiUrl: config.likes_api_url,
    email: config.likes_client_id,
    password: config.likes_client_secret,
    brandId: config.likes_brand_id
  });
}

router.get('/productos', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const productos = await api.getProducts();
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo productos: ' + error.message });
  }
});

router.post('/cliente', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const result = await api.createCustomer(req.body);
    if (result.customer_id) {
      db.prepare('UPDATE clients SET likes_customer_id = ? WHERE id = ?').run(result.customer_id, req.body.local_id);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/orden', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const result = await api.createOrder(req.body);
    if (result.order_id) {
      db.prepare('UPDATE orders SET likes_order_id = ? WHERE id = ?').run(result.order_id, req.body.local_id);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/cobertura', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const result = await api.checkCoverage(req.query.address);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/suscripciones/:customerId', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const result = await api.getClientSubscriptions(req.params.customerId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search', requireAuth, async (req, res) => {
  var q = (req.query.q || '').trim();
  if (!q || q.length < 2) { return res.json([]); }

  var search = '%' + q + '%';

  var locales = db.prepare(`
    SELECT id, nombre, apellidos, telefono, dni_nif, email, 'LOCAL' as origen
    FROM clients
    WHERE nombre LIKE ? OR apellidos LIKE ? OR telefono LIKE ? OR dni_nif LIKE ? OR email LIKE ?
    ORDER BY nombre ASC
    LIMIT 20
  `).all(search, search, search, search, search);

  var apiResults = [];
  try {
    var api = getApi();
    var raw = await api.request('GET', '/customers?brand_id=' + api.brandId);
    var customers = Array.isArray(raw) ? raw : raw.customers || raw.data || [];
    var qLower = q.toLowerCase();
    apiResults = customers.filter(function(c) {
      var name = ((c.name || c.firstName || '') + ' ' + (c.lastName || c.surname || '')).toLowerCase();
      var phone = (c.phone || c.contactInfo?.phone || '');
      var fiscalId = (c.fiscalId || c.fiscalNumber || '').toLowerCase();
      var email = (c.email || c.contactInfo?.email || '').toLowerCase();
      return name.includes(qLower) || phone.includes(q) || fiscalId.includes(qLower) || email.includes(qLower);
    }).slice(0, 20).map(function(c) {
      return {
        id: null,
        nombre: (c.name || c.firstName || '') + ' ' + (c.lastName || c.surname || ''),
        telefono: c.phone || c.contactInfo?.phone || '',
        fiscalId: c.fiscalId || c.fiscalNumber || '',
        origen: 'API'
      };
    });
  } catch (e) {
    // API search failed, continue with local results only
  }

  var seenPhones = {};
  locales.forEach(function(c) {
    var p = c.telefono ? c.telefono.replace(/[^\d]/g, '') : '';
    if (p) seenPhones[p] = true;
  });
  apiResults.forEach(function(c) {
    var p = c.telefono ? c.telefono.replace(/[^\d]/g, '') : '';
    if (!seenPhones[p]) {
      seenPhones[p] = true;
      locales.push({ id: null, nombre: c.nombre, telefono: c.telefono, dni_nif: c.fiscalId, origen: 'API' });
    }
  });

  var results = locales.slice(0, 20).map(function(c) {
    return {
      id: c.id || null,
      nombre: c.nombre || '',
      telefono: c.telefono || '',
      fiscalId: c.dni_nif || '',
      origen: c.origen || 'LOCAL'
    };
  });

  res.json(results);
});

// GET /api/propuestas - leer propuestas del bot (para que el dev las lea)
router.get('/propuestas', (req, res) => {
  var lista = db.prepare("SELECT id, chat_id, texto, leido, created_at FROM bot_propuestas WHERE leido = 0 ORDER BY created_at DESC").all();
  res.json(lista);
});

// POST /api/propuestas/:id/leer - marcar como leida
router.post('/propuestas/:id/leer', (req, res) => {
  db.prepare("UPDATE bot_propuestas SET leido = 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// GET /api/bot-test - diagnostic: test API from Render
router.get('/bot-test', async (req, res) => {
  var result = { api_configured: false, api_token: false, endpoints: {} };
  try {
    var LikesAPI = require('../likes-api');
    var api = LikesAPI.getApiInstance();
    result.api_configured = true;
    await api.getToken();
    result.api_token = true;
    var tests = [
      ['customers', 'getCustomers'], ['products', 'getProducts'], ['portabilities', 'getPortabilities'],
      ['installations', 'getInstallations'], ['subscriptions', 'getSubscriptions'],
      ['tickets', 'getTickets'], ['orders', 'getOrders'], ['surveys', 'getSurveys'], ['payments', 'getPayments']
    ];
    for (var i = 0; i < tests.length; i++) {
      try {
        var r = await api[tests[i][1]]();
        result.endpoints[tests[i][0]] = { ok: true, count: Array.isArray(r) ? r.length : 0 };
      } catch(e) {
        result.endpoints[tests[i][0]] = { ok: false, error: e.message };
      }
    }
  } catch(e) {
    result.error = e.message;
  }
  res.json(result);
});

module.exports = router;
