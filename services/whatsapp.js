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
        // Chats arrive via events, no need to call loadChats immediately
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

    // Handle incoming chats (baileys streams them via events)
    _sock.ev.on('chats.upsert', function(chats) {
      if (!chats || !Array.isArray(chats)) return;
      chats.forEach(function(c) {
        var jid = c.id || '';
        var existing = _chats.findIndex(function(x) { return x.jid === jid; });
        var chatObj = {
          jid: jid,
          name: c.name || c.subject || jid.split('@')[0] || 'Unknown',
          unreadCount: c.unreadCount || c.unread || 0,
          lastMessage: ''
        };
        if (c.lastMessage) {
          chatObj.lastMessage = c.lastMessage.message?.conversation || c.lastMessage.message?.extendedTextMessage?.text || '';
        }
        if (existing > -1) { _chats[existing] = chatObj; }
        else { _chats.push(chatObj); }
      });
      console.log('[WhatsApp] Chats actualizados: ' + _chats.length);
    });

    // messaging-history.set = ALL chats from history sync (key for initial load)
    _sock.ev.on('messaging-history.set', function(history) {
      if (!history || !history.chats || !Array.isArray(history.chats)) return;
      console.log('[WhatsApp] History sync: ' + history.chats.length + ' chats');
      _chats = history.chats.map(function(c) {
        var jid = c.id || '';
        return {
          jid: jid,
          name: c.name || c.subject || jid.split('@')[0] || 'Unknown',
          unreadCount: c.unreadCount || c.unread || 0,
          lastMessage: c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || ''
        };
      });
      console.log('[WhatsApp] Chats cargados del historial: ' + _chats.length);
    });

    _sock.ev.on('chats.update', function(updates) {
      if (!updates || !Array.isArray(updates)) return;
      updates.forEach(function(u) {
        var idx = _chats.findIndex(function(c) { return c.jid === u.id; });
        if (idx > -1) {
          if (u.name) _chats[idx].name = u.name;
          if (u.unreadCount !== undefined) _chats[idx].unreadCount = u.unreadCount;
        }
      });
    });

    _sock.ev.on('chats.delete', function(ids) {
      if (!ids || !Array.isArray(ids)) return;
      ids.forEach(function(id) {
        _chats = _chats.filter(function(c) { return c.jid !== id; });
      });
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
  // Chats arrive via events (chats.upsert), no manual fetch needed
  console.log('[WhatsApp] Chats disponibles: ' + _chats.length);
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
    if (typeof _sock.loadMessages === 'function') {
      msgs = await _sock.loadMessages(jid, limit) || [];
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
