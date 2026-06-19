const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const permanencias = db.prepare('SELECT * FROM isp_permanencias WHERE activo=1 ORDER BY nombre').all();
    res.render('isp/permanencias', { title: 'Permanencias', permanencias });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_permanencias (nombre, meses, penalizacion, tipo_penalizacion) VALUES (?,?,?,?)').run(req.body.nombre, parseInt(req.body.meses || 0), parseFloat(req.body.penalizacion || 0), req.body.tipo_penalizacion || 'fijo');
    res.redirect('/isp/permanencias');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
