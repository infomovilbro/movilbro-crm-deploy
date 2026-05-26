const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const tarifas = db.prepare('SELECT * FROM isp_tarifas WHERE activo=1 ORDER BY nombre').all();
    res.render('isp/tarifas', { title: 'Tarifas', tarifas });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_tarifas (nombre, tipo, descripcion, precio, precio_instalacion, permanencia_meses, velocidad, datos_gb, minutos) VALUES (?,?,?,?,?,?,?,?,?)').run(req.body.nombre, req.body.tipo, req.body.descripcion || '', parseFloat(req.body.precio || 0), parseFloat(req.body.precio_instalacion || 0), parseInt(req.body.permanencia_meses || 0), req.body.velocidad || '', req.body.datos_gb || '', req.body.minutos || '');
    res.redirect('/isp/tarifas');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
