const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const plantillas = db.prepare('SELECT * FROM isp_plantillas WHERE activo=1 ORDER BY nombre').all();
    res.render('isp/plantillas/index', { title: 'Plantillas', plantillas });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
