const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const ordenes = db.prepare(`
    SELECT o.*, c.nombre as cliente_nombre 
    FROM orders o JOIN clients c ON o.client_id = c.id 
    ORDER BY o.created_at DESC
  `).all();
  res.render('orders/list', { title: 'Órdenes', ordenes });
});

router.get('/nueva', requireAuth, (req, res) => {
  const clientes = db.prepare('SELECT id, nombre, apellidos, telefono FROM clients ORDER BY nombre').all();
  res.render('orders/create', { title: 'Nueva Orden', clientes, orden: {}, errors: [] });
});

router.post('/nueva', requireAuth, (req, res) => {
  const { client_id, tipo, producto, detalles } = req.body;
  if (!client_id || !tipo) {
    const clientes = db.prepare('SELECT id, nombre, apellidos, telefono FROM clients ORDER BY nombre').all();
    return res.render('orders/create', { title: 'Nueva Orden', clientes, orden: req.body, errors: ['Cliente y tipo son obligatorios'] });
  }
  const result = db.prepare('INSERT INTO orders (client_id, tipo, producto, detalles) VALUES (?, ?, ?, ?)').run(client_id, tipo, producto, detalles);
  const cliente = db.prepare('SELECT nombre, apellidos FROM clients WHERE id = ?').get(client_id);
  db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('orden_creada', `Orden ${tipo} creada para ${cliente.nombre}`, client_id);
  res.redirect('/ordenes');
});

router.get('/:id', requireAuth, (req, res) => {
  const orden = db.prepare(`
    SELECT o.*, c.nombre as cliente_nombre, c.apellidos as cliente_apellidos, c.telefono as cliente_telefono, c.email as cliente_email
    FROM orders o JOIN clients c ON o.client_id = c.id WHERE o.id = ?
  `).get(req.params.id);
  if (!orden) return res.redirect('/ordenes');
  res.render('orders/view', { title: `Orden #${orden.id}`, orden });
});

router.post('/:id/estado', requireAuth, (req, res) => {
  const { estado } = req.body;
  db.prepare('UPDATE orders SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(estado, req.params.id);
  res.redirect(`/ordenes/${req.params.id}`);
});

module.exports = router;
