const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const campanas = db.prepare('SELECT * FROM isp_campanas WHERE activo=1 ORDER BY created_at DESC').all();
    res.render('isp/campanas/index', { title: 'Campañas', campanas });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
