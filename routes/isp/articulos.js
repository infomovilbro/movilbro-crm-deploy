const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const articulos = db.prepare('SELECT * FROM isp_articulos WHERE activo=1 ORDER BY nombre').all();
    res.render('isp/articulos/index', { title: 'Artículos', articulos });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_articulos (codigo, nombre, fabricante, categoria, modelo, stock, stock_minimo, precio_compra, precio_venta, proveedor, notas) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(req.body.codigo || '', req.body.nombre, req.body.fabricante || '', req.body.categoria || '', req.body.modelo || '', parseInt(req.body.stock || 0), parseInt(req.body.stock_minimo || 5), parseFloat(req.body.precio_compra || 0), parseFloat(req.body.precio_venta || 0), req.body.proveedor || '', req.body.notas || '');
    res.redirect('/isp/articulos');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
