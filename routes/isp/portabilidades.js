const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const router = express.Router();

router.use(requireAuth);

function translateStatus(status) {
  if (!status) return 'pendiente';
  var s = status.toLowerCase();
  if (s === 'pending') return 'pendiente';
  if (s === 'in_progress' || s === 'processing') return 'en_curso';
  if (s === 'completed' || s === 'iniciada') return 'completada';
  if (s === 'rejected' || s === 'cancelada') return 'rechazada';
  if (s === 'cancelled') return 'cancelada';
  return s;
}

router.get('/', async (req, res) => {
  try {
    var localCount = 0;
    try { var c = db.prepare('SELECT COUNT(*) as cnt FROM isp_portabilidades').get(); localCount = c.cnt; } catch(e) {}
    
    if (localCount > 0) {
      var portabilidades = db.prepare('SELECT p.*, cl.nombre as cliente_nombre FROM isp_portabilidades p LEFT JOIN clients cl ON p.client_id=cl.id ORDER BY p.created_at DESC').all();
      portabilidades.forEach(function(p) { p.estado = translateStatus(p.estado); });
      return res.render('isp/portabilidades', { title: 'Portabilidades', portabilidades });
    }

    var api = LikesAPI.getApiInstance();
    var customers = [];
    try { customers = await api.getCustomers(); } catch(e) {}
    
    var portData = [];
    try {
      portData = await api.getPortabilities();
    } catch(e) {}

    var portabilidades = (Array.isArray(portData) ? portData : []).map(function(p) {
      var cliente = customers.find(function(c) { return c.fiscalId === p.fiscalId; });
      return {
        id: p.id || p.portabilityId,
        cliente_nombre: cliente ? (cliente.name + ' ' + (cliente.firstSurname || '')) : (p.fiscalId || ''),
        linea: p.line || p.phone || p.lineNumber || '',
        operador_origen: p.donorOperator || p.originOperator || '',
        operador_destino: p.receptorOperator || p.destinationOperator || 'Movilbro',
        estado: translateStatus(p.status),
        fecha_solicitud: (p.requestDate || p.created || '').split('T')[0],
        fecha_portabilidad: (p.portabilityDate || p.executionDate || '').split('T')[0],
        referencia: p.reference || p.id || ''
      };
    });

    res.render('isp/portabilidades', { title: 'Portabilidades', portabilidades });
  } catch (e) { console.error(e); res.status(500).send('Error: ' + e.message); }
});

router.get('/create', (req, res) => {
  try {
    var clientes = [];
    try { clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all(); } catch(e) {}
    res.render('isp/portabilidades-create', { title: 'Nueva Portabilidad', clientes });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_portabilidades (client_id, linea, operador_origen, operador_destino, fecha_solicitud, fecha_portabilidad, referencia, notas) VALUES (?,?,?,?,?,?,?,?)').run(req.body.client_id, req.body.linea, req.body.operador_origen || '', req.body.operador_destino || 'Movilbro', req.body.fecha_solicitud || null, req.body.fecha_portabilidad || null, req.body.referencia || '', req.body.notas || '');
    res.redirect('/isp/portabilidades');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/:id', async (req, res) => {
  try {
    var local = db.prepare('SELECT p.*, cl.nombre as cliente_nombre FROM isp_portabilidades p LEFT JOIN clients cl ON p.client_id=cl.id WHERE p.id=?').get(req.params.id);
    if (local) { local.estado = translateStatus(local.estado); return res.render('isp/portabilidades-detail', { title: 'Portabilidad #' + local.id, p: local }); }
    var api = LikesAPI.getApiInstance();
    var portData = await api.request('GET', '/portability/' + req.params.id);
    var p = {
      id: portData.id || portData.portabilityId,
      fiscalId: portData.fiscalId || '',
      cliente_nombre: '',
      linea: portData.line || portData.phone || portData.lineNumber || '',
      operador_origen: portData.donorOperator || portData.originOperator || '',
      operador_destino: portData.receptorOperator || portData.destinationOperator || 'Movilbro',
      estado: translateStatus(portData.status),
      fecha_solicitud: (portData.requestDate || portData.created || '').split('T')[0],
      fecha_portabilidad: (portData.portabilityDate || portData.executionDate || '').split('T')[0],
      referencia: portData.reference || portData.id || '',
      motivo_rechazo: portData.rejectionReason || portData.rejection_reason || ''
    };
    if (portData.fiscalId) {
      var customers = []; try { customers = await api.getCustomers(); } catch(e) {}
      var cliente = customers.find(function(c) { return c.fiscalId === portData.fiscalId; });
      p.cliente_nombre = cliente ? (cliente.name + ' ' + (cliente.firstSurname || '')) : (portData.fiscalId || '');
    }
    res.render('isp/portabilidades-detail', { title: 'Portabilidad #' + p.id, p: p });
  } catch (e) { console.error(e); res.status(500).send('Error: ' + e.message); }
});

router.post('/:id/reintentar', async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var result = await api.request('POST', '/portability/' + req.params.id + '/retry');
    res.json({ ok: true, result: result });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
