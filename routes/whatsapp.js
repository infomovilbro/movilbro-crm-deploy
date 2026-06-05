const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../database');
const waService = require('../services/whatsapp');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const clientes = db.prepare('SELECT id, nombre, apellidos, telefono FROM clients WHERE telefono IS NOT NULL AND telefono != \'\' ORDER BY nombre').all();
  const phone = req.query.phone || '';
  res.render('whatsapp', { title: 'WhatsApp', clientes: clientes || [], phone });
});

router.get('/diag', (req, res) => {
  var stats = waService.getStats ? waService.getStats() : { status: waService.getStatus(), chatCount: waService.getChats().length };
  res.json(stats);
});

router.get('/status', requireAuth, (req, res) => {
  res.json({ status: waService.getStatus() });
});

// SSE stream for QR + status
router.get('/qr-stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  var callbackActive = true;
  var currentStatus = waService.getStatus();

  // Send current status immediately
  res.write('data: ' + JSON.stringify({ type: 'status', data: currentStatus }) + '\n\n');

  waService.getQR(function(data) {
    if (!callbackActive) return;
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  });

  var interval = setInterval(function() {
    if (!callbackActive) { clearInterval(interval); return; }
    res.write('data: ' + JSON.stringify({ type: 'ping' }) + '\n\n');
    // Re-check status periodically
    var s = waService.getStatus();
    if (s !== currentStatus) {
      currentStatus = s;
      res.write('data: ' + JSON.stringify({ type: 'status', data: s }) + '\n\n');
    }
  }, 5000);

  req.on('close', function() {
    callbackActive = false;
    clearInterval(interval);
    waService.removeQRCallback();
  });
});

router.get('/chats', requireAuth, (req, res) => {
  res.json({ chats: waService.getChats(), status: waService.getStatus() });
});

router.get('/messages', requireAuth, async (req, res) => {
  try {
    var jid = req.query.jid;
    if (!jid) return res.status(400).json({ error: 'Falta jid' });
    var msgs = await waService.getMessages(jid, parseInt(req.query.limit) || 50);
    res.json({ messages: msgs });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/send', requireAuth, express.json(), async (req, res) => {
  try {
    var { jid, text } = req.body;
    if (!jid || !text) return res.status(400).json({ error: 'Falta jid o text' });
    await waService.sendMessage(jid, text);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/reconnect', requireAuth, (req, res) => {
  res.json({ ok: true, message: 'Reconectando...' });
});

module.exports = router;
