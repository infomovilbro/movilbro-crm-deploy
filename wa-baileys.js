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

function saveSession(state) {
  try {
    var data = { creds: state.creds, keys: state.keys };
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('baileys_session', JSON.stringify(data));
  } catch(e) { lastError = 'Save: ' + e.message; }
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
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('baileys_session', JSON.stringify({ creds: credsData, keys: keysData }));
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
      m.messages.forEach(function(msg) {
        if (msg.key.fromMe) return;
        if (msg.key.remoteJid === 'status@broadcast') return;
        if (!msg.message) return;
        
        var from = msg.key.remoteJid || '';
        var phone = from.split('@')[0] || '';
        var name = msg.pushName || phone;
        
        // Guardar quoted_data para poder reenviar con contexto
        var quotedData = null;
        try {
          quotedData = JSON.stringify({ key: msg.key, message: msg.message });
        } catch(e) {}
        
        // Detectar si es mensaje de audio
        var audioMsg = msg.message.audioMessage;
        if (audioMsg) {
          var seconds = audioMsg.seconds || 0;
          console.log('[Baileys] Audio de', name, ':', seconds + 's');
          
          // Guardar pendiente mientras se transcribe
          var pendingBody = '🎤 Mensaje de audio (' + Math.round(seconds) + 's) — transcribiendo...';
          try {
            var info = db.prepare("INSERT INTO pending_messages (source, from_name, from_address, body, proposed_response, status, category, quoted_data) VALUES (?,?,?,?,?,'pending','whatsapp',?)").run('baileys', name, from, pendingBody, null, quotedData);
            var pendingId = info.lastInsertRowid;
            
            // Transcribir en background
            transcribeAudioMessage(msg, from, name, pendingId);
          } catch(e) { lastError = 'Save audio msg: ' + e.message; }
          return;
        }
        
        var text = msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';
        if (!text) return;
        
        console.log('[Baileys] Msg:', name, ':', text.substring(0, 80));
        
        try {
          db.prepare("INSERT INTO pending_messages (source, from_name, from_address, body, proposed_response, status, category, quoted_data) VALUES (?,?,?,?,?,'pending','whatsapp',?)").run('baileys', name, from, text, null, quotedData);
        } catch(e) { lastError = 'Save msg: ' + e.message; }
      });
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

async function sendBaileysMessage(jid, content, options) {
  if (!sock) return { ok: false, error: 'Baileys no iniciado' };
  try {
    var opts = {};
    if (options && options.quotedData) {
      try {
        var quoted = JSON.parse(options.quotedData);
        if (quoted && quoted.key) opts.quoted = quoted;
      } catch(e) {}
    }
    
    // Si es audio, enviar como audio
    if (options && options.asAudio && content.audioBuffer) {
      await sock.sendMessage(jid, { audio: content.audioBuffer, mimetype: content.mimeType || 'audio/mp3', ptt: true }, opts);
      return { ok: true, type: 'audio' };
    }
    
    // Si es documento (PDF), enviar como archivo
    if (options && options.asDocument && content.documentBuffer) {
      await sock.sendMessage(jid, { 
        document: content.documentBuffer, 
        mimetype: content.mimeType || 'application/pdf', 
        fileName: content.fileName || 'documento.pdf'
      }, opts);
      return { ok: true, type: 'document', fileName: content.fileName };
    }
    
    // Por defecto, enviar como texto
    var text = typeof content === 'string' ? content : (content.text || '');
    await sock.sendMessage(jid, { text: text }, opts);
    return { ok: true, type: 'text' };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function transcribeAudioMessage(msg, from, name, pendingId) {
  try {
    var baileys = await import('@whiskeysockets/baileys');
    var downloadContentFromMessage = baileys.downloadContentFromMessage;
    
    var audioMsg = msg.message.audioMessage;
    if (!audioMsg) return;
    
    var stream = await downloadContentFromMessage(audioMsg, 'audio');
    var chunks = [];
    for await (var chunk of stream) { chunks.push(chunk); }
    var audioBuffer = Buffer.concat(chunks);
    
    var transcription = require('./services/transcription');
    var result = await transcription.transcribeAudio(audioBuffer, audioMsg.mimetype || 'audio/ogg');
    
    if (result.text) {
      var transcriptBody = '🎤 ' + result.text;
      db.prepare("UPDATE pending_messages SET body=?, proposed_response=null WHERE id=?").run(transcriptBody, pendingId);
      console.log('[Baileys] Audio transcrito:', result.text.substring(0, 100));
    } else {
      db.prepare("UPDATE pending_messages SET body=?, proposed_response=null WHERE id=?").run('🎤 Audio no transcrito: ' + (result.error || 'error desconocido'), pendingId);
      console.log('[Baileys] Error transcripción:', result.error);
    }
  } catch(e) {
    console.error('[Baileys] Error transcribiendo audio:', e.message);
    try {
      db.prepare("UPDATE pending_messages SET body=?, proposed_response=null WHERE id=?").run('🎤 Error al procesar audio: ' + e.message, pendingId);
    } catch(e2) {}
  }
}

async function getChats() {
  if (!sock) return { ok: false, error: 'Baileys no iniciado' };
  try {
    var chatList = [];
    // Intentar obtener chats de la memoria de Baileys
    if (sock.chats && typeof sock.chats.all === 'function') {
      chatList = sock.chats.all();
    } else if (sock.store && typeof sock.store.chats === 'object') {
      chatList = Object.values(sock.store.chats);
    }
    // Ordenar por última actividad
    chatList.sort(function(a, b) { return (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0); });
    // Máximo 50 chats
    var result = chatList.slice(0, 50).map(function(c) {
      var jid = c.id || c.jid || '';
      return {
        jid: jid,
        name: c.name || c.formattedTitle || jid.split('@')[0] || 'Desconocido',
        lastMessage: (c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || '').substring(0, 80),
        unreadCount: c.unreadCount || 0,
        timestamp: c.conversationTimestamp || null
      };
    });
    return { ok: true, chats: result };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function getChatMessages(jid, count) {
  if (!sock) return { ok: false, error: 'Baileys no iniciado' };
  try {
    var limit = Math.min(count || 50, 200);
    var messages = [];
    
    // 1. Intentar desde Baileys en memoria
    try {
      if (typeof sock.loadMessages === 'function') {
        messages = await sock.loadMessages(jid, limit);
      } else if (sock.store && typeof sock.store.loadMessages === 'function') {
        messages = await sock.store.loadMessages(jid, limit);
      }
    } catch(e) {}
    
    // 2. Fallback: cargar desde la DB local
    if (messages.length === 0) {
      try {
        var db = require('./database');
        var rows = db.db.prepare("SELECT * FROM pending_messages WHERE from_address=? AND source='baileys' ORDER BY created_at ASC LIMIT ?").all(jid, limit);
        messages = rows.map(function(r) {
          return {
            key: { fromMe: false, id: String(r.id) },
            message: { conversation: r.body || '' },
            messageTimestamp: r.created_at ? Math.floor(new Date(r.created_at).getTime() / 1000) : null,
            pushName: r.from_name || ''
          };
        });
      } catch(e) {}
    }
    
    // 3. Construir resultado
    var result = messages.map(function(m) {
      var text = m.message?.conversation || m.message?.extendedTextMessage?.text || 
                 m.message?.imageMessage?.caption || m.message?.videoMessage?.caption || '';
      return {
        id: m.key?.id || m.id || '',
        fromMe: m.key?.fromMe || false,
        text: text.substring(0, 500),
        timestamp: m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toISOString() : (typeof m === 'object' && m.created_at ? m.created_at : null),
        pushName: m.pushName || ''
      };
    });
    result.sort(function(a, b) { return new Date(a.timestamp || 0) - new Date(b.timestamp || 0); });
    return { ok: true, messages: result, source: messages.length > 0 ? (messages[0].key ? 'baileys' : 'db') : 'none' };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function getProfilePicture(jid) {
  if (!sock) return null;
  try {
    var url = await sock.profilePictureUrl(jid, 'image');
    return url || null;
  } catch(e) {
    return null;
  }
}

module.exports = { initBaileys, getQRDataURL, getStatus, sendMessage: sendBaileysMessage, transcribeAudioMessage, getChats, getChatMessages, getProfilePicture };
