const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const nodos = db.prepare('SELECT * FROM isp_nodos ORDER BY nombre').all();
    res.render('isp/nodos/index', { title: 'Nodos', nodos });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_nodos (nombre, direccion, tipo, latitud, longitud, notas) VALUES (?,?,?,?,?,?)').run(req.body.nombre, req.body.direccion || '', req.body.tipo, req.body.latitud || null, req.body.longitud || null, req.body.notas || '');
    res.redirect('/isp/nodos');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
