const bcrypt = require('bcryptjs');
const { db } = require('../database');

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.rol !== 'admin') {
    return res.status(403).render('403', { title: 'Acceso denegado' });
  }
  next();
}

function loadUserPermissions(req, res, next) {
  if (req.session.user) {
    const user = db.prepare('SELECT permissions FROM users WHERE id = ?').get(req.session.user.id);
    if (user) {
      try { req.session.user.permissions = JSON.parse(user.permissions || '{}'); }
      catch(e) { req.session.user.permissions = {}; }
    }
  }
  next();
}

function requirePermission(module) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    if (req.session.user.rol === 'admin') return next();
    const perms = req.session.user.permissions || {};
    if (perms[module]) return next();
    return res.status(403).render('403', { title: 'Acceso denegado' });
  };
}

// Checks tienda sub-section permission (e.g., 'tienda_agenda', 'tienda_prepago')
function requireTiendaPermission(section) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    if (req.session.user.rol === 'admin') return next();
    const perms = req.session.user.permissions || {};
    const key = 'tienda_' + section;
    if (perms['tienda'] || perms[key] || perms[key + '_ver']) return next();
    return res.status(403).render('403', { title: 'Acceso denegado' });
  };
}

// Generic section permission checker for any CRM module
// prefix = 'crm', 'postventa', 'redes', etc.
function requireSectionPermission(prefix, section) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    if (req.session.user.rol === 'admin') return next();
    const perms = req.session.user.permissions || {};
    const key = prefix + '_' + section;
    if (perms[key] || perms[key + '_ver']) return next();
    // Also allow if user has 'tienda' which we treat as super permission
    if (prefix !== 'tienda' && perms['tienda']) return next();
    return res.status(403).render('403', { title: 'Acceso denegado' });
  };
}

// Check if user has at least one section permission (for page-level access)
function requireAnySectionPermission(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/login');
  if (req.session.user.rol === 'admin') return next();
  const perms = req.session.user.permissions || {};
  // Allow if they have 'tienda' super permission or any tienda_* or crm_* perm
  if (perms['tienda']) return next();
  const hasAny = Object.keys(perms).some(k => k.startsWith('tienda_') || k.startsWith('crm_'));
  if (hasAny) return next();
  return res.status(403).render('403', { title: 'Acceso denegado' });
}

module.exports = { requireAuth, requireAdmin, loadUserPermissions, requirePermission, requireTiendaPermission, requireSectionPermission, requireAnySectionPermission };
