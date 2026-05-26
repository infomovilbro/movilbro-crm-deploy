const express = require('express');
const { db } = require('../database');
const https = require('https');
const router = express.Router();

// ---- estado de conversacion (para flujos multi-paso) ----
var esperando = {};

// ---- helpers telegram ----
function getToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;
  var row = db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token'").get();
  return row ? row.value : null;
}
function getChatId() {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  var row = db.prepare("SELECT value FROM settings WHERE key = 'telegram_chat_id'").get();
  return row ? row.value : null;
}

function apiCall(method, payload) {
  return new Promise(function(resolve) {
    var token = getToken();
    if (!token) return resolve(null);
    var body = JSON.stringify(payload);
    var opts = {
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/' + method,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    };
    var req = https.request(opts, function(res) { var d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } }); });
    req.on('error', function() { resolve(null); });
    req.write(body);
    req.end();
  });
}

function sendMsg(chatId, text) {
  return apiCall('sendMessage', { chat_id: chatId, text: text });
}

function sendMenu(chatId, text) {
  return apiCall('sendMessage', {
    chat_id: chatId,
    text: text || '\uD83E\uDD16 CRM Movilbro - Funciones',
    reply_markup: {
      inline_keyboard: [
        [{ text: '\uD83D\uDD04 Backup BD', callback_data: 'cmd_backup' }, { text: '\uD83D\uDCCA Resumen diario', callback_data: 'cmd_resumen' }],
        [{ text: '\uD83D\uDCC8 KPIs generales', callback_data: 'cmd_stats' }, { text: '\uD83D\uDC64 Buscar cliente', callback_data: 'cmd_cliente' }],
        [{ text: '\uD83C\uDFAB Tickets pendientes', callback_data: 'cmd_tickets' }, { text: '\uD83D\uDCF1 Portabilidades', callback_data: 'cmd_portabilidades' }],
        [{ text: '\uD83D\uDCB0 Facturacion del mes', callback_data: 'cmd_facturacion' }, { text: '\uD83D\uDCE6 Ordenes pendientes', callback_data: 'cmd_ordenes' }],
        [{ text: '\uD83D\uDD27 Instalaciones', callback_data: 'cmd_instalaciones' }, { text: '\uD83D\uDCE1 Ultimas altas', callback_data: 'cmd_altas' }],
        [{ text: '\uD83D\uDD14 Ultimas bajas', callback_data: 'cmd_bajas' }, { text: '\uD83D\uDCB3 Cobros pendientes', callback_data: 'cmd_cobros' }],
        [{ text: '\uD83D\uDCDD Encuestas', callback_data: 'cmd_encuestas' }, { text: '\uD83D\uDFE2 Caja de hoy', callback_data: 'cmd_caja' }],
        [{ text: '\uD83D\uDCC5 Agenda de hoy', callback_data: 'cmd_agenda' }, { text: '\uD83D\uDCE6 Inventario minimo', callback_data: 'cmd_inventario' }],
        [{ text: '\uD83D\uDEE1\uFE0F Salud del servidor', callback_data: 'cmd_servidor' }, { text: '\u2753 Ayuda', callback_data: 'cmd_ayuda' }]
      ]
    }
  });
}

function editMsg(chatId, msgId, text, keyboard) {
  var p = { chat_id: chatId, message_id: msgId, text: text };
  if (keyboard) p.reply_markup = { inline_keyboard: keyboard };
  return apiCall('editMessageText', p);
}

function answerCb(callbackId, text) {
  return apiCall('answerCallbackQuery', { callback_query_id: callbackId, text: text, show_alert: false });
}

// ---- webhook ----
router.post('/webhook', function(req, res) {
  var update = req.body;
  if (!update) return res.sendStatus(200);

  // Callback query (boton inline pulsado)
  if (update.callback_query) {
    var cq = update.callback_query;
    var chatId = cq.message.chat.id;
    var msgId = cq.message.message_id;
    var data = cq.data || '';
    var cbId = cq.id;

    if (data === 'cmd_ayuda' || data === 'cmd_menu') {
      editMsg(chatId, msgId, '\uD83E\uDD16 CRM Movilbro - Funciones\n\nPulsa cualquier boton para ejecutar una accion.', getMenuKeyboard());
      return answerCb(cbId, 'Menu actualizado');
    }

    answerCb(cbId, 'Procesando...');
    ejecutarComando(data, chatId, msgId);
    return res.sendStatus(200);
  }

  // Mensaje de texto
  if (update.message && update.message.text) {
    var chatId = update.message.chat.id;
    var text = update.message.text.trim();

    // Si estamos esperando entrada del usuario
    if (esperando[chatId]) {
      var accion = esperando[chatId];
      delete esperando[chatId];

      if (accion === 'cliente') {
        buscarCliente(chatId, text, null);
        return res.sendStatus(200);
      }
      if (accion === 'backup') {
        ejecutarBackup(chatId, null);
        return res.sendStatus(200);
      }
    }

    var parts = text.split(' ');
    var first = parts[0].toLowerCase();
    var rest = parts.slice(1).join(' ');

    if (first === '/start' || first === '/funciones' || first === '/menu' || first === '/acciones') {
      if (rest && !isNaN(rest)) {
        var num = parseInt(rest);
        var mapa = { 1:'cmd_backup',2:'cmd_resumen',3:'cmd_stats',4:'cmd_cliente',5:'cmd_tickets',6:'cmd_portabilidades',7:'cmd_facturacion',8:'cmd_ordenes',9:'cmd_instalaciones',10:'cmd_altas',11:'cmd_bajas',12:'cmd_cobros',13:'cmd_encuestas',14:'cmd_caja',15:'cmd_agenda',16:'cmd_inventario',17:'cmd_servidor' };
        if (mapa[num]) return ejecutarComando(mapa[num], chatId, null);
      }
      return sendMenu(chatId);
    }

    if (first === '/backup') return ejecutarBackup(chatId, null);
    if (first === '/resumen' || first === '/summary') return cmdResumen(chatId, null);
    if (first === '/stats' || first === '/kpi') return cmdStats(chatId, null);
    if (first === '/cliente' || first === '/clientes') return rest ? buscarCliente(chatId, rest, null) : pedirCliente(chatId);
    if (first === '/tickets' || first === '/ticket') return cmdTickets(chatId, null);
    if (first === '/portabilidades' || first === '/porta') return cmdPortabilidades(chatId, null);
    if (first === '/facturacion' || first === '/billing') return cmdFacturacion(chatId, null);
    if (first === '/ordenes' || first === '/orders') return cmdOrdenes(chatId, null);
    if (first === '/instalaciones') return cmdInstalaciones(chatId, null);
    if (first === '/encuestas') return cmdEncuestas(chatId, null);
    if (first === '/servidor' || first === '/health') return cmdServidor(chatId, null);
    if (first === '/caja') return cmdCaja(chatId, null);
    if (first === '/agenda') return cmdAgenda(chatId, null);
    if (first === '/inventario') return cmdInventario(chatId, null);

    return sendMsg(chatId, 'No te entiendo. Escribe /funciones para ver el menu.');
  }

  res.sendStatus(200);
});

function getMenuKeyboard() {
  return [
    [{ text: '\uD83D\uDD04 Backup BD', callback_data: 'cmd_backup' }, { text: '\uD83D\uDCCA Resumen diario', callback_data: 'cmd_resumen' }],
    [{ text: '\uD83D\uDCC8 KPIs generales', callback_data: 'cmd_stats' }, { text: '\uD83D\uDC64 Buscar cliente', callback_data: 'cmd_cliente' }],
    [{ text: '\uD83C\uDFAB Tickets pendientes', callback_data: 'cmd_tickets' }, { text: '\uD83D\uDCF1 Portabilidades', callback_data: 'cmd_portabilidades' }],
    [{ text: '\uD83D\uDCB0 Facturacion del mes', callback_data: 'cmd_facturacion' }, { text: '\uD83D\uDCE6 Ordenes pendientes', callback_data: 'cmd_ordenes' }],
    [{ text: '\uD83D\uDD27 Instalaciones', callback_data: 'cmd_instalaciones' }, { text: '\uD83D\uDCE1 Ultimas altas', callback_data: 'cmd_altas' }],
    [{ text: '\uD83D\uDD14 Ultimas bajas', callback_data: 'cmd_bajas' }, { text: '\uD83D\uDCB3 Cobros pendientes', callback_data: 'cmd_cobros' }],
    [{ text: '\uD83D\uDCDD Encuestas', callback_data: 'cmd_encuestas' }, { text: '\uD83D\uDFE2 Caja de hoy', callback_data: 'cmd_caja' }],
    [{ text: '\uD83D\uDCC5 Agenda de hoy', callback_data: 'cmd_agenda' }, { text: '\uD83D\uDCE6 Inventario minimo', callback_data: 'cmd_inventario' }],
    [{ text: '\uD83D\uDEE1\uFE0F Salud del servidor', callback_data: 'cmd_servidor' }, { text: '\u2753 Ayuda', callback_data: 'cmd_ayuda' }]
  ];
}

// ---- ejecutor de comandos ----
function ejecutarComando(data, chatId, msgId) {
  switch (data) {
    case 'cmd_backup': return ejecutarBackup(chatId, msgId);
    case 'cmd_resumen': return cmdResumen(chatId, msgId);
    case 'cmd_stats': return cmdStats(chatId, msgId);
    case 'cmd_cliente': return pedirCliente(chatId);
    case 'cmd_tickets': return cmdTickets(chatId, msgId);
    case 'cmd_portabilidades': return cmdPortabilidades(chatId, msgId);
    case 'cmd_facturacion': return cmdFacturacion(chatId, msgId);
    case 'cmd_ordenes': return cmdOrdenes(chatId, msgId);
    case 'cmd_instalaciones': return cmdInstalaciones(chatId, msgId);
    case 'cmd_altas': return cmdAltas(chatId, msgId);
    case 'cmd_bajas': return cmdBajas(chatId, msgId);
    case 'cmd_cobros': return cmdCobros(chatId, msgId);
    case 'cmd_encuestas': return cmdEncuestas(chatId, msgId);
    case 'cmd_caja': return cmdCaja(chatId, msgId);
    case 'cmd_agenda': return cmdAgenda(chatId, msgId);
    case 'cmd_inventario': return cmdInventario(chatId, msgId);
    case 'cmd_servidor': return cmdServidor(chatId, msgId);
    default: return sendMsg(chatId, 'Comando no reconocido.');
  }
}

// ---- handlers ----
function ejecutarBackup(chatId, msgId) {
  sendMsg(chatId, 'Generando backup...');
  try {
    var { sendBackup } = require('./backup');
    sendBackup().then(function(r) {
      if (r && r.success) sendMsg(chatId, 'Backup enviado a Telegram correctamente.');
      else sendMsg(chatId, 'Error al enviar backup: ' + ((r && r.error) || 'desconocido'));
    });
  } catch(e) {
    sendMsg(chatId, 'Error: ' + e.message);
  }
}

function cmdResumen(chatId, msgId) {
  var hoy = new Date().toISOString().slice(0, 10);
  var totalCli = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
  var totalSubs = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE estado != 'baja'").get().c;
  var altasHoy = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE fecha_alta >= ?").get(hoy).c;
  var ticketsAbiertos = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE estado != 'cerrado'").get().c;
  var ordenesPend = db.prepare("SELECT COUNT(*) as c FROM orders WHERE estado NOT IN ('completada','cancelada')").get().c;
  var ingresosHoy = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='ingreso' AND fecha = ?").get(hoy).t;
  var gastosHoy = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='gasto' AND fecha = ?").get(hoy).t;
  var t = 'Resumen diario - ' + hoy + '\n'
    + 'Clientes: ' + totalCli + ' | Suscripciones activas: ' + totalSubs + '\n'
    + 'Altas hoy: ' + altasHoy + '\n'
    + 'Tickets abiertos: ' + ticketsAbiertos + '\n'
    + 'Ordenes pendientes: ' + ordenesPend + '\n'
    + 'Caja - Ingresos: ' + parseFloat(ingresosHoy).toFixed(2) + 'EUR | Gastos: ' + parseFloat(gastosHoy).toFixed(2) + 'EUR | Saldo: ' + parseFloat(ingresosHoy - gastosHoy).toFixed(2) + 'EUR';
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdStats(chatId, msgId) {
  var totalCli = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
  var activas = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE estado != 'baja'").get().c;
  var bajas = db.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE estado = 'baja' OR estado LIKE '%baja%'").get().c;
  var tickets = db.prepare('SELECT COUNT(*) as c FROM tickets').get().c;
  var ordenes = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  var productos = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  var usuarios = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  var t = 'KPIs generales del CRM\n'
    + 'Clientes totales: ' + totalCli + '\n'
    + 'Suscripciones activas: ' + activas + '\n'
    + 'Bajas totales: ' + bajas + '\n'
    + 'Tickets: ' + tickets + ' | Ordenes: ' + ordenes + '\n'
    + 'Productos: ' + productos + ' | Usuarios: ' + usuarios;
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function pedirCliente(chatId) {
  esperando[chatId] = 'cliente';
  sendMsg(chatId, 'Escribe el telefono, nombre o email del cliente que buscas:');
}

function buscarCliente(chatId, query, msgId) {
  var q = '%' + query + '%';
  var results = db.prepare("SELECT id, nombre, telefono, email, dni_nif FROM clients WHERE nombre LIKE ? OR telefono LIKE ? OR email LIKE ? OR dni_nif LIKE ? LIMIT 5").all(q, q, q, q);
  if (!results.length) return sendMsg(chatId, 'No se encontraron clientes con: ' + query);
  var t = 'Clientes encontrados:\n';
  results.forEach(function(r) {
    t += '- ' + r.nombre;
    if (r.telefono) t += ' | Tel: ' + r.telefono;
    if (r.email) t += ' | Email: ' + r.email;
    t += '\n';
  });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdTickets(chatId, msgId) {
  var lista = db.prepare("SELECT id, asunto, prioridad, estado, created_at FROM tickets WHERE estado != 'cerrado' ORDER BY created_at DESC LIMIT 10").all();
  if (!lista.length) return sendMsg(chatId, 'No hay tickets pendientes.');
  var t = 'Tickets pendientes:\n';
  lista.forEach(function(r) {
    var p = r.prioridad === 'alta' ? '[Alta]' : r.prioridad === 'media' ? '[Media]' : '[Baja]';
    t += '#' + r.id + ' ' + r.asunto + ' ' + p + ' (' + r.estado + ')\n';
  });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdPortabilidades(chatId, msgId) {
  var lista = db.prepare("SELECT linea, producto, estado, created_at FROM subscriptions WHERE estado LIKE '%portabilidad%' OR estado = 'en_curso' ORDER BY created_at DESC LIMIT 10").all();
  if (!lista.length) return sendMsg(chatId, 'No hay portabilidades activas.');
  var t = 'Portabilidades:\n';
  lista.forEach(function(r) { t += '- ' + (r.linea || 'sin linea') + ' | ' + (r.producto || '-') + ' [' + r.estado + ']\n'; });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdFacturacion(chatId, msgId) {
  var mes = new Date().toISOString().slice(0, 7);
  var ing = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='ingreso' AND fecha LIKE ?").get(mes + '%').t;
  var gas = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='gasto' AND fecha LIKE ?").get(mes + '%').t;
  var t = 'Facturacion del mes ' + mes + '\n'
    + 'Ingresos: ' + parseFloat(ing).toFixed(2) + 'EUR\n'
    + 'Gastos: ' + parseFloat(gas).toFixed(2) + 'EUR\n'
    + 'Saldo: ' + parseFloat(ing - gas).toFixed(2) + 'EUR';
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdOrdenes(chatId, msgId) {
  var lista = db.prepare("SELECT id, tipo, estado, producto FROM orders WHERE estado NOT IN ('completada','cancelada') ORDER BY id DESC LIMIT 10").all();
  if (!lista.length) return sendMsg(chatId, 'No hay ordenes pendientes.');
  var t = 'Ordenes pendientes:\n';
  lista.forEach(function(r) { t += '#' + r.id + ' ' + r.tipo + ' - ' + (r.producto || '-') + ' [' + r.estado + ']\n'; });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdInstalaciones(chatId, msgId) {
  var hoy = new Date().toISOString().slice(0, 10);
  var lista = db.prepare("SELECT id, cliente_nombre, direccion, fecha_instalacion, estado FROM instalaciones WHERE fecha_instalacion >= ? ORDER BY fecha_instalacion ASC LIMIT 10").all(hoy);
  if (!lista.length) return sendMsg(chatId, 'No hay instalaciones programadas.');
  var t = 'Proximas instalaciones:\n';
  lista.forEach(function(r) { t += '- ' + r.cliente_nombre + ' | ' + (r.direccion || '') + ' [' + r.estado + ']\n'; });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdAltas(chatId, msgId) {
  var lista = db.prepare("SELECT s.id, s.linea, s.producto, s.fecha_alta, c.nombre FROM subscriptions s LEFT JOIN clients c ON s.client_id = c.id ORDER BY s.fecha_alta DESC LIMIT 10").all();
  if (!lista.length) return sendMsg(chatId, 'No hay altas registradas.');
  var t = 'Ultimas altas:\n';
  lista.forEach(function(r) { t += '- ' + (r.linea || 'sin linea') + ' | ' + (r.producto || '-') + ' | ' + (r.nombre || '') + ' (' + (r.fecha_alta || '') + ')\n'; });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdBajas(chatId, msgId) {
  var lista = db.prepare("SELECT s.id, s.linea, s.producto, s.fecha_baja, c.nombre FROM subscriptions s LEFT JOIN clients c ON s.client_id = c.id WHERE s.estado = 'baja' ORDER BY s.fecha_baja DESC LIMIT 10").all();
  if (!lista.length) return sendMsg(chatId, 'No hay bajas registradas.');
  var t = 'Ultimas bajas:\n';
  lista.forEach(function(r) { t += '- ' + (r.linea || 'sin linea') + ' | ' + (r.producto || '-') + ' | ' + (r.nombre || '') + ' (' + (r.fecha_baja || '') + ')\n'; });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdCobros(chatId, msgId) {
  var lista = db.prepare("SELECT id, concepto, importe, fecha_vencimiento, estado FROM invoices WHERE estado != 'pagado' ORDER BY fecha_vencimiento ASC LIMIT 10").all();
  if (!lista.length) return sendMsg(chatId, 'No hay cobros pendientes.');
  var t = 'Cobros pendientes:\n';
  lista.forEach(function(r) { t += '-' + r.concepto + ' | ' + parseFloat(r.importe).toFixed(2) + 'EUR | Vence: ' + (r.fecha_vencimiento || '-') + ' [' + r.estado + ']\n'; });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdEncuestas(chatId, msgId) {
  var lista = db.prepare("SELECT id, cliente_nombre, puntuacion, created_at FROM surveys ORDER BY created_at DESC LIMIT 5").all();
  if (!lista.length) return sendMsg(chatId, 'No hay encuestas registradas.');
  var t = 'Ultimas encuestas:\n';
  lista.forEach(function(r) { t += '- ' + r.cliente_nombre + ' | Puntuacion: ' + (r.puntuacion || '-') + '/5\n'; });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdCaja(chatId, msgId) {
  var hoy = new Date().toISOString().slice(0, 10);
  var ing = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='ingreso' AND fecha = ?").get(hoy).t;
  var gas = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='gasto' AND fecha = ?").get(hoy).t;
  var ops = db.prepare("SELECT COUNT(*) as c FROM tienda_caja WHERE fecha = ?").get(hoy).c;
  var t = 'Caja de hoy (' + hoy + ')\n'
    + 'Operaciones: ' + ops + '\n'
    + 'Ingresos: ' + parseFloat(ing).toFixed(2) + 'EUR\n'
    + 'Gastos: ' + parseFloat(gas).toFixed(2) + 'EUR\n'
    + 'Saldo: ' + parseFloat(ing - gas).toFixed(2) + 'EUR';
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdAgenda(chatId, msgId) {
  var hoy = new Date().toISOString().slice(0, 10);
  var lista = db.prepare("SELECT id, cliente_nombre, telefono, hora, tipo, motivo, estado FROM tienda_agenda WHERE fecha = ? ORDER BY hora ASC").all(hoy);
  if (!lista.length) return sendMsg(chatId, 'No hay citas en la agenda de hoy.');
  var t = 'Agenda de hoy (' + hoy + '):\n';
  lista.forEach(function(r) { t += '- ' + (r.hora || '') + ' ' + r.cliente_nombre + (r.telefono ? ' Tel:' + r.telefono : '') + ' [' + r.estado + ']\n'; });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdInventario(chatId, msgId) {
  var lista = db.prepare("SELECT nombre, cantidad, stock_minimo FROM tienda_inventario WHERE cantidad <= stock_minimo ORDER BY cantidad ASC LIMIT 10").all();
  if (!lista.length) return sendMsg(chatId, 'No hay productos con stock minimo.');
  var t = 'Inventario bajo minimo:\n';
  lista.forEach(function(r) { t += '- ' + r.nombre + ' | Stock: ' + r.cantidad + ' (min: ' + r.stock_minimo + ')\n'; });
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

function cmdServidor(chatId, msgId) {
  var fs = require('fs');
  var path = require('path');
  var dbSize = '0 B';
  try { var s = fs.statSync(path.join(__dirname, '..', 'movilbro.db')); dbSize = (s.size / 1024 / 1024).toFixed(2) + ' MB'; } catch(e) {}
  var uptime = process.uptime();
  var horas = Math.floor(uptime / 3600);
  var mins = Math.floor((uptime % 3600) / 60);
  var t = 'Salud del servidor:\n'
    + 'Activo desde: ' + new Date(Date.now() - uptime * 1000).toLocaleString('es-ES') + '\n'
    + 'Tiempo activo: ' + horas + 'h ' + mins + 'm\n'
    + 'Tamano BD: ' + dbSize + '\n'
    + 'Node: ' + process.version + '\n'
    + 'Version CRM: 1.0.0';
  if (msgId) editMsg(chatId, msgId, t, getMenuKeyboard());
  else sendMsg(chatId, t);
}

// ---- notificaciones automaticas ----
async function notifyServerStart() {
  var chatId = getChatId();
  if (!chatId) return;
  await sendMsg(chatId, 'Servidor CRM iniciado - ' + new Date().toLocaleString('es-ES'));
  await sendMenu(chatId);
}

async function sendDailySummary() {
  var chatId = getChatId();
  if (!chatId) return;
  await sendMsg(chatId, 'Resumen diario automatico:');
  cmdResumen(chatId, null);
}

async function notifyNewOrder(detalles) {
  var chatId = getChatId();
  if (!chatId) return;
  sendMsg(chatId, 'Nueva orden creada: ' + detalles);
}

async function notifyNewTicket(detalles) {
  var chatId = getChatId();
  if (!chatId) return;
  sendMsg(chatId, 'Nuevo ticket: ' + detalles);
}

module.exports = { router, sendMsg, notifyServerStart, sendDailySummary, notifyNewOrder, notifyNewTicket };
