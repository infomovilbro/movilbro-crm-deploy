const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    var localCount = 0;
    try { var c = db.prepare('SELECT COUNT(*) as cnt FROM isp_portabilidades').get(); localCount = c.cnt; } catch(e) {}
    
    if (localCount > 0) {
      var portabilidades = db.prepare('SELECT p.*, cl.nombre as cliente_nombre FROM isp_portabilidades p LEFT JOIN clients cl ON p.client_id=cl.id ORDER BY p.created_at DESC').all();
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
        estado: p.status || 'pendiente',
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

module.exports = router;
