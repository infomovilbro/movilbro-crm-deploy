const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Redirige a tienda - el WhatsApp está en el overlay lateral
router.get('/', requireAuth, (req, res) => {
  res.redirect('/tienda');
});

module.exports = router;
