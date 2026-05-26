const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const equipos = db.prepare('SELECT e.*, n.nombre as nodo_nombre, cl.nombre as cliente_nombre FROM isp_equipos e LEFT JOIN isp_nodos n ON e.nodo_id=n.id LEFT JOIN clients cl ON e.cliente_id=cl.id ORDER BY e.nombre').all();
    const nodosList = db.prepare('SELECT id, nombre FROM isp_nodos ORDER BY nombre').all();
    const clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all();
    res.render('isp/equipos/index', { title: 'Equipos', equipos, nodosList, clientes, errors: [] });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_equipos (nombre, nodo_id, tipo, fabricante, modelo, numero_serie, mac, ip, cliente_id, notas) VALUES (?,?,?,?,?,?,?,?,?,?)').run(req.body.nombre, req.body.nodo_id || null, req.body.tipo, req.body.fabricante || '', req.body.modelo || '', req.body.numero_serie || '', req.body.mac || '', req.body.ip || '', req.body.cliente_id || null, req.body.notas || '');
    res.redirect('/isp/equipos');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
