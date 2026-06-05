const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');

var AUTH_DIR = path.join(__dirname, '..', '.whatsapp-auth');
var CHATS_PATH = path.join(__dirname, '..', '.whatsapp-chats.json');
var _sock = null;
var _qrCallback = null;
var _lastQR = null;
var _status = 'disconnected';
var _chats = [];
var _connectionAttempts = 0;
var _started = false;
var _watchdog = null;

function log() {
  var args = ['[WhatsApp]'].concat(Array.prototype.slice.call(arguments));
  console.log.apply(console, args);
}

function ensureDir() {
  try { if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch(e) {}
}

function startWatchdog() {
  if (_watchdog) clearTimeout(_watchdog);
  _watchdog = setTimeout(function() {
    if (_status === 'connecting') {
      log('⚠️ Watchdog: conexión atascada 35s, forzando reinicio...');
      try { if (_sock?.ws) _sock.ws.close(); } catch(e) {}
      _sock = null;
      _status = 'disconnected';
      _started = false;
      setTimeout(start, 1000);
    }
  }, 35000);
}

function clearWatchdog() {
  if (_watchdog) { clearTimeout(_watchdog); _watchdog = null; }
}

function saveChats() {
  try { fs.writeFileSync(CHATS_PATH, JSON.stringify(_chats), 'utf8'); } catch(e) {}
}

function loadChats() {
  try {
    if (fs.existsSync(CHATS_PATH)) {
      var data = fs.readFileSync(CHATS_PATH, 'utf8');
      _chats = JSON.parse(data) || [];
      log('  📋 Chats cargados de archivo: ' + _chats.length);
    }
  } catch(e) { log('  Error cargando chats:', e.message); }
}

function updateChatsFromEvents(events) {
  var changed = false;

  if (events['messaging-history.set'] && events['messaging-history.set'].chats) {
    var history = events['messaging-history.set'];
    _chats = (history.chats || []).map(function(c) {
      var jid = c.id || '';
      return {
        jid: jid,
        name: c.name || c.subject || jid.split('@')[0] || 'Unknown',
        unreadCount: c.unreadCount || c.unread || 0,
        lastMessage: c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || ''
      };
    });
    log('  📋 Historial: ' + _chats.length + ' chats');
    changed = true;
  }

  if (events['chats.upsert']) {
    events['chats.upsert'].forEach(function(c) {
      var jid = c.id || '';
      var idx = _chats.findIndex(function(x) { return x.jid === jid; });
      var obj = {
        jid: jid,
        name: c.name || c.subject || jid.split('@')[0] || 'Unknown',
        unreadCount: c.unreadCount || c.unread || 0,
        lastMessage: c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || ''
      };
      if (idx > -1) _chats[idx] = obj; else _chats.push(obj);
    });
    changed = true;
  }

  if (events['chats.update']) {
    events['chats.update'].forEach(function(u) {
      var idx = _chats.findIndex(function(c) { return c.jid === u.id; });
      if (idx > -1) {
        if (u.name) _chats[idx].name = u.name;
        if (u.unreadCount !== undefined) _chats[idx].unreadCount = u.unreadCount;
      }
    });
    changed = true;
  }

  if (changed) saveChats();
}

async function start() {
  if (_started) return;
  _started = true;
  ensureDir();
  _status = 'connecting';
  _connectionAttempts = 0;
  log('[1/4] Iniciando conexión WhatsApp...');

  try {
    log('[2/4] Cargando estado de autenticación...');
    var { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    var isRegistered = !!(state.creds && state.creds.me && state.creds.me.id);
    log('  Registrado:', isRegistered ? 'Sí (conectando directo)' : 'No (mostrando QR)');
    if (isRegistered) loadChats();

    log('[3/4] Creando socket...');
    _sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['Edge', 'Movilbro CRM', '1.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: true,
      shouldSyncHistoryMessage: function() { return true; },
      emitOwnEvents: true,
    });
    log('  Socket creado');

    startWatchdog();

    log('[4/4] Registrando manejadores...');

    _sock.ev.process(function(events) { updateChatsFromEvents(events); });
    _sock.ev.on('creds.update', saveCreds);

    _sock.ev.on('connection.update', function(update) {
      var { qr, connection, lastDisconnect, isNewLogin } = update;

      if (qr) {
        _lastQR = qr;
        log('  📱 QR generado, esperando escaneo...');
        if (_qrCallback) {
          qrcode.toDataURL(qr, { width: 300, margin: 2 }, function(err, url) {
            if (!err && _qrCallback) _qrCallback({ type: 'qr', data: url });
          });
        }
      }

      if (isNewLogin) {
        log('  ✅ Nuevo login exitoso');
        _lastQR = null;
      }

      if (connection === 'open') {
        _status = 'connected';
        _connectionAttempts = 0;
        clearWatchdog();
        log('  ✅ WhatsApp CONECTADO');
        if (_chats.length === 0) loadChats();
        if (_qrCallback) _qrCallback({ type: 'status', data: 'connected' });
      }

      if (connection === 'close') {
        var reason = lastDisconnect?.error?.output?.statusCode || 0;
        var isLoggedOut = reason === DisconnectReason.loggedOut;
        _status = 'disconnected';
        _sock = null;
        _lastQR = null;
        log('  ❌ Desconectado' + (isLoggedOut ? ' (sesión cerrada)' : ''));
        if (_qrCallback) _qrCallback({ type: 'status', data: 'disconnected' });
        if (!isLoggedOut) {
          _connectionAttempts++;
          var delay = Math.min(5000 * _connectionAttempts, 60000);
          log('  🔄 Reintentando en ' + Math.round(delay/1000) + 's (intento #' + _connectionAttempts + ')');
          _started = false;
          setTimeout(start, delay);
        } else {
          log('  🚪 Sesión cerrada, limpiando auth...');
          try {
            var authFiles = fs.readdirSync(AUTH_DIR);
            authFiles.forEach(function(f) { try { fs.unlinkSync(path.join(AUTH_DIR, f)); } catch(e) {} });
          } catch(e) {}
          try { if (fs.existsSync(CHATS_PATH)) fs.unlinkSync(CHATS_PATH); } catch(e) {}
          _started = false;
          setTimeout(start, 5000);
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
                log('  💬 Mensaje de', sender + ':', text.substring(0, 80));
              }
            }
          }
        } catch(e) { log('  Error msg:', e.message); }
      }
    });

    log('✅ WhatsApp service iniciado correctamente');
  } catch(e) {
    log('❌ Error al iniciar:', e.message);
    if (e.stack) log('  Stack:', e.stack.split('\n').slice(0, 3).join('\n  '));
    _status = 'error';
    _started = false;
    clearWatchdog();
    setTimeout(start, 15000);
  }
}

function getQR(callback) {
  _qrCallback = callback;
  if (_status === 'connected') {
    callback({ type: 'status', data: 'connected' });
    return;
  }
  if (_lastQR) {
    qrcode.toDataURL(_lastQR, { width: 300, margin: 2 }, function(err, url) {
      if (!err && _qrCallback) _qrCallback({ type: 'qr', data: url });
    });
  }
  if (!_sock) {
    if (_started) {
      log('Esperando conexión...');
    } else {
      log('Iniciando conexión...');
      start();
    }
  }
}

function removeQRCallback() { _qrCallback = null; }
function getStatus() { return _status; }

async function sendMessage(jid, text) {
  if (!_sock) throw new Error('WhatsApp no conectado');
  return await _sock.sendMessage(jid, { text: text });
}

async function getMessages(jid, limit) {
  if (!_sock) return [];
  limit = limit || 50;
  try {
    if (_store && typeof _store.loadMessages === 'function') {
      return (await _store.loadMessages(jid, limit) || []).map(function(m) {
        return {
          id: m.key?.id,
          fromMe: m.key?.fromMe || false,
          text: m.message?.conversation || m.message?.extendedTextMessage?.text || '',
          timestamp: m.messageTimestamp
        };
      });
    }
    return [];
  } catch(e) {
    log('getMessages error:', e.message);
    return [];
  }
}

function getChats() { return _chats; }
function getStats() { return { status: _status, chatCount: _chats.length, started: _started }; }

function forceReconnect() {
  log('🔄 Forzando reconexión...');
  clearWatchdog();
  try { if (_sock?.ws) _sock.ws.close(); } catch(e) {}
  _sock = null;
  _status = 'disconnected';
  _started = false;
  _connectionAttempts = 0;
  setTimeout(start, 500);
}

async function resetAuth() {
  log('🧹 Limpiando autenticación WhatsApp (logout)...');
  clearWatchdog();
  _chats = [];
  try { if (fs.existsSync(CHATS_PATH)) fs.unlinkSync(CHATS_PATH); } catch(e) {}
  // Usar logout() de baileys que envía remove-companion-device a WhatsApp
  if (_sock && typeof _sock.logout === 'function') {
    try { await _sock.logout(); log('  Logout enviado a WhatsApp'); } catch(e) { log('  Error logout:', e.message); }
  } else {
    // Fallback: cerrar socket y limpiar auth manual
    try { if (_sock?.ws) _sock.ws.close(); } catch(e) {}
    _sock = null;
    _status = 'disconnected';
    _started = false;
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.readdirSync(AUTH_DIR).forEach(function(f) { try { fs.unlinkSync(path.join(AUTH_DIR, f)); } catch(e) {} });
      }
    } catch(e) {}
    setTimeout(start, 1000);
  }
  // logout() dispara connection.update con loggedOut, que maneja la limpieza y reinicio
}

setTimeout(start, 1000);

module.exports = { start, getQR, removeQRCallback, getStatus, sendMessage, getMessages, getChats, getStats, forceReconnect, resetAuth };
