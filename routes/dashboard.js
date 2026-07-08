const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { getAllStats } = require('./stats');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const stats = await getAllStats();

    // Local data for charts
    const localClientes = db.prepare("SELECT strftime('%Y-%m', created_at) as mes, COUNT(*) as count FROM clients WHERE created_at IS NOT NULL GROUP BY mes ORDER BY mes").all();
    const localOrders = db.prepare("SELECT strftime('%Y-%m', created_at) as mes, COUNT(*) as count FROM orders WHERE created_at IS NOT NULL GROUP BY mes ORDER BY mes").all();
    const ultimosClientes = db.prepare('SELECT * FROM clients ORDER BY created_at DESC LIMIT 5').all();
    const ultimasOrdenes = db.prepare(`
      SELECT o.*, c.nombre as cliente_nombre 
      FROM orders o JOIN clients c ON o.client_id = c.id 
      ORDER BY o.created_at DESC LIMIT 5
    `).all();

    res.render('dashboard', { title: 'Panel de Control', stats, ultimosClientes, ultimasOrdenes, localClientes, localOrders });
  } catch (error) {
    const localClientes = db.prepare("SELECT strftime('%Y-%m', created_at) as mes, COUNT(*) as count FROM clients WHERE created_at IS NOT NULL GROUP BY mes ORDER BY mes").all();
    res.render('dashboard', { title: 'Panel de Control', stats: null, ultimosClientes: [], ultimasOrdenes: [], localClientes, localOrders: [], error: error.message });
  }
});

module.exports = router;
