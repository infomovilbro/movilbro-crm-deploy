const express = require('express');
const { requireAuth } = require('../middleware/auth');
const waListener = require('../services/wa-listener');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.render('whatsapp', { title: 'WhatsApp Web' });
});

// Listener status & QR
router.get('/listener-status', requireAuth, (req, res) => {
  res.json({ status: waListener.getStatus(), hasQR: !!waListener.getQR() });
});

router.get('/listener-qr', requireAuth, (req, res) => {
  var qr = waListener.getQR();
  if (qr) res.json({ qr: qr });
  else res.json({ qr: null, status: waListener.getStatus() });
});

router.post('/listener-reset', requireAuth, (req, res) => {
  waListener.reset();
  res.json({ ok: true, message: 'Listener reiniciado. Escanea el QR para vincular.' });
});

module.exports = router;
