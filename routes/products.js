const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../database');
const { getApiInstance } = require('../likes-api');
const router = express.Router();

const FAMILY_ORDER = ['Mobile', 'Fiber', 'Fixed', 'TV', 'Satellite', 'Device', 'Energy', 'International', 'Other'];

const FAMILY_TRANSLATION = {
  Mobile: 'Móvil', Fiber: 'Fibra', Fixed: 'Fijo', TV: 'TV',
  Satellite: 'Satélite', Device: 'Dispositivo', Energy: 'Energía',
  International: 'Internacional', Custom: 'Personalizado', Other: 'Otras'
};

const FAMILY_ICONS = {
  Mobile: '📱', Fiber: '🌐', TV: '📺', Device: '📟',
  International: '🌍', Energy: '🔋', Satellite: '📡', Fixed: '📞', Other: '📦'
};

function ensureTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS product_prices (
    product_id TEXT PRIMARY KEY,
    family TEXT,
    recommended_price REAL,
    base_price REAL,
    cession_price REAL,
    updated_at TEXT
  )`);
  // Add cession_price column if missing (migration)
  try { db.exec("ALTER TABLE product_prices ADD COLUMN cession_price REAL DEFAULT 0"); } catch(e) {}
}
ensureTable();

router.get('/', requireAuth, async (req, res) => {
  try {
    const api = getApiInstance();
    const raw = await api.request('GET', '/products/brand?allFamilies=true&showHidden=true');
    const productos = await api.extractData(raw);

    const priceRows = db.prepare('SELECT * FROM product_prices').all();
    const priceMap = {};
    priceRows.forEach(function(r) { priceMap[r.product_id] = r; });

    const groups = {};
    productos.forEach(function(p) {
      var fam = p.family || 'Other';
      if (!groups[fam]) groups[fam] = { name: fam, items: [] };
      groups[fam].items.push(p);
    });

    const grouped = Object.values(groups).sort(function(a, b) {
      var ia = FAMILY_ORDER.indexOf(a.name);
      var ib = FAMILY_ORDER.indexOf(b.name);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    var families = grouped.map(function(g) { return FAMILY_TRANSLATION[g.name] || g.name; });
    var counts = grouped.map(function(g) { return g.items.length; });

    var tipoData = {};
    productos.forEach(function(p) {
      var t = p.type || 'Otro';
      tipoData[t] = (tipoData[t] || 0) + 1;
    });
    var tipoLabels = Object.keys(tipoData);
    var tipoCounts = tipoLabels.map(function(k) { return tipoData[k]; });

    var avgPrices = grouped.map(function(g) {
      var items = g.items.filter(function(p) { return p.price && p.price > 0; });
      if (items.length === 0) return 0;
      return items.reduce(function(s, p) { return s + p.price; }, 0) / items.length;
    });

    var rangosLabels = ['0-10\u20AC', '10-50\u20AC', '50-100\u20AC', '100-500\u20AC', '500\u20AC+'];
    var rangosCounts = [0, 0, 0, 0, 0];
    productos.forEach(function(p) {
      var pr = p.price || 0;
      if (pr <= 0) return;
      if (pr <= 10) rangosCounts[0]++;
      else if (pr <= 50) rangosCounts[1]++;
      else if (pr <= 100) rangosCounts[2]++;
      else if (pr <= 500) rangosCounts[3]++;
      else rangosCounts[4]++;
    });

    res.render('products/index', {
      title: 'Productos',
      grouped: grouped,
      productos: productos,
      priceMap: priceMap,
      chartData: {
        families: JSON.stringify(families),
        counts: JSON.stringify(counts),
        tipoLabels: JSON.stringify(tipoLabels),
        tipoCounts: JSON.stringify(tipoCounts),
        avgPrices: JSON.stringify(avgPrices),
        rangosLabels: JSON.stringify(rangosLabels),
        rangosCounts: JSON.stringify(rangosCounts),
        familyIcons: JSON.stringify(FAMILY_ICONS),
        familyTranslation: JSON.stringify(FAMILY_TRANSLATION)
      },
      error: null
    });
  } catch (error) {
    res.render('products/index', {
      title: 'Productos',
      grouped: [],
      productos: [],
      priceMap: {},
      chartData: null,
      error: 'Error al cargar productos: ' + error.message
    });
  }
});

router.get('/product/:family/:productId/data', requireAuth, function(req, res) {
  try {
    var productId = req.params.productId;
    var priceRecord = db.prepare('SELECT * FROM product_prices WHERE product_id = ?').get(productId);
    res.json({ productId: productId, family: req.params.family, prices: priceRecord || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/product/:family/:productId/update', requireAuth, async function(req, res) {
  try {
    var family = req.params.family;
    var productId = req.params.productId;
    var recommendedPrice = req.body.recommendedPrice;
    var basePrice = req.body.basePrice;
    var cessionPrice = req.body.cessionPrice;

    var api = getApiInstance();
    await api.request('PUT', '/product/brand', { family: family, productId: productId, price: parseFloat(basePrice) || 0 });

    ensureTable();
    var now = new Date().toISOString();
    db.prepare('INSERT OR REPLACE INTO product_prices (product_id, family, recommended_price, base_price, cession_price, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(productId, family, parseFloat(recommendedPrice) || 0, parseFloat(basePrice) || 0, parseFloat(cessionPrice) || 0, now);

    res.json({ success: true, message: 'Precios guardados correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/product/custom/create', requireAuth, async function(req, res) {
  try {
    var api = getApiInstance();
    var result = await api.request('POST', '/product/custom', req.body);
    res.json({ success: true, data: result, message: 'Producto personalizado creado' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
