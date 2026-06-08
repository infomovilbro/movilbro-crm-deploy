// WhatsApp Baileys v7 - Server-side WhatsApp integration
// Generates QR code and monitors messages entirely on the server
const { db } = require('./database');
const QR = require('qrcode');
const fs = require('fs');
const path = require('path');

var sock = null;
var qrCodeData = null;
var isConnected = false;
var connectionState = 'idle';
var lastError = '';
var authDir = '/tmp/baileys-auth';

var credsFilePath = path.join(__dirname, 'data', 'baileys_creds.json');

function saveSession(state) {
  try {
    var data = { creds: state.creds, keys: state.keys };
    // DB backup
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('baileys_session', JSON.stringify(data));
    // File backup (persiste entre reinicios del mismo deploy)
    try {
      var dir = path.join(__dirname, 'data');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(credsFilePath, JSON.stringify(data));
    } catch(e2) { lastError = 'File save: ' + e2.message; }
  } catch(e) { lastError = 'Save: ' + e.message; }
}

function loadSession() {
  try {
    // Try file first (persiste entre reinicios)
    if (fs.existsSync(credsFilePath)) {
      var data = JSON.parse(fs.readFileSync(credsFilePath, 'utf-8'));
      if (data && data.creds) return data;
    }
    // Fallback to DB
    var row = db.prepare("SELECT value FROM settings WHERE key = 'baileys_session'").get();
    if (row) return JSON.parse(row.value);
  } catch(e) { return null; }
  return null;
}

async function initBaileys() {
  try {
    var baileys = await import('@whiskeysockets/baileys');
    var makeWASocket = baileys.default || baileys.makeWASocket;
    var DisconnectReason = baileys.DisconnectReason;
    var useMultiFileAuthState = baileys.useMultiFileAuthState;
    
    // Create temp dir for auth files
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    
    // Restore session from DB to temp dir
    var saved = loadSession();
    if (saved && saved.creds) {
      try {
        fs.writeFileSync(path.join(authDir, 'creds.json'), JSON.stringify(saved.creds));
        if (saved.keys) {
          Object.keys(saved.keys).forEach(function(k) {
            var dir = path.join(authDir, k.replace(/:/g, '-'));
            fs.mkdirSync(dir, { recursive: true });
            var keysData = saved.keys[k];
            if (typeof keysData === 'object') {
              Object.keys(keysData).forEach(function(id) {
                fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(keysData[id]));
              });
            }
          });
        }
        console.log('[Baileys] Session restored');
      } catch(e) { console.log('[Baileys] Restore error:', e.message); }
    }
    
    // Use Baileys' built-in auth state manager
    var { state, saveCreds } = await useMultiFileAuthState(authDir);
    
    // Wrap saveCreds to also persist to DB
    var origSaveCreds = saveCreds;
    var wrappedSaveCreds = async function() {
      try { if (origSaveCreds) await origSaveCreds(); } catch(e) {}
      try {
        var credsData = JSON.parse(fs.readFileSync(path.join(authDir, 'creds.json'), 'utf-8'));
        var keysData = {};
        var items = fs.readdirSync(authDir);
        items.forEach(function(item) {
          if (item !== 'creds.json') {
            var itemPath = path.join(authDir, item);
            if (fs.statSync(itemPath).isDirectory()) {
              var files = fs.readdirSync(itemPath);
              keysData[item.replace(/-/g, ':')] = {};
              files.forEach(function(f) {
                var id = f.replace('.json', '');
                keysData[item.replace(/-/g, ':')][id] = JSON.parse(fs.readFileSync(path.join(itemPath, f), 'utf-8'));
              });
            }
          }
        });
        var fullData = { creds: credsData, keys: keysData };
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('baileys_session', JSON.stringify(fullData));
        try { fs.writeFileSync(credsFilePath, JSON.stringify(fullData)); } catch(e2) {}
      } catch(e) { lastError = 'DB save: ' + e.message; }
    };
    
    var pinoMod = await import('pino');
    var logger = (pinoMod.default || pinoMod)({ level: 'warn' });
    
    sock = makeWASocket({
      auth: state,
      logger: logger,
      printQRInTerminal: false,
      browser: ['Movilbro CRM', 'Chrome', '149.0.0.0'],
      syncFullHistory: false,
      shouldSyncHistoryMessage: function() { return false; }
    });
    
    // Persist creds on every update
    sock.ev.on('creds.update', wrappedSaveCreds);
    
    sock.ev.on('connection.update', function(update) {
      var { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrCodeData = qr;
        connectionState = 'qr';
        isConnected = false;
        console.log('[Baileys] QR generated');
      }
      
      if (connection === 'open') {
        isConnected = true;
        connectionState = 'connected';
        qrCodeData = null;
        wrappedSaveCreds();
        console.log('[Baileys] Connected!');
      }
      
      if (connection === 'close') {
        isConnected = false;
        connectionState = 'error';
        var reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message || 'unknown';
        lastError = 'DC: ' + reason;
        console.log('[Baileys] Disconnected:', reason);
        
        if (reason === 401) {
          db.prepare("DELETE FROM settings WHERE key = 'baileys_session'").run();
          connectionState = 'idle';
        } else {
          setTimeout(initBaileys, 5000);
        }
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
      var phone = from.split('@')[0] || '';
      var name = msg.pushName || phone;
      console.log('[Baileys] Msg:', name, ':', text.substring(0, 80));
      
      try {
        db.prepare("INSERT INTO pending_messages (source, from_name, from_address, body, proposed_response, status, category) VALUES (?,?,?,?,?,'pending','whatsapp')").run('baileys', name, from, text, 'Analizando con IA...');
      } catch(e) { lastError = 'Save msg: ' + e.message; }
    });
    
    // Exponer sock para sendMessage
    module.exports.sockRef = function() { return sock; };
    module.exports.sendMessage = sendBaileysMessage;
    
  } catch(e) {
    connectionState = 'error';
    lastError = e.message;
    console.error('[Baileys] Fatal error:', e.stack);
  }
}

async function getQRDataURL() {
  if (!qrCodeData) return null;
  try { return await QR.toDataURL(qrCodeData, { width: 300, margin: 2 }); } catch(e) { return null; }
}

function getStatus() {
  return { connected: isConnected, state: connectionState, hasQR: !!qrCodeData, error: lastError };
}

async function sendBaileysMessage(jid, text) {
  if (!sock) return { ok: false, error: 'Baileys no iniciado' };
  try {
    await sock.sendMessage(jid, { text: text });
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { initBaileys, getQRDataURL, getStatus, sendMessage: sendBaileysMessage };
