// WhatsApp Baileys v7 - pure JS WhatsApp implementation
const { db } = require('./database');
const QR = require('qrcode');
const path = require('path');
const fs = require('fs');

var sock = null;
var qrCodeData = null;
var isConnected = false;
var connectionState = 'idle';
var lastError = '';

function saveSession(state) {
  try {
    var data = { creds: state.creds, keys: state.keys };
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('baileys_session', JSON.stringify(data));
  } catch(e) { lastError = 'Save session: ' + e.message; }
}

function loadSession() {
  try {
    var row = db.prepare("SELECT value FROM settings WHERE key = 'baileys_session'").get();
    return row ? JSON.parse(row.value) : null;
  } catch(e) { return null; }
}

async function initBaileys() {
  try {
    var baileys = await import('@whiskeysockets/baileys');
    var makeWASocket = baileys.default || baileys.makeWASocket;
    var DisconnectReason = baileys.DisconnectReason;
    var initAuthCreds = baileys.initAuthCreds;
    
    // Restore or create auth state
    var saved = loadSession();
    var creds, keys;
    
    if (saved && saved.creds && saved.creds.me) {
      creds = saved.creds;
      keys = saved.keys || {};
      console.log('[Baileys] Session restored for', creds.me.id);
    } else {
      var newState = initAuthCreds();
      creds = newState.creds;
      keys = newState.keys || {};
      // Set a placeholder me to avoid crash
      if (!creds.me) creds.me = { id: 'temp_' + Date.now() };
      saveSession({ creds, keys });
      console.log('[Baileys] New session created');
    }
    
    // Use BufferJSON for serialization
    var BufferJSON = baileys.BufferJSON;
    
    var authState = {
      state: { creds: creds, keys: keys },
      saveState: function() {
        saveSession({ creds: this.state.creds, keys: this.state.keys });
      }
    };
    
    var pinoMod = await import('pino');
    var logger = (pinoMod.default || pinoMod)({ level: 'warn' });
    
    sock = makeWASocket({
      auth: authState,
      logger: logger,
      printQRInTerminal: false,
      browser: ['Movilbro CRM', 'Chrome', '149.0.0.0'],
      syncFullHistory: false,
      shouldSyncHistoryMessage: function() { return false; }
    });
    
    sock.ev.on('connection.update', function(update) {
      var { connection, lastDisconnect, qr } = update;
      if (qr) { qrCodeData = qr; connectionState = 'qr'; isConnected = false; console.log('[Baileys] QR generado'); }
      if (connection === 'open') { isConnected = true; connectionState = 'connected'; qrCodeData = null; authState.save(); console.log('[Baileys] Conectado!'); }
      if (connection === 'close') {
        isConnected = false; connectionState = 'error';
        var reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message || 'unknown';
        lastError = 'Disconnected: ' + reason;
        console.log('[Baileys] Desconectado:', reason);
        if (reason === 401) { db.prepare("DELETE FROM settings WHERE key = 'baileys_session'").run(); connectionState = 'idle'; }
        else setTimeout(initBaileys, 5000);
      }
    });
    
    sock.ev.on('messages.upsert', function(m) {
      if (!m.messages || !m.messages.length) return;
      var msg = m.messages[0];
      if (msg.key.fromMe) return;
      if (msg.key.remoteJid === 'status@broadcast') return;
      if (!msg.message) return;
      
      var text = msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';
      if (!text) return;
      
      var from = msg.key.remoteJid || '';
      var name = msg.pushName || 'WhatsApp';
      console.log('[Baileys] Msg:', name, ':', text.substring(0, 80));
      
      try {
        var sender = name + ' (' + (from.split('@')[0] || 'unknown') + ')';
        db.prepare("INSERT INTO pending_messages (source, from_name, from_address, body, proposed_response, status, category) VALUES (?,?,?,?,?,'pending','whatsapp')").run('baileys', sender, from, text, 'Recibido de WhatsApp');
      } catch(e) { lastError = 'Save msg: ' + e.message; }
    });
    
    // Auto-save session every 60s
    setInterval(function() { if (isConnected) authState.save(); }, 60000);
    
  } catch(e) {
    connectionState = 'error';
    lastError = e.message;
    console.error('[Baileys] Error:', e);
  }
}

function getQRDataURL() {
  if (!qrCodeData) return null;
  try { return QR.toDataURL(qrCodeData, { width: 300, margin: 2 }); } catch(e) { return null; }
}

function getStatus() {
  return { connected: isConnected, state: connectionState, hasQR: !!qrCodeData, error: lastError };
}

module.exports = { initBaileys, getQRDataURL, getStatus, isConnected: function() { return isConnected; }, getSocket: function() { return sock; } };
