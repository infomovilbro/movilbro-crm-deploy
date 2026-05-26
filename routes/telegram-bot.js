const express = require('express');
const { db } = require('../database');
const https = require('https');
const router = express.Router();

// ---- helpers ----
function getToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token'").get();
  return row ? row.value : null;
}
function getChatId() {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'telegram_chat_id'").get();
  return row ? row.value : null;
}

function sendMsg(chatId, text) {
  return new Promise((resolve) => {
    const token = getToken();
    if (!token) return resolve(false);
    const body = JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' });
    const opts = {
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    };
    const req = https.request(opts, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(true)); });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

// ---- menu ----
const MENU = [
  { id: 1, label: 'Backup', desc: 'Enviar backup de la base de datos ahora', cmd: 'backup' },
  { id: 2, label: 'Resumen diario', desc: 'Altas, bajas, ingresos y stats del d\u00eda', cmd: 'resumen' },
  { id: 3, label: 'Stats generales', desc: 'KPIs generales del CRM', cmd: 'stats' },
  { id: 4, label: 'Buscar cliente', desc: 'Escribe: /cliente 694297048', cmd: 'cliente' },
  { id: 5, label: 'Tickets pendientes', desc: 'Lista de tickets abiertos', cmd: 'tickets' },
  { id: 6, label: 'Portabilidades', desc: 'Estado de portabilidades activas', cmd: 'portabilidades' },
  { id: 7, label: 'Facturaci\u00f3n del mes', desc: 'Ingresos y cobros del mes actual', cmd: 'facturacion' },
  { id: 8, label: '\u00d3rdenes pendientes', desc: '\u00d3rdenes de servicio sin completar', cmd: 'ordenes' },
  { id: 9, label: 'Pr\u00f3ximas instalaciones', desc: 'Instalaciones programadas', cmd: 'instalaciones' },
  { id: 10, label: 'Encuestas recientes', desc: '\u00daltimas encuestas de satisfacci\u00f3n', cmd: 'encuestas' }
];

function menuTexto() {
  let t = '\uD83E\uDD16 <b>CRM Movilbro - Comandos</b>\n\n';
  t += 'Responde con el n\u00famero o usa /quiero <n\u00famero>\n\n';
  MENU.forEach(m => { t += '<b>' + m.id + '.</b> ' + m.label + ' \u2014 ' + m.desc + '\n'; });
  t += '\n\uD83D\uDCAC Tambi\u00e9n puedes escribir /' + MENU.map(m => m.cmd).join(', /');
  return t;
}

// ---- command handlers ----
async function cmdResumen(chatId) {
  const hoy = new Date().toISOString().slice(0, 10);
  const mes = hoy.slice(0, 7);
  const totalCli = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
  const totalSubs = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE estado != 'baja'").get().c;
  const altasHoy = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE fecha_alta >= ?").get(hoy).c;
  const ticketsAbiertos = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE estado != 'cerrado'").get().c;
  const ordenesPend = db.prepare("SELECT COUNT(*) as c FROM orders WHERE estado NOT IN ('completada','cancelada')").get().c;
  const t = '\uD83D\uDCCA <b>Resumen diario</b>\n\n'
    + '\uD83D\uDCC5 Fecha: ' + hoy + '\n\n'
    + '\uD83C\uDFE6 Clientes: ' + totalCli + '\n'
    + '\uD83D\uDCF1 Suscripciones activas: ' + totalSubs + '\n'
    + '\uD83D\uDCE1 Altas hoy: ' + altasHoy + '\n'
    + '\uD83C\uDFAB Tickets abiertos: ' + ticketsAbiertos + '\n'
    + '\uD83D\uDCE6 \u00d3rdenes pendientes: ' + ordenesPend + '\n';
  await sendMsg(chatId, t);
}

async function cmdStats(chatId) {
  const hoy = new Date().toISOString().slice(0, 10);
  const mes = hoy.slice(0, 7);
  const totalCli = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
  const activas = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE estado != 'baja'").get().c;
  const bajas = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE estado = 'baja' OR estado LIKE '%baja%'").get().c;
  const tickets = db.prepare('SELECT COUNT(*) as c FROM tickets').get().c;
  const ordenes = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const t = '\uD83D\uDCCA <b>Stats generales CRM</b>\n\n'
    + '\uD83C\uDFE6 Clientes totales: ' + totalCli + '\n'
    + '\uD83D\uDCF1 Suscripciones activas: ' + activas + '\n'
    + '\uD83D\uDD14 Bajas totales: ' + bajas + '\n'
    + '\uD83C\uDFAB Tickets: ' + tickets + '\n'
    + '\uD83D\uDCE6 \u00d3rdenes: ' + ordenes + '\n';
  await sendMsg(chatId, t);
}

async function cmdTickets(chatId) {
  const lista = db.prepare("SELECT id, asunto, prioridad, estado, created_at FROM tickets WHERE estado != 'cerrado' ORDER BY created_at DESC LIMIT 10").all();
  if (!lista.length) return await sendMsg(chatId, '\u2705 No hay tickets pendientes.');
  let t = '\uD83C\uDFAB <b>Tickets pendientes</b>\n\n';
  lista.forEach(r => {
    const p = r.prioridad === 'alta' ? '\uD83D\uDD34' : r.prioridad === 'media' ? '\uD83D\uDFE1' : '\uD83D\uDFE2';
    t += '#' + r.id + ' ' + p + ' <b>' + r.asunto + '</b> [' + r.estado + ']\n';
  });
  await sendMsg(chatId, t);
}

async function cmdPortabilidades(chatId) {
  const lista = db.prepare("SELECT id, linea, producto, estado, created_at FROM subscriptions WHERE estado LIKE '%portabilidad%' OR estado = 'en_curso' ORDER BY created_at DESC LIMIT 10").all();
  if (!lista.length) return await sendMsg(chatId, 'No hay portabilidades activas.');
  let t = '\uD83D\uDCF1 <b>Portabilidades</b>\n\n';
  lista.forEach(r => { t += '\u2022 ' + (r.linea || '-') + ' \u2014 ' + (r.producto || '-') + ' [' + r.estado + ']\n'; });
  await sendMsg(chatId, t);
}

async function cmdFacturacion(chatId) {
  const mes = new Date().toISOString().slice(0, 7);
  const ing = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='ingreso' AND fecha LIKE ?").get(mes + '%');
  const gas = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='gasto' AND fecha LIKE ?").get(mes + '%');
  const t = '\uD83D\uDCB0 <b>Facturaci\u00f3n del mes</b>\n\n'
    + '\uD83D\uDCC5 Mes: ' + mes + '\n'
    + '\uD83D\uDFE2 Ingresos: ' + parseFloat(ing.t).toFixed(2) + '\u20AC\n'
    + '\uD83D\uDD34 Gastos: ' + parseFloat(gas.t).toFixed(2) + '\u20AC\n'
    + '\uD83D\uDD35 Saldo: ' + parseFloat(ing.t - gas.t).toFixed(2) + '\u20AC\n';
  await sendMsg(chatId, t);
}

async function cmdOrdenes(chatId) {
  const lista = db.prepare("SELECT id, tipo, estado, producto, fecha_orden FROM orders WHERE estado NOT IN ('completada','cancelada') ORDER BY fecha_orden DESC LIMIT 10").all();
  if (!lista.length) return await sendMsg(chatId, '\u2705 No hay \u00f3rdenes pendientes.');
  let t = '\uD83D\uDCE6 <b>\u00d3rdenes pendientes</b>\n\n';
  lista.forEach(r => { t += '\u2022 #' + r.id + ' ' + r.tipo + ' \u2014 ' + (r.producto || '-') + ' [' + r.estado + ']\n'; });
  await sendMsg(chatId, t);
}

async function cmdInstalaciones(chatId) {
  const hoy = new Date().toISOString().slice(0, 10);
  const lista = db.prepare("SELECT id, cliente_nombre, direccion, fecha_instalacion, estado FROM instalaciones WHERE fecha_instalacion >= ? ORDER BY fecha_instalacion ASC LIMIT 10").all(hoy);
  if (!lista.length) return await sendMsg(chatId, 'No hay instalaciones programadas.');
  let t = '\uD83D\uDD27 <b>Pr\u00f3ximas instalaciones</b>\n\n';
  lista.forEach(r => { t += '\u2022 ' + r.cliente_nombre + ' \u2014 ' + (r.direccion || '') + ' [' + r.estado + ']\n'; });
  await sendMsg(chatId, t);
}

async function cmdEncuestas(chatId) {
  const lista = db.prepare("SELECT id, cliente_nombre, puntuacion, created_at FROM surveys ORDER BY created_at DESC LIMIT 5").all();
  if (!lista.length) return await sendMsg(chatId, 'No hay encuestas registradas.');
  let t = '\uD83D\uDCDD <b>\u00daltimas encuestas</b>\n\n';
  lista.forEach(r => { t += '\u2022 ' + r.cliente_nombre + ' \u2014 ' + (r.puntuacion || '-') + '/5\n'; });
  await sendMsg(chatId, t);
}

// ---- webhook ----
router.post('/webhook', (req, res) => {
  const update = req.body;
  if (!update || !update.message || !update.message.text) return res.sendStatus(200);
  processCmd(update.message.text.trim(), update.message.chat.id);
  res.sendStatus(200);
});

async function processCmd(text, chatId) {
  const parts = text.split(' ');
  const first = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ');

  if (first === '/start' || first === '/quiero' || first === '/menu' || first === '/acciones' || first === '/ayuda') {
    if (rest && !isNaN(rest)) {
      return ejecutarNumero(parseInt(rest), chatId);
    }
    return await sendMsg(chatId, menuTexto());
  }

  if (!isNaN(first) && first.length <= 3) {
    return ejecutarNumero(parseInt(first), chatId);
  }

  switch (first) {
    case '/backup': return cmdBackup(chatId);
    case '/resumen': case '/summary': return cmdResumen(chatId);
    case '/stats': case '/kpi': return cmdStats(chatId);
    case '/cliente': case '/clientes': return cmdCliente(chatId, rest);
    case '/tickets': case '/ticket': return cmdTickets(chatId);
    case '/portabilidades': case '/porta': return cmdPortabilidades(chatId);
    case '/facturacion': case '/billing': return cmdFacturacion(chatId);
    case '/ordenes': case '/orders': return cmdOrdenes(chatId);
    case '/instalaciones': return cmdInstalaciones(chatId);
    case '/encuestas': return cmdEncuestas(chatId);
    default:
      await sendMsg(chatId, 'No te entiendo. Escribe /quiero para ver el men\u00fa.');
  }
}

async function ejecutarNumero(num, chatId) {
  const item = MENU.find(m => m.id === num);
  if (!item) return await sendMsg(chatId, 'N\u00famero no v\u00e1lido. Escribe /quiero para ver el men\u00fa.');
  switch (item.cmd) {
    case 'backup': return cmdBackup(chatId);
    case 'resumen': return cmdResumen(chatId);
    case 'stats': return cmdStats(chatId);
    case 'cliente': return await sendMsg(chatId, 'Escribe /cliente seguido del tel\u00e9fono o nombre.\nEjemplo: /cliente 694297048');
    case 'tickets': return cmdTickets(chatId);
    case 'portabilidades': return cmdPortabilidades(chatId);
    case 'facturacion': return cmdFacturacion(chatId);
    case 'ordenes': return cmdOrdenes(chatId);
    case 'instalaciones': return cmdInstalaciones(chatId);
    case 'encuestas': return cmdEncuestas(chatId);
  }
}

async function cmdBackup(chatId) {
  await sendMsg(chatId, '\uD83D\uDDC2 Generando backup...');
  try {
    const { sendBackup } = require('./backup');
    const r = await sendBackup();
    if (r.success) {
      await sendMsg(chatId, '\u2705 Backup enviado correctamente a este chat.');
    } else {
      await sendMsg(chatId, '\u274C Error: ' + (r.error || 'desconocido'));
    }
  } catch (e) {
    await sendMsg(chatId, '\u274C Error al generar backup: ' + e.message);
  }
}

async function cmdCliente(chatId, query) {
  if (!query) return await sendMsg(chatId, 'Escribe /cliente seguido del tel\u00e9fono, nombre o email.\nEjemplo: /cliente 694297048');
  const q = '%' + query + '%';
  const results = db.prepare("SELECT id, nombre, telefono, email, dni_nif FROM clients WHERE nombre LIKE ? OR telefono LIKE ? OR email LIKE ? OR dni_nif LIKE ? LIMIT 5").all(q, q, q, q);
  if (!results.length) return await sendMsg(chatId, 'No se encontraron clientes con: ' + query);
  let t = '\uD83D\uDC64 <b>Clientes encontrados</b>\n\n';
  results.forEach(r => {
    t += '\u2022 <b>' + r.nombre + '</b>\n';
    if (r.telefono) t += '  \uD83D\uDCDE ' + r.telefono + '\n';
    if (r.email) t += '  \u2709\uFE0F ' + r.email + '\n';
    t += '\n';
  });
  await sendMsg(chatId, t);
}

// ---- notificaciones automáticas ----
async function notifyServerStart() {
  const chatId = getChatId();
  if (!chatId) return;
  await sendMsg(chatId, '\uD83D\uDFE2 Servidor CRM iniciado correctamente\n' + new Date().toLocaleString('es-ES'));
}

async function sendDailySummary() {
  const chatId = getChatId();
  if (!chatId) return;
  await cmdResumen(chatId);
}

async function notifyNewOrder(detalles) {
  const chatId = getChatId();
  if (!chatId) return;
  await sendMsg(chatId, '\uD83D\uDCE6 <b>Nueva orden creada</b>\n' + detalles);
}

async function notifyNewTicket(detalles) {
  const chatId = getChatId();
  if (!chatId) return;
  await sendMsg(chatId, '\uD83C\uDFAB <b>Nuevo ticket</b>\n' + detalles);
}

module.exports = { router, sendMsg, notifyServerStart, sendDailySummary, notifyNewOrder, notifyNewTicket };
