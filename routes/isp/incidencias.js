const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    var localCount = 0;
    try { var c = db.prepare('SELECT COUNT(*) as cnt FROM isp_incidencias').get(); localCount = c.cnt; } catch(e) {}
    
    if (localCount > 0) {
      var incidencias = db.prepare('SELECT i.*, cl.nombre as cliente_nombre, u.nombre as user_name FROM isp_incidencias i LEFT JOIN clients cl ON i.client_id=cl.id LEFT JOIN users u ON i.user_id=u.id ORDER BY i.created_at DESC').all();
      return res.render('isp/incidencias/index', { title: 'Incidencias', incidencias });
    }

    var api = LikesAPI.getApiInstance();
    var customers = [];
    try { customers = await api.getCustomers(); } catch(e) {}
    
    var ticketsData = await api.request('GET', '/tickets?brand_id=264');
    var ticketList = [];
    if (ticketsData && Array.isArray(ticketsData.tickets)) ticketList = ticketsData.tickets;
    else if (Array.isArray(ticketsData)) ticketList = ticketsData;

    var incidencias = ticketList.map(function(t) {
      var cliente = customers.find(function(c) { return c.fiscalId === t.fiscalId; });
      return {
        id: t.id || t.ticketId,
        cliente_nombre: cliente ? (cliente.name + ' ' + (cliente.firstSurname || '')) : (t.fiscalId || ''),
        asunto: t.subject || t.description || t.typology || '',
        categoria: t.typology || t.type || 'general',
        tipo: t.type || t.typology || '',
        estado: t.status || 'abierta',
        prioridad: t.priority || 'normal',
        user_name: t.agentName || t.agent || '',
        created_at: (t.created || t.createdAt || '').split('T')[0]
      };
    });

    res.render('isp/incidencias/index', { title: 'Incidencias', incidencias });
  } catch (e) { console.error(e); res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
