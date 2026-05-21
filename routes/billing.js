const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../database');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const clientes = db.prepare('SELECT id, nombre, apellidos FROM clients ORDER BY nombre').all();
  const facturas = db.prepare(`
    SELECT f.*, c.nombre as cliente_nombre 
    FROM invoices f LEFT JOIN clients c ON f.client_id = c.id 
    ORDER BY f.created_at DESC
  `).all();
  res.render('billing/index', { title: 'Facturación', facturas, clientes, success: null, error: null });
});

router.post('/crear', requireAuth, (req, res) => {
  const { client_id, concepto, importe, fecha_emision, fecha_vencimiento, estado, stripe_payment_link } = req.body;
  if (!client_id || !concepto || !importe) {
    return res.redirect('/facturacion?error=Campos obligatorios: cliente, concepto e importe');
  }
  db.prepare('INSERT INTO invoices (client_id, concepto, importe, fecha_emision, fecha_vencimiento, estado, stripe_payment_link) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    client_id, concepto, parseFloat(importe), fecha_emision || getToday(), fecha_vencimiento, estado || 'pendiente', stripe_payment_link || null
  );
  res.redirect('/facturacion?success=Factura creada');
});

router.post('/:id/estado', requireAuth, (req, res) => {
  db.prepare('UPDATE invoices SET estado = ? WHERE id = ?').run(req.body.estado, req.params.id);
  res.redirect('/facturacion');
});

router.post('/:id/editar', requireAuth, (req, res) => {
  const { concepto, importe, fecha_emision, fecha_vencimiento, estado, stripe_payment_link } = req.body;
  db.prepare('UPDATE invoices SET concepto=?, importe=?, fecha_emision=?, fecha_vencimiento=?, estado=?, stripe_payment_link=? WHERE id=?').run(
    concepto, parseFloat(importe), fecha_emision, fecha_vencimiento, estado, stripe_payment_link || null, req.params.id
  );
  res.redirect('/facturacion?success=Factura actualizada');
});

router.get('/:id/pdf', requireAuth, (req, res) => {
  const factura = db.prepare(`
    SELECT f.*, c.nombre as cn, c.apellidos as ca, c.dni_nif, c.direccion, c.telefono, c.email 
    FROM invoices f JOIN clients c ON f.client_id = c.id WHERE f.id = ?
  `).get(req.params.id);
  if (!factura) return res.redirect('/facturacion');
  res.render('billing/pdf', { title: `Factura #${factura.id}`, f: factura, layout: false });
});

module.exports = router;
