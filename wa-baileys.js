// WhatsApp Baileys v7 - pure JS WhatsApp implementation (server-side)
const { db } = require('./database');
const QR = require('qrcode');

var sock = null;
var qrCodeData = null;
var isConnected = false;
var connectionState = 'idle';
var lastError = '';

function saveSession(data) {
  try { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('baileys_session', JSON.stringify(data)); } catch(e) { lastError = 'Save session: ' + e.message; }
}

function loadSession() {
  try { var row = db.prepare("SELECT value FROM settings WHERE key = 'baileys_session'").get(); return row ? JSON.parse(row.value) : null; } catch(e) { return null; }
}

async function initBaileys() {
  try {
    var baileysMod = await import('@whiskeysockets/baileys');
    var makeWASocket = baileysMod.default || baileysMod.makeWASocket;
    var DisconnectReason = baileysMod.DisconnectReason;
    var initAuthCreds = baileysMod.initAuthCreds;
    
    var savedSession = loadSession();
    var auth = savedSession ? { creds: savedSession.creds, keys: savedSession.keys } : null;
    
    var authState = {
      state: auth || initAuthCreds(),
      saveState: function() { saveSession(authState.state); }
    };
    
    if (!auth) authState.saveState();
    
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
      if (qr) { qrCodeData = qr; connectionState = 'qr'; isConnected = false; console.log('[Baileys] QR ready'); }
      if (connection === 'open') { isConnected = true; connectionState = 'connected'; qrCodeData = null; console.log('[Baileys] Conectado!'); }
      if (connection === 'close') {
        isConnected = false; connectionState = 'error';
        var reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message || 'unknown';
        lastError = 'Disconnected: ' + reason;
        console.log('[Baileys] Desconectado:', reason);
        if (reason !== 401) setTimeout(initBaileys, 5000);
        else { db.prepare("DELETE FROM settings WHERE key = 'baileys_session'").run(); connectionState = 'idle'; }
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
        console.log('[Baileys] Saved pending #' + (db.prepare("SELECT last_insert_rowid()").get()).last_insert_rowid());
      } catch(e) { lastError = 'Save msg: ' + e.message; }
    });
    
  } catch(e) {
    connectionState = 'error';
    lastError = e.message + (e.stack ? ' ' + e.stack.substring(0, 200) : '');
    console.error('[Baileys] Init error:', e);
  }
}

function getQRDataURL() {
  if (!qrCodeData) return null;
  try { return QR.toDataURL(qrCodeData, { width: 300, margin: 2 }); } catch(e) { return null; }
}

function getStatus() {
  return { connected: isConnected, state: connectionState, hasQR: !!qrCodeData, error: lastError };
}

module.exports = { initBaileys, getQRDataURL, getStatus, isConnected: function() { return isConnected; } };
