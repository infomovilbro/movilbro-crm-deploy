const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { db } = require('../database');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: (parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW || '15')) * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '50'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' }
});

const solicitarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' }
});

async function sendEmailViaMailjet(toEmail, toName, subject, html) {
  const apiKey = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;
  if (!apiKey || !secretKey) return false;
  try {
    await axios.post('https://api.mailjet.com/v3.1/send', {
      Messages: [{
        From: { Email: 'infomovilbro@gmail.com', Name: 'CRM Movilbro' },
        To: [{ Email: toEmail, Name: toName }],
        Subject: subject,
        HTMLPart: html
      }]
    }, {
      auth: { username: apiKey, password: secretKey },
      timeout: 15000
    });
    return true;
  } catch (e) {
    console.error('Mailjet error:', e.response?.data || e.message);
    return false;
  }
}

function generarContrasena() {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16);
}

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/tienda');
  res.render('login', { title: 'Iniciar Sesión', error: null, success: null, email: '' });
});

router.post('/login/solicitar', solicitarLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Correo electrónico inválido')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('login', { title: 'Iniciar Sesión', error: 'Introduce un correo electrónico válido', success: null, email: '' });
  }
  const email = req.body.email.toLowerCase();

  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
  if (!user) {
    return res.render('login', { title: 'Iniciar Sesión', error: 'Email o contraseña incorrectos', success: null, email });
  }

  const newPassword = generarContrasena();
  const hash = bcrypt.hashSync(newPassword, 10);

  const html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
    <h2 style="color:#0050A1;">CRM Movilbro</h2>
    <p>Hola <strong>${user.nombre}</strong>,</p>
    <p>Has solicitado acceso al CRM. Esta es tu contraseña temporal:</p>
    <div style="background:#f4f5fa;padding:16px;border-radius:8px;text-align:center;font-size:24px;font-weight:700;letter-spacing:2px;color:#0050A1;margin:16px 0;">${newPassword}</div>
    <p style="color:#666;font-size:13px;">Esta contraseña es válida hasta que solicites una nueva. No la compartas con nadie.</p>
    <hr style="border:none;border-top:1px solid #eee;">
    <p style="color:#999;font-size:12px;">Si no solicitaste este acceso, ignora este mensaje.</p>
  </div>`;

  const emailOk = await sendEmailViaMailjet(email, user.nombre, 'Tu contraseña de acceso - CRM Movilbro', html);

  if (emailOk) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);
    return res.render('login', { title: 'Iniciar Sesión', error: null, success: 'Contraseña enviada a tu correo. Revisa tu bandeja de entrada.', email });
  }

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, user.id);
  res.render('login', { title: 'Iniciar Sesión', error: 'Error al enviar el correo. Inténtalo de nuevo más tarde o contacta con el administrador.', success: null, email });
});

router.post('/login', loginLimiter, [
  body('email').trim().isLength({ min: 1 }).withMessage('Usuario o correo requerido'),
  body('password').isLength({ min: 1 }).withMessage('Contraseña requerida')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('login', { title: 'Iniciar Sesión', error: 'Email o contraseña incorrectos', success: null, email: '' });
  }
  const email = (req.body.email || '').trim().toLowerCase();
  const password = (req.body.password || '').trim();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?').get(email, email);

  // Bloquear usuario admin aunque exista en DB
  if (user && user.username === 'admin') {
    return res.render('login', { title: 'Iniciar Sesión', error: 'Email o contraseña incorrectos', success: null, email });
  }
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render('login', { title: 'Iniciar Sesión', error: 'Email o contraseña incorrectos', success: null, email });
  }

  req.session.regenerate((err) => {
    if (err) return res.render('login', { title: 'Iniciar Sesión', error: 'Error al iniciar sesión', success: null, email });
    req.session.user = {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol
    };
    res.redirect('/tienda');
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('movilbro.sid');
    res.redirect('/auth/login');
  });
});

module.exports = router;