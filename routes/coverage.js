const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../database');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.render('coverage/index', { title: 'Consultar Cobertura', resultado: null, error: null, direccion: '' });
});

router.post('/consultar', requireAuth, (req, res) => {
  const { direccion } = req.body;
  if (!direccion) {
    return res.render('coverage/index', { title: 'Consultar Cobertura', resultado: null, error: 'Introduce una dirección', direccion: '' });
  }
  res.render('coverage/index', { title: 'Consultar Cobertura', resultado: { direccion, mensaje: 'Simulación de cobertura disponible. Conecta la API de Likes Telecom para resultados reales.' }, error: null, direccion });
});

module.exports = router;
