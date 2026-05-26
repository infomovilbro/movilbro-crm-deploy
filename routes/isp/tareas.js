const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const tareas = db.prepare('SELECT t.*, u.nombre as user_name, cl.nombre as cliente_nombre FROM isp_tareas t LEFT JOIN users u ON t.user_id=u.id LEFT JOIN clients cl ON t.client_id=cl.id ORDER BY t.created_at DESC').all();
    const clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all();
    res.render('isp/tareas/index', { title: 'Tareas', tareas, clientes });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
