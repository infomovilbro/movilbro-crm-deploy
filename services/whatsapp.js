const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');

var AUTH_DIR = path.join(__dirname, '..', '.whatsapp-auth');
var _sock = null;
var _qrCallback = null;
var _lastQR = null;
var _status = 'disconnected';
var _chats = [];
var _connectionAttempts = 0;
var _started = false;

function log() {
  var args = ['[WhatsApp]'].concat(Array.prototype.slice.call(arguments));
  console.log.apply(console, args);
}

function ensureDir() {
  try { if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch(e) {}
}

async function start() {
  if (_started) return;
  _started = true;
  ensureDir();
  _status = 'connecting';
  _connectionAttempts = 0;
  log('[1/5] Iniciando conexión WhatsApp...');

  try {
    log('[2/5] Obteniendo última versión de Baileys...');
    var { version } = await fetchLatestBaileysVersion();
    log('  Versión:', version.join('.'));

    log('[3/5] Cargando estado de autenticación...');
    var { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    var isRegistered = !!(state.creds && state.creds.me && state.creds.me.id);
    log('  Registrado:', isRegistered ? 'Sí (conectando directo)' : 'No (mostrando QR)');

    log('[4/5] Creando socket WhatsApp (Edge)...');
    _sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Edge', 'Movilbro CRM', '1.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: true,
      shouldSyncHistoryMessage: function() { return true; },
      emitOwnEvents: true,
    });
    log('  Socket creado');

    log('[5/5] Registrando manejadores de eventos...');

    // Guardar credenciales cuando se actualicen
    _sock.ev.on('creds.update', saveCreds);

    // Conexión: QR, estado, reconexión
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
        log('  ✅ WhatsApp CONECTADO');
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
            authFiles.forEach(function(f) {
              try { fs.unlinkSync(path.join(AUTH_DIR, f)); } catch(e) {}
            });
          } catch(e) {}
          _started = false;
          setTimeout(start, 5000);
        }
      }
    });

    // Mensajes entrantes
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

    // Chats del historial (messaging-history.set)
    _sock.ev.on('messaging-history.set', function(history) {
      if (history && history.chats) {
        _chats = (history.chats || []).map(function(c) {
          var jid = c.id || '';
          return {
            jid: jid,
            name: c.name || c.subject || jid.split('@')[0] || 'Unknown',
            unreadCount: c.unreadCount || c.unread || 0,
            lastMessage: c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || ''
          };
        });
        log('  📋 Historial cargado: ' + _chats.length + ' chats');
      }
    });

    // Chats nuevos/actualizados
    _sock.ev.on('chats.upsert', function(upserted) {
      upserted.forEach(function(c) {
        var jid = c.id || '';
        var existing = _chats.findIndex(function(x) { return x.jid === jid; });
        var chatObj = {
          jid: jid,
          name: c.name || c.subject || jid.split('@')[0] || 'Unknown',
          unreadCount: c.unreadCount || c.unread || 0,
          lastMessage: c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || ''
        };
        if (existing > -1) _chats[existing] = chatObj;
        else _chats.push(chatObj);
      });
      log('  🔄 Chats actualizados: ' + _chats.length + ' total');
    });

    _sock.ev.on('chats.update', function(updates) {
      updates.forEach(function(u) {
        var idx = _chats.findIndex(function(c) { return c.jid === u.id; });
        if (idx > -1) {
          if (u.name) _chats[idx].name = u.name;
          if (u.unreadCount !== undefined) _chats[idx].unreadCount = u.unreadCount;
        }
      });
    });

    log('✅ WhatsApp service iniciado correctamente');
  } catch(e) {
    log('❌ Error al iniciar:', e.message);
    if (e.stack) log('  Stack:', e.stack.split('\n').slice(0, 3).join('\n  '));
    _status = 'error';
    _started = false;
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
    var msgs = typeof _sock.loadMessages === 'function' ? (await _sock.loadMessages(jid, limit) || []) : [];
    return (msgs || []).map(function(m) {
      return {
        id: m.key?.id,
        fromMe: m.key?.fromMe || false,
        text: m.message?.conversation || m.message?.extendedTextMessage?.text || '',
        timestamp: m.messageTimestamp
      };
    });
  } catch(e) {
    log('getMessages error:', e.message);
    return [];
  }
}

function getChats() { return _chats; }
function getStats() { return { status: _status, chatCount: _chats.length, started: _started }; }

setTimeout(start, 1000);

module.exports = { start, getQR, removeQRCallback, getStatus, sendMessage, getMessages, getChats, getStats };
