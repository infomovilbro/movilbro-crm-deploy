const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

const today = () => new Date().toISOString().split('T')[0];

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const filterDate = req.query.fecha || today();
    const movimientos = db.prepare('SELECT c.*, u.nombre as user_name, cl.nombre as cliente_nombre FROM isp_caja c LEFT JOIN users u ON c.user_id=u.id LEFT JOIN clients cl ON c.client_id=cl.id WHERE c.fecha=? ORDER BY c.created_at DESC').all(filterDate);
    const ingresos = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM isp_caja WHERE fecha=? AND tipo='ingreso'").get(filterDate);
    const gastos = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM isp_caja WHERE fecha=? AND tipo='gasto'").get(filterDate);
    const clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all();
    res.render('isp/caja/index', { title: 'Caja', movimientos, filterDate, ingresos: ingresos.t, gastos: gastos.t, clientes });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/crear', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_caja (fecha, tipo, concepto, importe, metodo_pago, categoria, descripcion, client_id, user_id) VALUES (?,?,?,?,?,?,?,?,?)').run(req.body.fecha || today(), req.body.tipo, req.body.concepto, parseFloat(req.body.importe), req.body.metodo_pago || 'efectivo', req.body.categoria || '', req.body.descripcion || '', req.body.client_id || null, req.session.user?.id);
    res.redirect('/isp/caja');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/arqueos', (req, res) => {
  try {
    const arqueos = db.prepare('SELECT a.*, u.nombre as user_name FROM isp_arqueos a LEFT JOIN users u ON a.user_id=u.id ORDER BY a.fecha DESC').all();
    res.render('isp/caja/arqueos', { title: 'Arqueos', arqueos });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
