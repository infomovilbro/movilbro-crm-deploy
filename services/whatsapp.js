const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');

var AUTH_DIR = path.join(__dirname, '..', '.whatsapp-auth');
var _sock = null;
var _qrCallback = null;
var _status = 'disconnected';
var _chats = [];
var _connectionAttempts = 0;

function ensureDir() {
  try { if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch(e) {}
}

async function start() {
  ensureDir();
  _status = 'connecting';
  try {
    var { version, isLatest } = await fetchLatestBaileysVersion();
    var { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    _sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Movilbro CRM', 'Chrome', '1.0.0'],
      syncFullHistory: true,
      markOnlineOnConnect: false
    });

    _sock.ev.on('creds.update', saveCreds);

    _sock.ev.on('connection.update', function(update) {
      var { connection, lastDisconnect, qr } = update;
      if (qr && _qrCallback) {
        qrcode.toDataURL(qr, { width: 300, margin: 2 }, function(err, url) {
          if (!err && _qrCallback) _qrCallback({ type: 'qr', data: url });
        });
      }
      if (connection === 'open') {
        _status = 'connected';
        _connectionAttempts = 0;
        if (_qrCallback) _qrCallback({ type: 'status', data: 'connected' });
        loadChats();
      }
      if (connection === 'close') {
        var reason = lastDisconnect?.error?.output?.statusCode || 0;
        _status = 'disconnected';
        _sock = null;
        if (_qrCallback) _qrCallback({ type: 'status', data: 'disconnected' });
        // Reconnect unless logged out
        if (reason !== DisconnectReason.loggedOut) {
          _connectionAttempts++;
          var delay = Math.min(5000 * _connectionAttempts, 30000);
          setTimeout(start, delay);
        }
      }
    });

    _sock.ev.on('messages.upsert', async function(m) {
      if (!m.messages || m.messages.length === 0) return;
      for (var msg of m.messages) {
        try {
          if (msg.key && msg.key.remoteJid && !msg.key.fromMe && msg.message) {
            var text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            if (text) {
              var sender = msg.key.remoteJid.replace('@s.whatsapp.net', '');
              var exists = db.prepare('SELECT id FROM pending_messages WHERE source=? AND from_address=? AND body=? AND created_at > datetime("now","-1 minute")').get('whatsapp', sender, text);
              if (!exists) {
                db.prepare('INSERT INTO pending_messages (source, from_name, from_address, subject, body, status, category, created_at) VALUES (?,?,?,?,?,?,?,datetime("now","localtime"))').run('whatsapp', sender, sender, text.substring(0,80), text, 'pending', 'whatsapp');
                console.log('[WhatsApp] Mensaje de ' + sender + ': ' + text.substring(0, 80));
              }
            }
          }
        } catch(e) { console.error('[WhatsApp] msg error:', e.message); }
      }
    });

    console.log('[WhatsApp] Iniciado');
  } catch(e) {
    console.error('[WhatsApp] Error start:', e.message);
    _status = 'error';
    setTimeout(start, 15000);
  }
}

async function loadChats() {
  if (!_sock) return;
  try {
    var chats = [];
    // Try sock.chats.all() (baileys v6)
    if (_sock.chats && typeof _sock.chats.all === 'function') {
      chats = _sock.chats.all() || [];
    }
    // Fallback: sock.chats as Map/Array
    if (chats.length === 0 && _sock.chats) {
      if (_sock.chats.values) chats = Array.from(_sock.chats.values());
      else if (Array.isArray(_sock.chats)) chats = _sock.chats;
    }
    if (chats.length === 0) {
      // Try fetching via store manually
      try {
        var store = require('@whiskeysockets/baileys').makeInMemoryStore({});
        store.bind(_sock.ev);
        setTimeout(function() { chats = store.chats.all() || []; }, 2000);
      } catch(e) {}
    }
    _chats = (chats || []).map(function(c) {
      var jid = c.id || c.jid || '';
      var name = c.name || c.subject || jid.split('@')[0] || 'Unknown';
      var lastMsg = '';
      if (c.lastMessage) {
        lastMsg = c.lastMessage.message?.conversation || c.lastMessage.message?.extendedTextMessage?.text || '';
      }
      return { jid: jid, name: name, unreadCount: c.unreadCount || c.unread || 0, lastMessage: lastMsg };
    });
    console.log('[WhatsApp] Cargados ' + _chats.length + ' chats');
  } catch(e) { console.error('[WhatsApp] loadChats error:', e.message); }
}

function getQR(callback) {
  _qrCallback = callback;
  if (_status === 'connected') {
    callback({ type: 'status', data: 'connected' });
  } else if (_sock) {
    // Force QR regeneration if not connected
    try { _sock?.ev?.emit('connection.update', {}); } catch(e) {}
  }
}

function removeQRCallback() {
  _qrCallback = null;
}

function getStatus() { return _status; }

async function sendMessage(jid, text) {
  if (!_sock) throw new Error('WhatsApp no conectado');
  return await _sock.sendMessage(jid, { text: text });
}

async function getMessages(jid, limit) {
  if (!_sock) return [];
  limit = limit || 50;
  try {
    var msgs = [];
    // Try loadMessages
    if (typeof _sock.loadMessages === 'function') {
      msgs = await _sock.loadMessages(jid, limit) || [];
    }
    // Fallback: try store messages
    if (msgs.length === 0 && _sock.store && _sock.store.messages) {
      msgs = _sock.store.messages.get(jid) || [];
      msgs = msgs.slice(-limit);
    }
    return (msgs || []).map(function(m) {
      return {
        id: m.key?.id,
        fromMe: m.key?.fromMe || false,
        text: m.message?.conversation || m.message?.extendedTextMessage?.text || '',
        timestamp: m.messageTimestamp,
        pushName: m.pushName || ''
      };
    });
  } catch(e) {
    console.error('[WhatsApp] getMessages error:', e.message);
    return [];
  }
}

function getChats() { return _chats; }

setTimeout(start, 1000);

module.exports = { start, getQR, removeQRCallback, getStatus, sendMessage, getMessages, getChats };
