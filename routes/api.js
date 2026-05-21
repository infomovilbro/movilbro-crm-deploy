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

module.exports = router;
