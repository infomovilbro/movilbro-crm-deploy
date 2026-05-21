const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../database');
const LikesAPI = require('../likes-api');
const router = express.Router();

const FAMILY_ORDER = ['Custom', 'Mobile', 'Fiber', 'Fixed', 'TV', 'Satellite', 'Device', 'Other'];

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
  try {
    const api = getApi();
    const productos = await api.getProducts();

    const groups = {};
    productos.forEach(p => {
      const fam = p.family || 'Otros';
      if (!groups[fam]) groups[fam] = { name: fam, items: [] };
      groups[fam].items.push(p);
    });

    const grouped = Object.values(groups).sort((a, b) => {
      const ia = FAMILY_ORDER.indexOf(a.name);
      const ib = FAMILY_ORDER.indexOf(b.name);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    res.render('products/index', { title: 'Productos', grouped, error: null });
  } catch (error) {
    res.render('products/index', { title: 'Productos', grouped: [], error: 'Error al cargar productos: ' + error.message });
  }
});

module.exports = router;
