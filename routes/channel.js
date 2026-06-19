const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  try {
    const distributors = db.prepare(`
      SELECT d.*,
        (SELECT COUNT(*) FROM distributor_sales WHERE distributor_id = d.id) as total_ventas,
        (SELECT COALESCE(SUM(importe),0) FROM distributor_sales WHERE distributor_id = d.id) as total_importe,
        (SELECT COALESCE(SUM(comision_calculada),0) FROM distributor_sales WHERE distributor_id = d.id) as total_comisiones
      FROM distributors d ORDER BY d.nombre
    `).all();
    const total = distributors.length;
    const activos = distributors.filter(d => d.activo).length;
    const totalVentas = distributors.reduce((s, d) => s + d.total_importe, 0);
    res.render('channel/index', { title: 'Distribuidores', distributors, total, activos, totalVentas, layout: 'layout' });
  } catch (err) {
    res.render('channel/index', { title: 'Distribuidores', distributors: [], total: 0, activos: 0, totalVentas: 0, error: err.message, layout: 'layout' });
  }
});

router.post('/crear', (req, res) => {
  try {
    const { nombre, contacto, telefono, email, comision, direccion, notas } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    db.prepare(`INSERT INTO distributors (nombre, contacto, telefono, email, comision, direccion, notas)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(nombre.trim(), contacto || '', telefono || '', email || '', parseFloat(comision) || 0, direccion || '', notas || '');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/editar', (req, res) => {
  try {
    const { id, nombre, contacto, telefono, email, comision, direccion, notas } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    db.prepare(`UPDATE distributors SET nombre=?, contacto=?, telefono=?, email=?, comision=?, direccion=?, notas=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(nombre.trim(), contacto || '', telefono || '', email || '', parseFloat(comision) || 0, direccion || '', notas || '', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/eliminar', (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });
    db.prepare('DELETE FROM distributor_sales WHERE distributor_id = ?').run(id);
    db.prepare('DELETE FROM distributors WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/estado', (req, res) => {
  try {
    const d = db.prepare('SELECT activo FROM distributors WHERE id = ?').get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Distribuidor no encontrado' });
    db.prepare('UPDATE distributors SET activo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(d.activo ? 0 : 1, req.params.id);
    res.json({ success: true, activo: !d.activo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
