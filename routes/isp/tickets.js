const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    var localCount = 0;
    try { var c = db.prepare('SELECT COUNT(*) as cnt FROM tickets').get(); localCount = c.cnt; } catch(e) {}
    
    if (localCount > 0) {
      var tickets = db.prepare('SELECT t.*, cl.nombre as cliente_nombre, u.nombre as user_name FROM tickets t LEFT JOIN clients cl ON t.client_id=cl.id LEFT JOIN users u ON t.user_id=u.id ORDER BY t.created_at DESC').all();
      return res.render('isp/tickets/index', { title: 'Tickets ISP', tickets });
    }

    var api = LikesAPI.getApiInstance();
    var customers = [];
    try { customers = await api.getCustomers(); } catch(e) {}
    
    var ticketsData = await api.request('GET', '/tickets?brand_id=264');
    var ticketList = [];
    if (ticketsData && Array.isArray(ticketsData.tickets)) ticketList = ticketsData.tickets;
    else if (Array.isArray(ticketsData)) ticketList = ticketsData;

    var tickets = ticketList.map(function(t) {
      var cliente = customers.find(function(c) { return c.fiscalId === t.fiscalId; });
      return {
        id: t.id || t.ticketId,
        cliente_nombre: cliente ? (cliente.name + ' ' + (cliente.firstSurname || '')) : (t.fiscalId || ''),
        asunto: t.subject || t.description || t.typology || '',
        estado: t.status || 'abierto',
        prioridad: t.priority || 'normal',
        user_name: t.agentName || t.agent || '',
        created_at: (t.created || t.createdAt || '').split('T')[0]
      };
    });

    res.render('isp/tickets/index', { title: 'Tickets ISP', tickets });
  } catch (e) { console.error(e); res.status(500).send('Error: ' + e.message); }
});

router.get('/create', requireAuth, (req, res) => {
  try {
    const clientes = db.prepare('SELECT id, nombre, apellidos, telefono FROM clients ORDER BY nombre').all();
    res.render('isp/tickets/create', { title: 'Nuevo Ticket ISP', clientes });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', requireAuth, (req, res) => {
  try {
    db.prepare('INSERT INTO tickets (client_id, asunto, descripcion, prioridad, departamento, user_id) VALUES (?,?,?,?,?,?)').run(req.body.client_id || null, req.body.asunto, req.body.descripcion || '', req.body.prioridad || 'normal', req.body.departamento || 'General', req.session.user?.id);
    res.redirect('/isp/tickets');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
