const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const listados = db.prepare('SELECT * FROM isp_listados ORDER BY categoria, titulo').all();
    res.render('isp/listados', { title: 'Listados', listados });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
