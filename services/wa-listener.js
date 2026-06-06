// Escuchador silencioso de WhatsApp - solo recibe mensajes, sin UI ni envío
// Usa Baileys en background, las respuestas se dan desde web.whatsapp.com real

const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');

var AUTH_DIR = path.join(__dirname, '..', '.wa-listener-auth');
var _sock = null;
var _status = 'stopped';
var _qrBuffer = null;
var _qrCallbacks = [];
var STARTING = false;

function emitQR(dataUrl) {
  _qrCallbacks.forEach(function(cb) { try { cb(dataUrl); } catch(e) {} });
}

async function start() {
  if (STARTING) return;
  STARTING = true;
  _status = 'starting';
  
  try {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    var { version } = await fetchLatestBaileysVersion();
    var { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    
    _sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Movilbro Listener', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      shouldSyncHistoryMessage: function() { return false; }
    });
    
    _sock.ev.on('creds.update', saveCreds);
    
    _sock.ev.on('connection.update', function(update) {
      var { connection, lastDisconnect, qr } = update;
      if (qr) {
        _status = 'awaiting_qr';
        var qrcode = require('qrcode');
        qrcode.toDataURL(qr, { width: 300, margin: 2 }, function(err, url) {
          if (!err) { _qrBuffer = url; emitQR(url); }
        });
      }
      if (connection === 'open') {
        _status = 'connected';
        console.log('[WA-Listener] Conectado a WhatsApp');
        _qrBuffer = null;
      }
      if (connection === 'close') {
        var code = lastDisconnect?.error?.output?.statusCode || 0;
        _sock = null;
        _status = 'disconnected';
        STARTING = false;
        if (code === DisconnectReason.loggedOut) {
          try { if (fs.existsSync(AUTH_DIR)) { fs.readdirSync(AUTH_DIR).forEach(function(f) { try { fs.unlinkSync(path.join(AUTH_DIR, f)); } catch(e) {} }); } } catch(e) {}
          setTimeout(start, 3000);
        } else {
          setTimeout(start, 5000);
        }
      }
    });
    
    // Solo recibir mensajes - nada más
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
                var id = db.prepare("INSERT INTO pending_messages (source, from_name, from_address, body, proposed_response, status, category, created_at) VALUES (?,?,?,?,?,'pending','whatsapp',datetime('now','localtime'))").run('whatsapp', sender, sender, text, 'Analizando con IA...');
                console.log('[WA-Listener] Mensaje de', sender, '→ pendiente #' + id.lastInsertRowid);
              }
            }
          }
        } catch(e) { console.error('[WA-Listener] Error:', e.message); }
      }
    });
    
    console.log('[WA-Listener] Iniciado');
  } catch(e) {
    console.error('[WA-Listener] Error:', e.message);
    _status = 'error';
    STARTING = false;
    setTimeout(start, 15000);
  }
  STARTING = false;
}

function getStatus() { return _status; }
function getQR() { return _qrBuffer; }
function onQR(cb) { _qrCallbacks.push(cb); return function() { _qrCallbacks = _qrCallbacks.filter(function(c) { return c !== cb; }); }; }

function reset() {
  if (_sock && typeof _sock.logout === 'function') { try { _sock.logout(); } catch(e) {} }
  _sock = null;
  _status = 'disconnected';
  _qrBuffer = null;
  STARTING = false;
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.readdirSync(AUTH_DIR).forEach(function(f) { try { fs.unlinkSync(path.join(AUTH_DIR, f)); } catch(e) {} });
    }
  } catch(e) {}
  setTimeout(start, 1000);
}

setTimeout(start, 1000);

module.exports = { start, getStatus, getQR, onQR, reset };
