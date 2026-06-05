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

// Public diagnostic endpoint (no auth required)
router.get('/diag', (req, res) => {
  var status = waService.getStatus();
  var chats = waService.getChats();
  res.json({
    status: status,
    chatCount: chats.length,
    chats: chats.slice(0, 5).map(function(c) { return { jid: c.jid, name: c.name, unread: c.unreadCount }; }),
    timestamp: new Date().toISOString()
  });
});

// Get connection status
router.get('/status', requireAuth, (req, res) => {
  res.json({ status: waService.getStatus() });
});

// SSE for QR code and status
router.get('/qr-stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  var sentStatus = false;
  waService.getQR(function(data) {
    if (data.type === 'qr') {
      res.write('data: ' + JSON.stringify({ type: 'qr', data: data.data }) + '\n\n');
    } else if (data.type === 'status') {
      res.write('data: ' + JSON.stringify({ type: 'status', data: data.data }) + '\n\n');
      sentStatus = true;
    }
  });

  // Send current status if already connected
  var currentStatus = waService.getStatus();
  if (currentStatus === 'connected' && !sentStatus) {
    res.write('data: ' + JSON.stringify({ type: 'status', data: 'connected' }) + '\n\n');
  }

  var interval = setInterval(function() {
    res.write('data: ' + JSON.stringify({ type: 'ping' }) + '\n\n');
  }, 10000);

  req.on('close', function() {
    clearInterval(interval);
    waService.removeQRCallback();
  });
});

// Get chats
router.get('/chats', requireAuth, (req, res) => {
  res.json({ chats: waService.getChats(), status: waService.getStatus() });
});

// Get messages for a chat
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

// Send message
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

// Reconnect
router.post('/reconnect', requireAuth, (req, res) => {
  res.json({ ok: true, message: 'Reconectando...' });
});

module.exports = router;
