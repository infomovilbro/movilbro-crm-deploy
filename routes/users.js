const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { db } = require('../database');

const PERMISSION_MODULES = [
  'dashboard', 'kpis', 'altas', 'aftersales', 'massive_processes',
  'subscriptions', 'products', 'clients', 'surveys', 'leads',
  'whatsapp', 'channel', 'users', 'invoices', 'payments',
  'remittances', 'resources', 'tickets', 'settings', 'tienda'
];

router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, username, nombre, email, rol, permissions, created_at FROM users ORDER BY id').all().map(u => {
    try { u.permissions = JSON.parse(u.permissions || '{}'); } catch(e) { u.permissions = {}; }
    return u;
  });
  res.render('users/index', { title: 'Usuarios', users, layout: 'layout' });
});

router.get('/nuevo', (req, res) => {
  res.render('users/form', { title: 'Nuevo Usuario', user: null, permissions: PERMISSION_MODULES, layout: 'layout' });
});

router.post('/nuevo', (req, res) => {
  const { username, password, nombre, email, rol } = req.body;
  if (!username || !password || !nombre) {
    return res.render('users/form', { title: 'Nuevo Usuario', user: null, permissions: PERMISSION_MODULES, error: 'Usuario, contraseña y nombre son obligatorios', layout: 'layout' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.render('users/form', { title: 'Nuevo Usuario', user: null, permissions: PERMISSION_MODULES, error: 'El nombre de usuario ya existe', layout: 'layout' });
  }
  const perms = {};
  PERMISSION_MODULES.forEach(m => { perms[m] = !!req.body[`perm_${m}`]; });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password, nombre, email, rol, permissions) VALUES (?, ?, ?, ?, ?, ?)').run(username, hash, nombre, email || null, rol || 'user', JSON.stringify(perms));
  res.redirect('/users');
});

router.get('/:id/editar', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.redirect('/users');
  try { user.permissions = JSON.parse(user.permissions || '{}'); } catch(e) { user.permissions = {}; }
  res.render('users/form', { title: 'Editar Usuario', user, permissions: PERMISSION_MODULES, layout: 'layout' });
});

router.post('/:id/editar', (req, res) => {
  const { nombre, email, rol, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.redirect('/users');
  const perms = {};
  PERMISSION_MODULES.forEach(m => { perms[m] = !!req.body[`perm_${m}`]; });
  if (password && password.trim()) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET nombre = ?, email = ?, rol = ?, password = ?, permissions = ? WHERE id = ?').run(nombre, email || null, rol || 'user', hash, JSON.stringify(perms), req.params.id);
  } else {
    db.prepare('UPDATE users SET nombre = ?, email = ?, rol = ?, permissions = ? WHERE id = ?').run(nombre, email || null, rol || 'user', JSON.stringify(perms), req.params.id);
  }
  res.redirect('/users');
});

router.post('/:id/eliminar', (req, res) => {
  if (parseInt(req.params.id) === req.session.user.id) {
    return res.redirect('/users');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.redirect('/users');
});

module.exports = router;
