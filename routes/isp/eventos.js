const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const eventos = db.prepare('SELECT e.*, cl.nombre as cliente_nombre FROM isp_eventos e LEFT JOIN clients cl ON e.client_id=cl.id ORDER BY e.fecha_inicio DESC').all();
    const clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all();
    res.render('isp/eventos/index', { title: 'Calendario', eventos, eventosRaw: eventos, clientes });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
