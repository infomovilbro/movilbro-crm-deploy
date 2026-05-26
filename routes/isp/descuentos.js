const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const descuentos = db.prepare('SELECT * FROM isp_descuentos WHERE activo=1 ORDER BY nombre').all();
    res.render('isp/descuentos', { title: 'Descuentos', descuentos });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_descuentos (nombre, tipo, valor, meses_duracion, aplica_a) VALUES (?,?,?,?,?)').run(req.body.nombre, req.body.tipo || 'porcentaje', parseFloat(req.body.valor || 0), parseInt(req.body.meses_duracion || 0), req.body.aplica_a || 'todos');
    res.redirect('/isp/descuentos');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
