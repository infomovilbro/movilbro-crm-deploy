const nodemailer = require('nodemailer');
const axios = require('axios');
const { db } = require('../database');

function getGmailCreds() {
  try {
    var user = db.prepare("SELECT value FROM settings WHERE key='gmail_user'").get()?.value || process.env.GMAIL_USER || '';
    var pass = db.prepare("SELECT value FROM settings WHERE key='gmail_pass'").get()?.value || process.env.GMAIL_PASS || '';
    return { user, pass };
  } catch(e) { return { user: process.env.GMAIL_USER || '', pass: process.env.GMAIL_PASS || '' }; }
}

function getMailjetCreds() {
  return { key: process.env.MAILJET_API_KEY, secret: process.env.MAILJET_SECRET_KEY };
}

function getSMTPCreds() {
  try {
    return {
      host: db.prepare("SELECT value FROM settings WHERE key='smtp_host'").get()?.value,
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: db.prepare("SELECT value FROM settings WHERE key='smtp_user'").get()?.value,
      pass: db.prepare("SELECT value FROM settings WHERE key='smtp_pass'").get()?.value,
      from: db.prepare("SELECT value FROM settings WHERE key='email_from'").get()?.value || process.env.SMTP_FROM
    };
  } catch(e) { return {}; }
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

  // 2) Try Mailjet
  var mj = getMailjetCreds();
  if (mj.key && mj.secret) {
    try {
      await axios.post('https://api.mailjet.com/v3.1/send', {
        Messages: [{ From: { Email: gmail.user || process.env.GMAIL_USER || 'crm@movilbro.com', Name: 'CRM Movilbro' }, To: [{ Email: toEmail, Name: toName || toEmail }], Subject: subject, HTMLPart: html }]
      }, { auth: { username: mj.key, password: mj.secret }, timeout: 15000 });
      console.log('[Email] Enviado OK via Mailjet a', toEmail);
      return true;
    } catch(e) { errors.push('Mailjet: ' + (e.response?.data || e.message)); console.error('[Email] Mailjet error:', e.response?.data || e.message); }
  }

  // 3) Try SMTP
  var smtp = getSMTPCreds();
  if (smtp.host && smtp.user && smtp.pass) {
    try {
      var transporter = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: false, auth: { user: smtp.user, pass: smtp.pass } });
      await transporter.sendMail({ from: smtp.from || smtp.user, to: toEmail, subject: subject, html: html });
      console.log('[Email] Enviado OK via SMTP a', toEmail);
      return true;
    } catch(e) { errors.push('SMTP: ' + e.message); console.error('[Email] SMTP error:', e.message); }
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
  var mj = getMailjetCreds();
  results.mailjet = { configured: !!(mj.key && mj.secret) };
  var smtp = getSMTPCreds();
  results.smtp = { configured: !!(smtp.host && smtp.user && smtp.pass), host: smtp.host };
  return results;
}

module.exports = { sendEmail, getGmailCreds, testConnection };

// Sync env vars to DB at init
try {
  if (process.env.GMAIL_USER) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gmail_user', ?)").run(process.env.GMAIL_USER);
  if (process.env.GMAIL_PASS) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gmail_pass', ?)").run(process.env.GMAIL_PASS);
} catch(e) {}
