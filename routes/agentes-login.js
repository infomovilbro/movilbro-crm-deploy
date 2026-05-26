const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../database');
const router = express.Router();

function requireAgenteAuth(req, res, next) {
  if (req.session.agente) return next();
  if (req.path === '/login' || req.path === '/solicitar') return next();
  res.redirect('/tienda/agentes/login');
}

router.get('/login', (req, res) => {
  if (req.session.agente) return res.redirect('/tienda/agentes');
  res.render('tienda/agentes-login', { title: 'Acceso Agentes', error: null, success: null, email: '' });
});

router.post('/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  
  if (username !== 'movilbro') {
    return res.render('tienda/agentes-login', { title: 'Acceso Agentes', error: 'Usuario incorrecto', success: null, email: '' });
  }
  
  const user = db.prepare("SELECT * FROM users WHERE username = 'movilbro'").get();
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('tienda/agentes-login', { title: 'Acceso Agentes', error: 'Contraseña incorrecta', success: null, email: '' });
  }
  
  req.session.agente = { username: 'movilbro', nombre: user.nombre };
  res.redirect('/tienda/agentes');
});

router.post('/solicitar', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  
  const user = db.prepare("SELECT * FROM users WHERE username = 'movilbro' AND LOWER(email) = ?").get(email);
  if (!user) {
    return res.render('tienda/agentes-login', { title: 'Acceso Agentes', error: 'Email no registrado para el acceso de agentes', success: null, email });
  }
  
  const newPassword = crypto.randomBytes(12).toString('base64url').slice(0, 16);
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password = ? WHERE username = 'movilbro'").run(hash);
  
  // Try to send email
  (async () => {
    try {
      const mailjetKey = process.env.MAILJET_API_KEY;
      const mailjetSecret = process.env.MAILJET_SECRET_KEY;
      if (mailjetKey && mailjetSecret) {
        const axios = require('axios');
        await axios.post('https://api.mailjet.com/v3.1/send', {
          Messages: [{
            From: { Email: 'infomovilbro@gmail.com', Name: 'CRM Movilbro' },
            To: [{ Email: email, Name: 'Agente Movilbro' }],
            Subject: 'Tu contraseña de acceso - Agentes CRM',
            HTMLPart: '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;"><h2>CRM Movilbro - Acceso Agentes</h2><p>Tu nueva contraseña es:</p><div style="background:#f4f5fa;padding:16px;border-radius:8px;text-align:center;font-size:24px;font-weight:700;letter-spacing:2px;color:#0050A1;margin:16px 0;">' + newPassword + '</div></div>'
          }]
        }, { auth: { username: mailjetKey, password: mailjetSecret }, timeout: 15000 });
      }
    } catch(e) { console.error('Email error:', e.message); }
  })();
  
  res.render('tienda/agentes-login', { title: 'Acceso Agentes', error: null, success: 'Contraseña enviada a tu correo. Revisa tu bandeja de entrada.', email });
});

router.get('/logout', (req, res) => {
  delete req.session.agente;
  res.redirect('/tienda/agentes/login');
});

module.exports = { router, requireAgenteAuth };
