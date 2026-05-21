const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const router = express.Router();

function getApi() {
  const settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  const config = {};
  settings.forEach(s => config[s.key] = s.value);
  return new LikesAPI({
    apiUrl: config.likes_api_url,
    email: config.likes_client_id,
    password: config.likes_client_secret,
    brandId: config.likes_brand_id
  });
}

router.get('/', requireAuth, async (req, res) => {
  let tickets = [];
  let apiTickets = [];
  let apiError = null;

  tickets = db.prepare(`
    SELECT t.*, c.nombre as cliente_nombre
    FROM tickets t LEFT JOIN clients c ON t.client_id = c.id
    ORDER BY t.created_at DESC
  `).all();

  try {
    const api = getApi();
    const raw = await api.getTickets({ brand_id: api.brandId });
    if (Array.isArray(raw) && raw.length > 0) {
      apiTickets = raw.map(t => ({
        id: t.id || t.likes_id,
        api_id: t.id,
        client_id: null,
        likes_ticket_id: t.id || t.likes_id,
        asunto: t.subject || t.asunto || t.title || 'Sin asunto',
        descripcion: t.description || t.descripcion || '',
        estado: (t.status || t.estado || 'abierto').toLowerCase(),
        prioridad: (t.priority || t.prioridad || 'normal').toLowerCase(),
        created_at: t.created_at || t.fecha || t.date || null,
        cliente_nombre: t.customer?.name || t.customer_name || t.client_name || 'API - Sin cliente',
        from_api: true
      }));
    }
  } catch (error) {
    apiError = error.message;
  }

  const merged = [...tickets, ...apiTickets];
  merged.sort((a, b) => {
    const da = a.created_at || '';
    const db2 = b.created_at || '';
    return da < db2 ? 1 : da > db2 ? -1 : 0;
  });

  res.render('tickets/list', {
    title: 'Tickets de Soporte',
    tickets: merged,
    apiCount: apiTickets.length,
    apiError
  });
});

router.get('/nuevo', requireAuth, (req, res) => {
  const clientes = db.prepare('SELECT id, nombre, apellidos FROM clients ORDER BY nombre').all();
  res.render('tickets/create', { title: 'Nuevo Ticket', clientes, ticket: {}, errors: [] });
});

router.post('/nuevo', requireAuth, (req, res) => {
  const { client_id, asunto, descripcion, prioridad } = req.body;
  if (!asunto) {
    const clientes = db.prepare('SELECT id, nombre, apellidos FROM clients ORDER BY nombre').all();
    return res.render('tickets/create', { title: 'Nuevo Ticket', clientes, ticket: req.body, errors: ['El asunto es obligatorio'] });
  }
  db.prepare('INSERT INTO tickets (client_id, asunto, descripcion, prioridad) VALUES (?, ?, ?, ?)').run(client_id || null, asunto, descripcion, prioridad || 'normal');
  res.redirect('/tickets');
});

router.get('/:id', requireAuth, (req, res) => {
  const ticket = db.prepare(`
    SELECT t.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono, c.email as cliente_email
    FROM tickets t LEFT JOIN clients c ON t.client_id = c.id WHERE t.id = ?
  `).get(req.params.id);
  if (!ticket) return res.redirect('/tickets');
  res.render('tickets/view', { title: `Ticket: ${ticket.asunto}`, ticket });
});

router.post('/:id/estado', requireAuth, (req, res) => {
  const { estado } = req.body;
  db.prepare('UPDATE tickets SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(estado, req.params.id);
  res.redirect(`/tickets/${req.params.id}`);
});

module.exports = router;
