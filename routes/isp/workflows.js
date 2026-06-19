const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const workflows = db.prepare('SELECT w.*, wt.nombre as tipo_nombre, cl.nombre as cliente_nombre, u.nombre as user_name FROM isp_workflows w LEFT JOIN isp_workflow_tipos wt ON w.tipo_id=wt.id LEFT JOIN clients cl ON w.client_id=cl.id LEFT JOIN users u ON w.user_id=u.id WHERE w.activo=1 ORDER BY w.created_at DESC').all();
    const tipos = db.prepare('SELECT * FROM isp_workflow_tipos WHERE activo=1').all();
    res.render('isp/workflows/index', { title: 'Workflows', workflows, tipos });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/create', (req, res) => {
  try {
    const tipos = db.prepare('SELECT * FROM isp_workflow_tipos WHERE activo=1').all();
    const clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all();
    res.render('isp/workflows/create', { title: 'Nuevo Workflow', tipos, clientes, errors: [], workflow: {} });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_workflows (tipo_id, client_id, titulo, descripcion, prioridad, departamento, user_id) VALUES (?,?,?,?,?,?,?)').run(req.body.tipo_id, req.body.client_id || null, req.body.titulo, req.body.descripcion || '', req.body.prioridad || 'normal', req.body.departamento || 'General', req.session.user?.id);
    res.redirect('/isp/workflows');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/:id', (req, res) => {
  try {
    const workflow = db.prepare('SELECT w.*, wt.nombre as tipo_nombre, cl.nombre as cliente_nombre, u.nombre as user_name FROM isp_workflows w LEFT JOIN isp_workflow_tipos wt ON w.tipo_id=wt.id LEFT JOIN clients cl ON w.client_id=cl.id LEFT JOIN users u ON w.user_id=u.id WHERE w.id=?').get(req.params.id);
    if (!workflow) return res.status(404).send('No encontrado');
    const tareas = db.prepare('SELECT * FROM isp_workflow_tareas WHERE workflow_id=? ORDER BY orden').all(req.params.id);
    res.render('isp/workflows/view', { title: 'Workflow: ' + workflow.titulo, workflow, tareas, actividades: [] });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/:id/estado', (req, res) => {
  try { db.prepare('UPDATE isp_workflows SET estado=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.body.estado, req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
