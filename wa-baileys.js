const { db } = require('./database');
const QR = require('qrcode');

var sock = null;
var qrCodeData = null;
var isConnected = false;
var connectionState = 'idle';
var lastError = '';

function saveSession(state) {
  try { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('baileys_session', JSON.stringify(state)); } catch(e) {}
}

function loadSession() {
  try { var r = db.prepare("SELECT value FROM settings WHERE key = 'baileys_session'").get(); return r ? JSON.parse(r.value) : null; } catch(e) { return null; }
}

async function initBaileys() {
  try {
    var M = await import('@whiskeysockets/baileys');
    var makeWASocket = M.default || M.makeWASocket;
    var DisconnectReason = M.DisconnectReason;
    var useMultiFileAuthState = M.useMultiFileAuthState;
    
    var saved = loadSession();
    var { state, saveState } = await useMultiFileAuthState('/tmp/baileys-' + Date.now());
    
    // If we have saved creds, restore them over the new state
    if (saved && saved.creds && saved.creds.me) {
      try {
        var fs = await import('fs');
        // Overwrite creds.json with saved data
        var authDir = Object.keys(state)[0] ? '/tmp/baileys-' : '/tmp/baileys-';
        // Actually, useMultiFileAuthState returns state with creds already loaded
        // Just use the saved state directly
        state.creds = saved.creds;
        state.keys = saved.keys || {};
      } catch(e) { lastError = 'Restore: ' + e.message; }
    }
    
    // Override saveState to also persist in DB
    var origSave = saveState;
    saveState = function() { 
      try { origSave(); var d = { creds: state.creds, keys: state.keys }; db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('baileys_session', JSON.stringify(d)); } catch(e) {}
    };
    
    var pinoMod = await import('pino');
    var logger = (pinoMod.default || pinoMod)({ level: 'warn' });
    
    sock = makeWASocket({
      auth: { state, saveState },
      logger: logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: function() { return false; },
      browser: ['Movilbro CRM', 'Chrome', '149.0.0.0']
    });
    
    sock.ev.on('connection.update', function(u) {
      if (u.qr) { qrCodeData = u.qr; connectionState = 'qr'; isConnected = false; console.log('[Baileys] QR ready'); }
      if (u.connection === 'open') { isConnected = true; connectionState = 'connected'; qrCodeData = null; saveState(); console.log('[Baileys] Conectado!'); }
      if (u.connection === 'close') {
        isConnected = false; connectionState = 'error';
        var r = u.lastDisconnect?.error?.output?.statusCode || u.lastDisconnect?.error?.message || 'unknown';
        lastError = 'DC: ' + r; console.log('[Baileys] Desconectado:', r);
        if (r === 401) { db.prepare("DELETE FROM settings WHERE key = 'baileys_session'").run(); connectionState = 'idle'; }
        else setTimeout(initBaileys, 5000);
      }
    });
    
    sock.ev.on('messages.upsert', function(m) {
      if (!m.messages || !m.messages.length) return;
      var msg = m.messages[0];
      if (msg.key.fromMe || !msg.message || msg.key.remoteJid === 'status@broadcast') return;
      var text = msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';
      if (!text) return;
      console.log('[Baileys] Msg:', msg.pushName || '?', ':', text.substring(0, 80));
      try {
        var sender = (msg.pushName || 'WA') + ' (' + (msg.key.remoteJid?.split('@')[0] || '?') + ')';
        db.prepare("INSERT INTO pending_messages (source, from_name, from_address, body, proposed_response, status, category) VALUES (?,?,?,?,?,'pending','whatsapp')").run('baileys', sender, msg.key.remoteJid, text, 'Recibido');
      } catch(e) { lastError = 'Save: ' + e.message; }
    });
    
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

module.exports = { initBaileys, getQRDataURL, getStatus };
