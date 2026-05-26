const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const https = require('https');
const router = express.Router();

function getToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token'").get();
  return row ? row.value : null;
}

function getChatId() {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'telegram_chat_id'").get();
  return row ? row.value : null;
}

router.post('/telegram-config', requireAuth, (req, res) => {
  var token = req.body.token;
  var chatId = req.body.chatId;
  if (token) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_bot_token', ?)").run(token);
  if (chatId) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_chat_id', ?)").run(chatId);
  res.json({ success: true });
});

router.post('/send', requireAuth, (req, res) => {
  var result = sendBackup();
  res.json(result);
});

function sendBackup() {
  var token = getToken();
  var chatId = getChatId();
  if (!token || !chatId) return { success: false, error: 'Telegram no configurado. Configura token y chat_id en Configuración > Telegram Backup' };

  var dbPath = path.join(__dirname, '..', 'movilbro.db');
  if (!fs.existsSync(dbPath)) return { success: false, error: 'DB no encontrada' };

  var backupPath = path.join(__dirname, '..', 'backup.db');
  try {
    // Backup via SQLite backup API
    var backup = require('better-sqlite3')(backupPath);
    var src = require('better-sqlite3')(dbPath, { readonly: true });
    src.backup(backup);
    backup.close();
    src.close();
  } catch (e) {
    // Fallback: copy file
    fs.copyFileSync(dbPath, backupPath);
  }

  var stats = fs.statSync(backupPath);
  var dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  var formData = `--BOUNDARY\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n--BOUNDARY\r\nContent-Disposition: form-data; name="document"; filename="movilbro_${dateStr}.db"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  var footer = `\r\n--BOUNDARY--\r\n`;
  var caption = `\r\n--BOUNDARY\r\nContent-Disposition: form-data; name="caption"\r\n\r\n📦 Backup CRM - ${new Date().toLocaleString('es-ES')}\r\n--BOUNDARY--\r\n`;
  var body = Buffer.concat([
    Buffer.from(formData),
    fs.readFileSync(backupPath),
    Buffer.from(caption)
  ]);

  return new Promise((resolve) => {
    var opts = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendDocument`,
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=BOUNDARY',
        'Content-Length': body.length
      }
    };
    var req = https.request(opts, (res) => {
      var data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          var result = JSON.parse(data);
          resolve({ success: result.ok, error: result.ok ? null : result.description });
        } catch { resolve({ success: false, error: 'Error al parsear respuesta' }); }
        try { fs.unlinkSync(backupPath); } catch {}
      });
    });
    req.on('error', (e) => {
      resolve({ success: false, error: e.message });
      try { fs.unlinkSync(backupPath); } catch {}
    });
    req.write(body);
    req.end();
  });
}

module.exports = { router, sendBackup };
