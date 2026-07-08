const nodemailer = require('nodemailer');
const axios = require('axios');
const { db } = require('../database');

function getGmailCreds() {
  try {
    var user = db.prepare("SELECT value FROM settings WHERE key='gmail_user'").get()?.value || process.env.GMAIL_USER || 'infomovilbro@gmail.com';
    var pass = db.prepare("SELECT value FROM settings WHERE key='gmail_pass'").get()?.value || process.env.GMAIL_PASS || '';
    return { user, pass };
  } catch(e) { return { user: process.env.GMAIL_USER || 'infomovilbro@gmail.com', pass: process.env.GMAIL_PASS || '' }; }
}

async function sendEmail(toEmail, toName, subject, html) {
  var errors = [];

  // 1) Try Gmail
  var gmail = getGmailCreds();
  if (gmail.user && gmail.pass) {
    try {
      var transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: gmail.user, pass: gmail.pass } });
      await transporter.sendMail({ from: gmail.user, to: toEmail, subject: subject, html: html });
      console.log('[Email] Enviado OK via Gmail a', toEmail);
      return true;
    } catch(e) { errors.push('Gmail: ' + e.message); console.error('[Email] Gmail error:', e.message); }
  } else {
    errors.push('Gmail: credenciales no configuradas');
  }

  console.error('[Email] FALLÓ el envío a', toEmail, '- errores:', errors.join(' | '));
  return false;
}

async function testConnection() {
  var results = {};
  var gmail = getGmailCreds();
  results.gmail = { configured: !!(gmail.user && gmail.pass), user: gmail.user };
  if (gmail.user && gmail.pass) {
    try {
      var transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: gmail.user, pass: gmail.pass } });
      await transporter.verify();
      results.gmail.status = 'OK';
    } catch(e) { results.gmail.status = 'ERROR: ' + e.message; }
  }
  return results;
}

module.exports = { sendEmail, getGmailCreds, testConnection };

// Sync env vars to DB at init
try {
  if (process.env.GMAIL_USER) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gmail_user', ?)").run(process.env.GMAIL_USER);
  if (process.env.GMAIL_PASS) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gmail_pass', ?)").run(process.env.GMAIL_PASS);
} catch(e) {}
