const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const documentos = db.prepare('SELECT d.*, cl.nombre as cliente_nombre FROM isp_documentos d LEFT JOIN clients cl ON d.client_id=cl.id ORDER BY d.created_at DESC').all();
    const clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all();
    res.render('isp/documentos/index', { title: 'Documentos', documentos, clientes });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
