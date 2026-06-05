const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.render('whatsapp', { title: 'WhatsApp Web' });
});

module.exports = router;
