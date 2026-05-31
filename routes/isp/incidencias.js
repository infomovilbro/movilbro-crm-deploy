const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const multer = require('multer');
const path = require('path');
const router = express.Router();

router.use(requireAuth);

var uploadsDir = path.join(__dirname, '..', '..', 'uploads');
var upload = multer({ dest: uploadsDir });

router.get('/', async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var customers = [];
    try { customers = await api.getCustomers(); } catch(e) {}
    var typologies = [];
    try {
      var tData = await api.getTicketTypologies();
      typologies = Array.isArray(tData) ? tData : (tData && Array.isArray(tData.typologys) ? tData.typologys : (tData && Array.isArray(tData.data) ? tData.data : []));
    } catch(e) {}

    var localCount = 0;
    try { var c = db.prepare('SELECT COUNT(*) as cnt FROM isp_incidencias').get(); localCount = c.cnt; } catch(e) {}
    
    var incidencias = [];

    if (localCount > 0) {
      incidencias = db.prepare('SELECT i.*, cl.nombre as cliente_nombre, u.nombre as user_name FROM isp_incidencias i LEFT JOIN clients cl ON i.client_id=cl.id LEFT JOIN users u ON i.user_id=u.id ORDER BY i.created_at DESC').all();
    }

    var ticketsData = await api.request('GET', '/tickets?brand_id=264');
    var ticketList = [];
    if (ticketsData && Array.isArray(ticketsData.tickets)) ticketList = ticketsData.tickets;
    else if (Array.isArray(ticketsData)) ticketList = ticketsData;

    var apiTickets = ticketList.map(function(t) {
      var cliente = customers.find(function(c) { return c.fiscalId === t.fiscalId; });
      return {
        id: t.id || t.ticketId,
        cliente_nombre: cliente ? (cliente.name + ' ' + (cliente.firstSurname || '')) : (t.fiscalId || ''),
        asunto: t.subject || t.description || t.typology || '',
        categoria: t.typology || t.type || 'general',
        tipo: 'api_ticket',
        estado: t.status || 'abierta',
        prioridad: t.priority || 'normal',
        user_name: t.agentName || t.agent || '',
        created_at: (t.created || t.createdAt || '').split('T')[0]
      };
    });

    var allIncidencias = incidencias.concat(apiTickets);
    allIncidencias.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });

    res.render('isp/incidencias/index', { title: 'Incidencias', incidencias: allIncidencias, typologies: typologies, clientes: customers });
  } catch (e) { console.error(e); res.status(500).send('Error: ' + e.message); }
});

router.post('/create-ticket', upload.single('adjunto'), async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var ticketPayload = {
      fiscalId: req.body.fiscal_id,
      typology: req.body.tipologia,
      description: req.body.descripcion,
      priority: req.body.prioridad
    };
    var result = await api.createTicket(ticketPayload);
    try {
      db.prepare('INSERT INTO isp_incidencias (client_id, asunto, descripcion, prioridad, estado, categoria) VALUES (?,?,?,?,?,?)').run(req.body.client_id || null, req.body.tipologia || 'Ticket', req.body.descripcion || '', req.body.prioridad || 'normal', 'abierta', req.body.tipologia || 'general');
    } catch(e) {}
    res.json({ ok: true, result: result });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
