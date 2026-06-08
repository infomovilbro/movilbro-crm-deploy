// WhatsApp Baileys v7 integration - ESM is loaded via dynamic import
// Runs entirely on server, no browser needed

const { db } = require('./database');
const QR = require('qrcode');

var sock = null;
var qrCodeData = null;
var isConnected = false;
var connectionState = 'idle'; // idle | qr | connecting | connected | error

// Session persistence - store in DB settings table
function saveSession(data) {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('baileys_session', JSON.stringify(data));
  } catch(e) {
    console.error('[Baileys] Error saving session:', e.message);
  }
}

function loadSession() {
  try {
    var row = db.prepare("SELECT value FROM settings WHERE key = 'baileys_session'").get();
    return row ? JSON.parse(row.value) : null;
  } catch(e) {
    return null;
  }
}

// Initialize Baileys
async function initBaileys() {
  try {
    var { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = await import('@whiskeysockets/baileys');
    var { Boom } = await import('@hapi/boom');
    
    var savedSession = loadSession();
    var auth = savedSession ? { creds: savedSession.creds, keys: savedSession.keys } : null;
    
    // Use in-memory auth state with DB persistence
    var authState = {
      state: auth || { creds: null, keys: {} },
      saveState: function() {
        saveSession(authState.state);
      }
    };
    
    if (!auth) {
      // Generate new creds
      var { initAuthCreds, BufferJSON } = await import('@whiskeysockets/baileys');
      authState.state = initAuthCreds();
      authState.saveState();
    }
    
    var logger = (await import('pino'))({ level: 'warn' });
    
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
      
      if (qr) {
        qrCodeData = qr;
        connectionState = 'qr';
        isConnected = false;
        console.log('[Baileys] QR code generated');
      }
      
      if (connection) {
        console.log('[Baileys] Connection:', connection);
        if (connection === 'open') {
          isConnected = true;
          connectionState = 'connected';
          qrCodeData = null;
          console.log('[Baileys] Connected to WhatsApp');
        } else if (connection === 'close') {
          isConnected = false;
          connectionState = 'error';
          var reason = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : lastDisconnect?.error?.message || 'unknown';
          console.log('[Baileys] Disconnected:', reason);
          
          // Reconnect after 5s unless logged out
          if (reason !== DisconnectReason.loggedOut) {
            setTimeout(initBaileys, 5000);
          } else {
            // Clear session if logged out
            db.prepare("DELETE FROM settings WHERE key = 'baileys_session'").run();
            connectionState = 'idle';
          }
        }
      }
    });
    
    // Listen for messages
    sock.ev.on('messages.upsert', function(m) {
      if (!m.messages || !m.messages.length) return;
      var msg = m.messages[0];
      
      // Skip own messages, status updates, etc
      if (msg.key.fromMe) return;
      if (msg.key.remoteJid === 'status@broadcast') return;
      
      var text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      if (!text) return;
      
      var from = msg.key.remoteJid || 'unknown';
      var pushName = msg.pushName || 'WhatsApp User';
      
      console.log('[Baileys] Message from', pushName, ':', text.substring(0, 80));
      
      // Save to pending_messages
      try {
        var sender = pushName + ' (' + from.split('@')[0] + ')';
        db.prepare("INSERT INTO pending_messages (source, from_name, from_address, body, proposed_response, status, category) VALUES (?,?,?,?,?,'pending','whatsapp')").run('baileys', sender, from, text, 'Recibido de WhatsApp. Analizando...');
        console.log('[Baileys] Saved pending #' + db.prepare("SELECT last_insert_rowid()").get()['last_insert_rowid()']);
      } catch(e) {
        console.error('[Baileys] Error saving message:', e.message);
      }
    });
    
    // Periodic session save
    setInterval(function() {
      if (isConnected) authState.saveState();
    }, 60000);
    
  } catch(e) {
    console.error('[Baileys] Init error:', e.message);
    connectionState = 'error';
  }
}

// Get QR code as data URL
function getQRDataURL() {
  if (!qrCodeData) return null;
  try {
    return QR.toDataURL(qrCodeData, { width: 300, margin: 2 });
  } catch(e) {
    return null;
  }
}

// Status
function getStatus() {
  return {
    connected: isConnected,
    state: connectionState,
    hasQR: !!qrCodeData
  };
}

module.exports = { initBaileys, getQRDataURL, getStatus, isConnected: function() { return isConnected; }, getSocket: function() { return sock; } };
