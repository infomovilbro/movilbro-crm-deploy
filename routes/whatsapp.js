const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../database');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const clientes = db.prepare('SELECT id, nombre, apellidos, telefono FROM clients WHERE telefono IS NOT NULL AND telefono != \'\' ORDER BY nombre').all();
  const phone = req.query.phone || '';
  res.render('whatsapp', { title: 'WhatsApp', clientes: clientes || [], phone });
});

module.exports = router;
