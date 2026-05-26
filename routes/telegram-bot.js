const express = require('express');
const { db } = require('../database');
const LikesAPI = require('../likes-api');
const https = require('https');
const fs = require('fs');
const path = require('path');
const router = express.Router();

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

function sendMsg(chatId, text) { return apiCall('sendMessage', { chat_id: chatId, text: text }); }

function sendMenu(chatId, text) {
  return apiCall('sendMessage', {
    chat_id: chatId,
    text: text || 'CRM Movilbro - Funciones\nElige una opcion:',
    reply_markup: {
      inline_keyboard: [
        [{ text: '\uD83D\uDD04 Backup BD', callback_data: 'cmd_backup' }, { text: '\uD83D\uDCCA Resumen diario', callback_data: 'cmd_resumen' }],
        [{ text: '\uD83D\uDCC8 KPIs generales', callback_data: 'cmd_stats' }, { text: '\uD83D\uDC64 Buscar cliente', callback_data: 'cmd_cliente' }],
        [{ text: '\uD83C\uDFAB Tickets', callback_data: 'cmd_tickets' }, { text: '\uD83D\uDCF1 Portabilidades', callback_data: 'cmd_portabilidades' }],
        [{ text: '\uD83D\uDCB0 Facturaci\u00f3n', callback_data: 'cmd_facturacion' }, { text: '\uD83D\uDCE6 \u00d3rdenes', callback_data: 'cmd_ordenes' }],
        [{ text: '\uD83D\uDD27 Instalaciones', callback_data: 'cmd_instalaciones' }, { text: '\uD83D\uDCE1 \u00daltimas altas', callback_data: 'cmd_altas' }],
        [{ text: '\uD83D\uDD14 Bajas', callback_data: 'cmd_bajas' }, { text: '\uD83D\uDCB3 Cobros', callback_data: 'cmd_cobros' }],
        [{ text: '\uD83D\uDCDD Encuestas', callback_data: 'cmd_encuestas' }, { text: '\uD83D\uDFE2 Caja del d\u00eda', callback_data: 'cmd_caja' }],
        [{ text: '\uD83D\uDCC5 Agenda', callback_data: 'cmd_agenda' }, { text: '\uD83D\uDCE6 Inventario', callback_data: 'cmd_inventario' }],
        [{ text: '\uD83D\uDEE1\uFE0F Servidor', callback_data: 'cmd_servidor' }]
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

function getMenuKeyboard() {
  return [
    [{ text: '\uD83D\uDD04 Backup BD', callback_data: 'cmd_backup' }, { text: '\uD83D\uDCCA Resumen diario', callback_data: 'cmd_resumen' }],
    [{ text: '\uD83D\uDCC8 KPIs generales', callback_data: 'cmd_stats' }, { text: '\uD83D\uDC64 Buscar cliente', callback_data: 'cmd_cliente' }],
    [{ text: '\uD83C\uDFAB Tickets', callback_data: 'cmd_tickets' }, { text: '\uD83D\uDCF1 Portabilidades', callback_data: 'cmd_portabilidades' }],
    [{ text: '\uD83D\uDCB0 Facturaci\u00f3n', callback_data: 'cmd_facturacion' }, { text: '\uD83D\uDCE6 \u00d3rdenes', callback_data: 'cmd_ordenes' }],
    [{ text: '\uD83D\uDD27 Instalaciones', callback_data: 'cmd_instalaciones' }, { text: '\uD83D\uDCE1 \u00daltimas altas', callback_data: 'cmd_altas' }],
    [{ text: '\uD83D\uDD14 Bajas', callback_data: 'cmd_bajas' }, { text: '\uD83D\uDCB3 Cobros', callback_data: 'cmd_cobros' }],
    [{ text: '\uD83D\uDCDD Encuestas', callback_data: 'cmd_encuestas' }, { text: '\uD83D\uDFE2 Caja del d\u00eda', callback_data: 'cmd_caja' }],
    [{ text: '\uD83D\uDCC5 Agenda', callback_data: 'cmd_agenda' }, { text: '\uD83D\uDCE6 Inventario', callback_data: 'cmd_inventario' }],
    [{ text: '\uD83D\uDEE1\uFE0F Servidor', callback_data: 'cmd_servidor' }]
  ];
}

// ---- webhook ----
router.post('/webhook', function(req, res) {
  var update = req.body;
  if (!update) { res.sendStatus(200); return; }

  if (update.callback_query) {
    var cq = update.callback_query;
    var chatId = cq.message.chat.id;
    var msgId = cq.message.message_id;
    var data = cq.data || '';
    var cbId = cq.id;

    if (data === 'cmd_ayuda' || data === 'cmd_menu') {
      editMsg(chatId, msgId, 'CRM Movilbro - Funciones\nElige una opcion pulsando un boton.', getMenuKeyboard());
      answerCb(cbId, 'Men\u00fa actualizado');
    } else {
      answerCb(cbId, '\u23F3 Procesando...');
      ejecutarComando(data, chatId, msgId);
    }
    res.sendStatus(200);
    return;
  }

  if (update.message && update.message.text) {
    var chatId = update.message.chat.id;
    var text = update.message.text.trim();

    if (esperando[chatId]) {
      var accion = esperando[chatId];
      delete esperando[chatId];
      if (accion === 'cliente') buscarCliente(chatId, text, null);
      else if (accion === 'backup') ejecutarBackup(chatId, null);
      res.sendStatus(200);
      return;
    }

    var parts = text.split(' ');
    var first = parts[0].toLowerCase();
    var rest = parts.slice(1).join(' ');

    if (first === '/start' || first === '/funciones' || first === '/menu' || first === '/acciones') {
      if (rest && !isNaN(rest)) {
        var num = parseInt(rest);
        var mapa = { 1:'cmd_backup',2:'cmd_resumen',3:'cmd_stats',4:'cmd_cliente',5:'cmd_tickets',6:'cmd_portabilidades',7:'cmd_facturacion',8:'cmd_ordenes',9:'cmd_instalaciones',10:'cmd_altas',11:'cmd_bajas',12:'cmd_cobros',13:'cmd_encuestas',14:'cmd_caja',15:'cmd_agenda',16:'cmd_inventario',17:'cmd_servidor' };
        if (mapa[num]) ejecutarComando(mapa[num], chatId, null);
      } else {
        sendMenu(chatId);
      }
      res.sendStatus(200);
      return;
    }

    if (first === '/backup') safeRun(ejecutarBackup, chatId, null);
    else if (first === '/resumen' || first === '/summary') safeRun(cmdResumen, chatId, null);
    else if (first === '/stats' || first === '/kpi') safeRun(cmdStats, chatId, null);
    else if (first === '/cliente' || first === '/clientes') { if (rest) safeRun(function(c,m){buscarCliente(c,rest,m);}, chatId, null); else pedirCliente(chatId); }
    else if (first === '/tickets' || first === '/ticket') safeRun(cmdTickets, chatId, null);
    else if (first === '/portabilidades' || first === '/porta') safeRun(cmdPortabilidades, chatId, null);
    else if (first === '/facturacion' || first === '/billing') safeRun(cmdFacturacion, chatId, null);
    else if (first === '/ordenes' || first === '/orders') safeRun(cmdOrdenes, chatId, null);
    else if (first === '/instalaciones') safeRun(cmdInstalaciones, chatId, null);
    else if (first === '/altas') safeRun(cmdAltas, chatId, null);
    else if (first === '/bajas') safeRun(cmdBajas, chatId, null);
    else if (first === '/cobros') safeRun(cmdCobros, chatId, null);
    else if (first === '/encuestas') safeRun(cmdEncuestas, chatId, null);
    else if (first === '/caja') safeRun(cmdCaja, chatId, null);
    else if (first === '/agenda') safeRun(cmdAgenda, chatId, null);
    else if (first === '/inventario') safeRun(cmdInventario, chatId, null);
    else if (first === '/servidor' || first === '/health') safeRun(cmdServidor, chatId, null);
    else sendMsg(chatId, '\u2753 No te entiendo. Escribe /funciones para ver el men\u00fa.');

    res.sendStatus(200);
    return;
  }

  res.sendStatus(200);
});

function safeRun(fn, chatId, msgId) {
  try {
    var r = fn(chatId, msgId);
    if (r && typeof r.then === 'function') r.catch(function(e) { sendMsg(chatId, '\u274C Error: ' + e.message); });
  } catch (e) {
    sendMsg(chatId, '\u274C Error: ' + e.message);
  }
}

function ejecutarComando(data, chatId, msgId) {
  switch (data) {
    case 'cmd_backup': return safeRun(ejecutarBackup, chatId, msgId);
    case 'cmd_resumen': return safeRun(function(c,m){ cmdResumen(c,m); }, chatId, msgId);
    case 'cmd_stats': return safeRun(function(c,m){ cmdStats(c,m); }, chatId, msgId);
    case 'cmd_cliente': return pedirCliente(chatId);
    case 'cmd_tickets': return safeRun(function(c,m){ cmdTickets(c,m); }, chatId, msgId);
    case 'cmd_portabilidades': return safeRun(function(c,m){ cmdPortabilidades(c,m); }, chatId, msgId);
    case 'cmd_facturacion': return safeRun(function(c,m){ cmdFacturacion(c,m); }, chatId, msgId);
    case 'cmd_ordenes': return safeRun(function(c,m){ cmdOrdenes(c,m); }, chatId, msgId);
    case 'cmd_instalaciones': return safeRun(function(c,m){ cmdInstalaciones(c,m); }, chatId, msgId);
    case 'cmd_altas': return safeRun(function(c,m){ cmdAltas(c,m); }, chatId, msgId);
    case 'cmd_bajas': return safeRun(function(c,m){ cmdBajas(c,m); }, chatId, msgId);
    case 'cmd_cobros': return safeRun(function(c,m){ cmdCobros(c,m); }, chatId, msgId);
    case 'cmd_encuestas': return safeRun(function(c,m){ cmdEncuestas(c,m); }, chatId, msgId);
    case 'cmd_caja': return safeRun(function(c,m){ cmdCaja(c,m); }, chatId, msgId);
    case 'cmd_agenda': return safeRun(function(c,m){ cmdAgenda(c,m); }, chatId, msgId);
    case 'cmd_inventario': return safeRun(function(c,m){ cmdInventario(c,m); }, chatId, msgId);
    case 'cmd_servidor': return safeRun(function(c,m){ cmdServidor(c,m); }, chatId, msgId);
    default: return sendMsg(chatId, '\u2753 Comando no reconocido.');
  }
}

// ---- API helper ----
async function getApi() {
  try {
    var api = LikesAPI.getApiInstance();
    await api.getToken();
    return api;
  } catch(e) {
    return null;
  }
}

function formatearFecha(f) {
  if (!f) return '-';
  return f.slice(0, 10);
}

function acortar(t, max) {
  if (!t) return '-';
  return t.length > max ? t.slice(0, max) + '...' : t;
}

// ============ HANDLERS ============

// ---- BACKUP ----
function ejecutarBackup(chatId, msgId) {
  sendMsg(chatId, '\uD83D\uDDC2 Generando backup...');
  try {
    var sb = require('./backup');
    sb.sendBackup().then(function(r) {
      if (r && r.success) sendMsg(chatId, '\u2705 Backup enviado correctamente a Telegram.');
      else sendMsg(chatId, '\u274C Error backup: ' + ((r && r.error) || 'desconocido'));
    });
  } catch(e) {
    sendMsg(chatId, '\u274C Error: ' + e.message);
  }
}

// ---- RESUMEN DIARIO ----
async function cmdResumen(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando resumen diario...');
  var api = await getApi();
  var hoy = new Date().toISOString().slice(0, 10);
  var t = '\uD83D\uDCCA Resumen diario\n\uD83D\uDCC5 ' + hoy + '\n\n';

  if (api) {
    try {
      var clientes = await api.getCustomers();
      var subs = await api.getSubscriptions();
      var tickets = await api.getTickets();
      t += '\uD83C\uDFE6 Clientes API: ' + (clientes ? clientes.length : 0) + '\n';
      t += '\uD83D\uDCF1 Suscripciones API: ' + (subs ? subs.length : 0) + '\n';
      var altasHoy = subs ? subs.filter(function(s) { return s.fecha_alta && s.fecha_alta.slice(0,10) === hoy; }).length : 0;
      var bajasHoy = subs ? subs.filter(function(s) { return (s.estado === 'TERMINATED' || s.estado === 'CANCELED') && s.fecha_baja && s.fecha_baja.slice(0,10) === hoy; }).length : 0;
      t += '\uD83D\uDCE1 Altas hoy: ' + altasHoy + '\n';
      t += '\uD83D\uDD14 Bajas hoy: ' + bajasHoy + '\n';
      t += '\uD83C\uDFAB Tickets abiertos: ' + (tickets ? tickets.filter(function(tk) { return tk.estado !== 'CLOSED' && tk.estado !== 'closed'; }).length : 0) + '\n';
    } catch(e) { t += '\u26A0\uFE0F Error al obtener datos API\n'; }
  }

  // Datos locales
  var ordPend = db.prepare("SELECT COUNT(*) as c FROM orders WHERE estado NOT IN ('completada','cancelada')").get().c;
  var cliLocal = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
  t += '\uD83D\uDCE6 \u00d3rdenes pendientes: ' + ordPend + ' (local)\n';
  t += '\uD83C\uDFE6 Clientes locales: ' + cliLocal + '\n';

  sendMsg(chatId, t);
}

// ---- STATS / KPIs ----
async function cmdStats(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando KPIs...');
  var api = await getApi();
  var t = '\uD83D\uDCC8 KPIs generales\n\n';

  if (api) {
    try {
      var clientes = await api.getCustomers();
      var subs = await api.getSubscriptions();
      var prods = await api.getProducts();
      var tickets = await api.getTickets();
      if (clientes) t += '\uD83C\uDFE6 Clientes API: ' + clientes.length + '\n';
      if (subs) {
        var activas = subs.filter(function(s) { return s.estado === 'ACTIVE' || s.estado === 'active'; });
        var bajas = subs.filter(function(s) { return s.estado === 'TERMINATED' || s.estado === 'CANCELED'; });
        t += '\uD83D\uDCF1 Suscripciones activas: ' + activas.length + '\n';
        t += '\uD83D\uDD14 Bajas totales: ' + bajas.length + '\n';
      }
      if (prods) t += '\uD83D\uDCE6 Productos: ' + prods.length + '\n';
      if (tickets) t += '\uD83C\uDFAB Tickets: ' + tickets.length + '\n';
    } catch(e) { t += '\u26A0\uFE0F Error API: ' + e.message + '\n'; }
  }

  t += '\n\uD83D\uDCCD Datos locales:\n';
  t += '\uD83D\uDC65 Usuarios CRM: ' + db.prepare('SELECT COUNT(*) as c FROM users').get().c + '\n';
  t += '\uD83D\uDCC4 Clientes en BD local: ' + db.prepare('SELECT COUNT(*) as c FROM clients').get().c + '\n';
  sendMsg(chatId, t);
}

// ---- CLIENTE (buscar) ----
function pedirCliente(chatId) {
  esperando[chatId] = 'cliente';
  sendMsg(chatId, '\uD83D\uDC64 Buscar cliente\nEscribe tel\u00e9fono, nombre o email del cliente:');
}

async function buscarCliente(chatId, query, msgId) {
  var q = '%' + query + '%';

  // Buscar en BD local primero
  var locales = db.prepare("SELECT id, nombre, telefono, email, dni_nif, direccion FROM clients WHERE nombre LIKE ? OR telefono LIKE ? OR email LIKE ? OR dni_nif LIKE ? LIMIT 5").all(q, q, q, q);

  var t = '\uD83D\uDC64 Resultados para: ' + query + '\n\n';

  if (locales.length > 0) {
    t += '\uD83C\uDFE6 Clientes locales:\n';
    locales.forEach(function(r) {
      t += '\u2022 ' + r.nombre;
      if (r.telefono) t += ' | \uD83D\uDCDE ' + r.telefono;
      if (r.email) t += ' | \u2709\uFE0F ' + r.email;
      t += '\n';
    });
  } else {
    t += '\uD83D\uDD0D No encontrado en BD local.\n';
  }

  // Buscar en API
  var api = await getApi();
  if (api) {
    try {
      var clientesApi = await api.getCustomers();
      var filtrados = clientesApi.filter(function(c) {
        var nom = (c.nombre || c.name || c.fullName || '').toLowerCase();
        var tel = (c.telefono || c.phone || c.mobile || '').toLowerCase();
        var email = (c.email || '').toLowerCase();
        var nif = (c.dni_nif || c.dni || c.nif || c.fiscalId || '').toLowerCase();
        var busq = query.toLowerCase();
        return nom.indexOf(busq) !== -1 || tel.indexOf(busq) !== -1 || email.indexOf(busq) !== -1 || nif.indexOf(busq) !== -1;
      }).slice(0, 5);

      if (filtrados.length > 0) {
        t += '\n\uD83C\uDF10 Clientes API:\n';
        filtrados.forEach(function(c) {
          var nombre = c.nombre || c.name || c.fullName || 'Sin nombre';
          var tel = c.telefono || c.phone || c.mobile || '';
          var email = c.email || '';
          t += '\u2022 ' + nombre;
          if (tel) t += ' | \uD83D\uDCDE ' + tel;
          if (email) t += ' | \u2709\uFE0F ' + email;
          t += '\n';
        });
      } else {
        t += '\uD83C\uDF10 No encontrado en API.\n';
      }
    } catch(e) {
      t += '\n\u26A0\uFE0F Error al consultar API: ' + e.message + '\n';
    }
  } else {
    t += '\n\u26A0\uFE0F API no configurada. Solo se muestran clientes locales.\n';
  }

  sendMsg(chatId, t);
}

// ---- TICKETS ----
async function cmdTickets(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando tickets...');
  var api = await getApi();
  if (api) {
    try {
      var tickets = await api.getTickets();
      var abiertos = tickets.filter(function(t) { return t.estado !== 'CLOSED' && t.estado !== 'closed' && t.estado !== 'CERRADO'; }).slice(0, 10);
      if (abiertos.length === 0) { sendMsg(chatId, '\u2705 No hay tickets abiertos.'); return; }
      var t = '\uD83C\uDFAB Tickets abiertos (' + abiertos.length + ')\n\n';
      abiertos.forEach(function(tk) {
        var p = tk.prioridad === 'alta' || tk.prioridad === 'HIGH' ? '\uD83D\uDD34' : tk.prioridad === 'media' || tk.prioridad === 'MEDIUM' ? '\uD83D\uDFE1' : '\uD83D\uDFE2';
        t += p + ' #' + tk.id + ' ' + acortar(tk.asunto || tk.subject || 'Sin asunto', 40) + ' [' + (tk.estado || '-') + ']\n';
      });
      sendMsg(chatId, t);
      return;
    } catch(e) {}
  }

  // Fallback local
  var locales = db.prepare("SELECT id, asunto, prioridad, estado FROM tickets WHERE estado != 'cerrado' ORDER BY id DESC LIMIT 10").all();
  if (locales.length === 0) { sendMsg(chatId, '\u2705 No hay tickets abiertos.'); return; }
  var t = '\uD83C\uDFAB Tickets locales\n\n';
  locales.forEach(function(r) {
    var p = r.prioridad === 'alta' ? '\uD83D\uDD34' : r.prioridad === 'media' ? '\uD83D\uDFE1' : '\uD83D\uDFE2';
    t += p + ' #' + r.id + ' ' + acortar(r.asunto, 40) + ' [' + r.estado + ']\n';
  });
  sendMsg(chatId, t);
}

// ---- PORTABILIDADES ----
async function cmdPortabilidades(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando portabilidades...');
  var api = await getApi();
  if (api) {
    try {
      var portas = await api.getPortabilities();
      if (portas.length === 0) { sendMsg(chatId, '\uD83D\uDCF1 No hay portabilidades activas.'); return; }
      var recientes = portas.slice(0, 10);
      var t = '\uD83D\uDCF1 Portabilidades (' + portas.length + ' total)\n\n';
      recientes.forEach(function(p) {
        t += '\u2022 L\u00ednea: ' + (p.linea || p.line || p.phone || '-') + '\n';
        t += '  Estado: ' + (p.estado || p.status || '-') + ' | ' + formatearFecha(p.fecha || p.created_at || p.date) + '\n';
      });
      sendMsg(chatId, t);
      return;
    } catch(e) {}
  }

  // Fallback local
  var locales = db.prepare("SELECT linea, producto, estado FROM subscriptions WHERE estado LIKE '%portabilidad%' OR estado = 'en_curso' LIMIT 10").all();
  if (locales.length === 0) { sendMsg(chatId, '\uD83D\uDCF1 No hay portabilidades activas.'); return; }
  var t = '\uD83D\uDCF1 Portabilidades locales\n\n';
  locales.forEach(function(r) { t += '\u2022 ' + (r.linea || '-') + ' [' + r.estado + ']\n'; });
  sendMsg(chatId, t);
}

// ---- FACTURACION ----
async function cmdFacturacion(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando facturaci\u00f3n...');
  var mes = new Date().toISOString().slice(0, 7);
  var t = '\uD83D\uDCB0 Facturaci\u00f3n\n\n';

  // Datos de API Payments
  var api = await getApi();
  if (api) {
    try {
      var pagos = await api.getPayments();
      var pagosMes = pagos.filter(function(p) { return p.fecha && p.fecha.slice(0,7) === mes; });
      var totalPagos = 0;
      pagosMes.forEach(function(p) { totalPagos += parseFloat(p.importe || p.amount || p.total || 0); });
      t += '\uD83C\uDF10 API Likes Telecom\n';
      t += 'Pagos del mes: ' + pagosMes.length + '\n';
      t += 'Total: ' + totalPagos.toFixed(2) + '\u20AC\n\n';
    } catch(e) { t += '\u26A0\uFE0F API no disponible\n\n'; }
  } else {
    t += '\u26A0\uFE0F API no configurada\n\n';
  }

  // Datos locales Panel Tienda
  var ing = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='ingreso' AND fecha LIKE ?").get(mes + '%').t;
  var gas = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='gasto' AND fecha LIKE ?").get(mes + '%').t;
  t += '\uD83C\uDFEA Panel Tienda (caja)\n';
  t += 'Ingresos: ' + parseFloat(ing).toFixed(2) + '\u20AC\n';
  t += 'Gastos: ' + parseFloat(gas).toFixed(2) + '\u20AC\n';
  t += 'Saldo: ' + parseFloat(ing - gas).toFixed(2) + '\u20AC\n';

  sendMsg(chatId, t);
}

// ---- ORDENES ----
async function cmdOrdenes(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando \u00f3rdenes...');
  var api = await getApi();
  if (api) {
    try {
      var ordenes = await api.getOrders();
      var pendientes = ordenes.filter(function(o) { return o.estado !== 'COMPLETED' && o.estado !== 'CANCELED' && o.estado !== 'completed' && o.estado !== 'canceled'; }).slice(0, 10);
      if (pendientes.length > 0) {
        var t = '\uD83D\uDCE6 \u00d3rdenes pendientes API\n\n';
        pendientes.forEach(function(o) {
          t += '\u2022 #' + (o.id || o.orderId || '-') + ' ' + acortar(o.tipo || o.type || o.producto || o.product || '-', 30) + ' [' + (o.estado || o.status || '-') + ']\n';
        });
        sendMsg(chatId, t);
        return;
      }
    } catch(e) {}
  }

  // Fallback local
  var locales = db.prepare("SELECT id, tipo, estado, producto FROM orders WHERE estado NOT IN ('completada','cancelada') ORDER BY id DESC LIMIT 10").all();
  if (locales.length === 0) { sendMsg(chatId, '\u2705 No hay \u00f3rdenes pendientes.'); return; }
  var t = '\uD83D\uDCE6 \u00d3rdenes locales pendientes\n\n';
  locales.forEach(function(r) { t += '\u2022 #' + r.id + ' ' + r.tipo + ' [' + r.estado + ']\n'; });
  sendMsg(chatId, t);
}

// ---- INSTALACIONES ----
async function cmdInstalaciones(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando instalaciones...');
  var api = await getApi();
  if (api) {
    try {
      var instalaciones = await api.getInstallations();
      if (instalaciones.length > 0) {
        var prox = instalaciones.slice(0, 10);
        var t = '\uD83D\uDD27 Instalaciones (' + instalaciones.length + ' total)\n\n';
        prox.forEach(function(i) {
          t += '\u2022 ' + (i.cliente_nombre || i.customer_name || i.nombre || 'Cliente') + '\n';
          if (i.direccion || i.address) t += '  \uD83D\uDCCD ' + (i.direccion || i.address) + '\n';
          t += '  \uD83D\uDCC5 ' + formatearFecha(i.fecha_instalacion || i.fecha || i.date || i.scheduled_date) + ' [' + (i.estado || i.status || '-') + ']\n';
        });
        sendMsg(chatId, t);
        return;
      }
    } catch(e) {}
  }

  // Buscar en BD local (tabla instalaciones recien creada)
  var hoy = new Date().toISOString().slice(0, 10);
  try {
    var locales = db.prepare("SELECT id, cliente_nombre, direccion, fecha_instalacion, estado FROM instalaciones WHERE fecha_instalacion >= ? ORDER BY fecha_instalacion ASC LIMIT 10").all(hoy);
    if (locales.length > 0) {
      var t = '\uD83D\uDD27 Instalaciones locales\n\n';
      locales.forEach(function(r) { t += '\u2022 ' + r.cliente_nombre + ' | ' + (r.direccion || '-') + ' [' + r.estado + ']\n'; });
      sendMsg(chatId, t);
      return;
    }
  } catch(e) {}

  sendMsg(chatId, '\uD83D\uDD27 No hay instalaciones programadas.');
}

// ---- ALTAS RECIENTES ----
async function cmdAltas(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando altas...');
  var api = await getApi();
  if (api) {
    try {
      var subs = await api.getSubscriptions();
      if (subs.length > 0) {
        var altas = subs.filter(function(s) { return s.fecha_alta || s.created_at || s.start_date; }).sort(function(a, b) {
          var fa = a.fecha_alta || a.created_at || a.start_date || '';
          var fb = b.fecha_alta || b.created_at || b.start_date || '';
          return fb.localeCompare(fa);
        }).slice(0, 10);
        var t = '\uD83D\uDCE1 \u00daltimas altas\n\n';
        altas.forEach(function(s) {
          t += '\u2022 ' + (s.linea || s.line || s.phone || 'Sin l\u00ednea') + '\n';
          t += '  Producto: ' + (s.producto || s.product || s.plan || '-') + ' | ' + formatearFecha(s.fecha_alta || s.created_at || s.start_date) + '\n';
        });
        sendMsg(chatId, t);
        return;
      }
    } catch(e) {}
  }

  // Fallback local
  var locales = db.prepare("SELECT linea, producto, fecha_alta FROM subscriptions ORDER BY fecha_alta DESC LIMIT 10").all();
  if (locales.length === 0) { sendMsg(chatId, '\uD83D\uDCE1 No hay altas registradas.'); return; }
  var t = '\uD83D\uDCE1 \u00daltimas altas locales\n\n';
  locales.forEach(function(r) { t += '\u2022 ' + (r.linea || '-') + ' | ' + (r.producto || '-') + ' (' + formatearFecha(r.fecha_alta) + ')\n'; });
  sendMsg(chatId, t);
}

// ---- BAJAS RECIENTES ----
async function cmdBajas(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando bajas...');
  var api = await getApi();
  if (api) {
    try {
      var subs = await api.getSubscriptions();
      if (subs.length > 0) {
        var bajas = subs.filter(function(s) { return s.estado === 'TERMINATED' || s.estado === 'CANCELED' || s.estado === 'BAJA'; }).sort(function(a, b) {
          var fa = a.fecha_baja || a.updated_at || '';
          var fb = b.fecha_baja || b.updated_at || '';
          return fb.localeCompare(fa);
        }).slice(0, 10);
        if (bajas.length > 0) {
          var t = '\uD83D\uDD14 \u00daltimas bajas\n\n';
          bajas.forEach(function(s) {
            t += '\u2022 ' + (s.linea || s.line || s.phone || 'Sin l\u00ednea') + '\n';
            t += '  Producto: ' + (s.producto || s.product || s.plan || '-') + ' | Baja: ' + formatearFecha(s.fecha_baja || s.updated_at) + '\n';
          });
          sendMsg(chatId, t);
          return;
        }
      }
    } catch(e) {}
  }

  // Fallback local
  var locales = db.prepare("SELECT linea, producto, fecha_baja FROM subscriptions WHERE estado = 'baja' ORDER BY fecha_baja DESC LIMIT 10").all();
  if (locales.length === 0) { sendMsg(chatId, '\uD83D\uDD14 No hay bajas registradas.'); return; }
  var t = '\uD83D\uDD14 \u00daltimas bajas locales\n\n';
  locales.forEach(function(r) { t += '\u2022 ' + (r.linea || '-') + ' | ' + (r.producto || '-') + ' (' + formatearFecha(r.fecha_baja) + ')\n'; });
  sendMsg(chatId, t);
}

// ---- COBROS PENDIENTES ----
async function cmdCobros(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando cobros...');
  var api = await getApi();
  if (api) {
    try {
      var pagos = await api.getPayments();
      var pendientes = pagos.filter(function(p) { return p.estado !== 'PAID' && p.estado !== 'paid' && p.estado !== 'pagado'; }).slice(0, 10);
      if (pendientes.length > 0) {
        var t = '\uD83D\uDCB3 Cobros pendientes API\n\n';
        pendientes.forEach(function(p) {
          t += '\u2022 ' + (p.concepto || p.description || p.concept || 'Pago') + '\n';
          t += '  Importe: ' + parseFloat(p.importe || p.amount || p.total || 0).toFixed(2) + '\u20AC | Vence: ' + formatearFecha(p.fecha_vencimiento || p.due_date || p.fecha) + '\n';
        });
        sendMsg(chatId, t);
        return;
      }
    } catch(e) {}
  }

  // Fallback local
  var locales = db.prepare("SELECT id, concepto, importe, fecha_vencimiento, estado FROM invoices WHERE estado != 'pagado' ORDER BY fecha_vencimiento ASC LIMIT 10").all();
  if (locales.length === 0) { sendMsg(chatId, '\u2705 No hay cobros pendientes.'); return; }
  var t = '\uD83D\uDCB3 Cobros pendientes locales\n\n';
  locales.forEach(function(r) { t += '\u2022 ' + r.concepto + ' | ' + parseFloat(r.importe).toFixed(2) + '\u20AC [' + r.estado + ']\n'; });
  sendMsg(chatId, t);
}

// ---- ENCUESTAS ----
async function cmdEncuestas(chatId, msgId) {
  await sendMsg(chatId, '\u23F3 Cargando encuestas...');
  var api = await getApi();
  if (api) {
    try {
      var encuestas = await api.getSurveys();
      if (encuestas.length > 0) {
        var ultimas = encuestas.slice(0, 5);
        var t = '\uD83D\uDCDD \u00daltimas encuestas\n\n';
        ultimas.forEach(function(e) {
          var estrellas = '';
          var pts = parseInt(e.puntuacion || e.score || e.rating || 0);
          for (var i = 0; i < pts; i++) estrellas += '\u2B50';
          t += '\u2022 ' + (e.cliente_nombre || e.customer_name || e.nombre || 'An\u00f3nimo') + '\n';
          if (estrellas) t += '  Puntuaci\u00f3n: ' + estrellas + ' (' + pts + '/5)\n';
          t += '  Fecha: ' + formatearFecha(e.fecha || e.created_at || e.date) + '\n';
        });
        sendMsg(chatId, t);
        return;
      }
    } catch(e) {}
  }

  // Fallback local
  try {
    var locales = db.prepare("SELECT id, cliente_nombre, puntuacion, created_at FROM surveys ORDER BY created_at DESC LIMIT 5").all();
    if (locales.length > 0) {
      var t = '\uD83D\uDCDD \u00daltimas encuestas locales\n\n';
      locales.forEach(function(r) { t += '\u2022 ' + r.cliente_nombre + ' | ' + (r.puntuacion || '-') + '/5\n'; });
      sendMsg(chatId, t);
      return;
    }
  } catch(e) {}

  sendMsg(chatId, '\uD83D\uDCDD No hay encuestas registradas.');
}

// ---- CAJA DEL DIA (Panel Tienda) ----
function cmdCaja(chatId, msgId) {
  var hoy = new Date().toISOString().slice(0, 10);
  try {
    var ing = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='ingreso' AND fecha = ?").get(hoy).t;
    var gas = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='gasto' AND fecha = ?").get(hoy).t;
    var ops = db.prepare("SELECT COUNT(*) as c FROM tienda_caja WHERE fecha = ?").get(hoy).c;
    var t = '\uD83D\uDFE2 Caja del d\u00eda (' + hoy + ')\n\n';
    t += '\uD83C\uDFEA Panel Tienda\n';
    t += 'Operaciones: ' + ops + '\n';
    t += 'Ingresos: ' + parseFloat(ing).toFixed(2) + '\u20AC\n';
    t += 'Gastos: ' + parseFloat(gas).toFixed(2) + '\u20AC\n';
    t += 'Saldo: ' + parseFloat(ing - gas).toFixed(2) + '\u20AC\n';
    sendMsg(chatId, t);
  } catch(e) {
    sendMsg(chatId, '\u274C Error al consultar caja: ' + e.message);
  }
}

// ---- AGENDA (Panel Tienda) ----
function cmdAgenda(chatId, msgId) {
  var hoy = new Date().toISOString().slice(0, 10);
  try {
    var lista = db.prepare("SELECT id, cliente_nombre, telefono, hora, tipo, motivo, estado FROM tienda_agenda WHERE fecha = ? ORDER BY hora ASC").all(hoy);
    if (lista.length === 0) { sendMsg(chatId, '\uD83D\uDCC5 No hay citas en la agenda de hoy.'); return; }
    var t = '\uD83D\uDCC5 Agenda de hoy (' + hoy + ')\n\n';
    lista.forEach(function(r) {
      t += '\u2022 ' + (r.hora || '') + ' ' + r.cliente_nombre;
      if (r.telefono) t += ' (\uD83D\uDCDE' + r.telefono + ')';
      t += ' [' + r.estado + ']\n';
    });
    sendMsg(chatId, t);
  } catch(e) {
    sendMsg(chatId, '\u274C Error al consultar agenda: ' + e.message);
  }
}

// ---- INVENTARIO (Panel Tienda) ----
function cmdInventario(chatId, msgId) {
  try {
    var lista = db.prepare("SELECT nombre, cantidad, stock_minimo FROM tienda_inventario WHERE cantidad <= stock_minimo ORDER BY cantidad ASC LIMIT 10").all();
    if (lista.length === 0) { sendMsg(chatId, '\uD83D\uDCE6 No hay productos con stock m\u00ednimo.'); return; }
    var t = '\uD83D\uDCE6 Inventario bajo m\u00ednimo\n\n';
    lista.forEach(function(r) { t += '\u2022 ' + r.nombre + ' | Stock: ' + r.cantidad + ' (m\u00edn: ' + r.stock_minimo + ')\n'; });
    sendMsg(chatId, t);
  } catch(e) {
    sendMsg(chatId, '\u274C Error al consultar inventario: ' + e.message);
  }
}

// ---- SERVIDOR ----
function cmdServidor(chatId, msgId) {
  var dbSize = '0 B';
  try { var s = fs.statSync(path.join(__dirname, '..', 'movilbro.db')); dbSize = (s.size / 1024 / 1024).toFixed(2) + ' MB'; } catch(e) {}
  var uptime = process.uptime();
  var horas = Math.floor(uptime / 3600);
  var mins = Math.floor((uptime % 3600) / 60);
  var t = '\uD83D\uDEE1\uFE0F Salud del servidor\n\n'
    + 'Activo desde: ' + new Date(Date.now() - uptime * 1000).toLocaleString('es-ES') + '\n'
    + 'Tiempo activo: ' + horas + 'h ' + mins + 'm\n'
    + 'Tama\u00f1o BD: ' + dbSize + '\n'
    + 'Node: ' + process.version + '\n'
    + 'Plataforma: ' + process.platform + '\n'
    + 'API Tokens: ' + (getToken() ? '\u2705 Telegram' : '\u274C Telegram') + ' | ' + (db.prepare("SELECT value FROM settings WHERE key = 'likes_client_id'").get() ? '\u2705 Likes Telecom' : '\u274C Likes Telecom');
  sendMsg(chatId, t);
}

// ---- NOTIFICACIONES AUTOMATICAS ----
async function notifyServerStart() {
  var chatId = getChatId();
  if (!chatId) return;
  await sendMsg(chatId, '\uD83D\uDFE2 Servidor CRM iniciado - ' + new Date().toLocaleString('es-ES') + '\n\n' + '\uD83D\uDD14 Escribe /funciones para ver el men\u00fa.');
}

async function sendDailySummary() {
  var chatId = getChatId();
  if (!chatId) return;
  await sendMsg(chatId, '\uD83D\uDD14 Resumen diario autom\u00e1tico');
  await cmdResumen(chatId, null);
}

function notifyNewOrder(detalles) {
  var chatId = getChatId();
  if (!chatId) return;
  sendMsg(chatId, '\uD83D\uDCE6 Nueva orden creada\n' + (detalles || ''));
}

function notifyNewTicket(detalles) {
  var chatId = getChatId();
  if (!chatId) return;
  sendMsg(chatId, '\uD83C\uDFAB Nuevo ticket\n' + (detalles || ''));
}

module.exports = { router, sendMsg, notifyServerStart, sendDailySummary, notifyNewOrder, notifyNewTicket, registerBotCommands: registerBotCommands };

// ---- REGISTRAR COMANDOS EN TELEGRAM ----
function registerBotCommands() {
  var token = getToken();
  if (!token) return;
  var commands = [
    { command: 'funciones', description: 'Menu principal con todas las funciones' },
    { command: 'backup', description: 'Enviar backup de la base de datos' },
    { command: 'resumen', description: 'Resumen diario del CRM' },
    { command: 'stats', description: 'KPIs generales del CRM' },
    { command: 'cliente', description: 'Buscar cliente por telefono o nombre' },
    { command: 'tickets', description: 'Tickets pendientes' },
    { command: 'portabilidades', description: 'Estado de portabilidades' },
    { command: 'facturacion', description: 'Facturacion del mes' },
    { command: 'ordenes', description: 'Ordenes pendientes' },
    { command: 'instalaciones', description: 'Instalaciones programadas' },
    { command: 'altas', description: 'Ultimas altas realizadas' },
    { command: 'bajas', description: 'Ultimas bajas registradas' },
    { command: 'cobros', description: 'Cobros pendientes' },
    { command: 'encuestas', description: 'Ultimas encuestas de satisfaccion' },
    { command: 'caja', description: 'Caja del dia de hoy (Panel Tienda)' },
    { command: 'agenda', description: 'Agenda de hoy (Panel Tienda)' },
    { command: 'inventario', description: 'Inventario bajo minimo (Panel Tienda)' },
    { command: 'servidor', description: 'Salud del servidor' }
  ];
  var body = JSON.stringify({ commands: commands });
  var opts = {
    hostname: 'api.telegram.org',
    path: '/bot' + token + '/setMyCommands',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
  };
  var req = https.request(opts, function(res) { var d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() { console.log('[Bot] Comandos registrados:', d); }); });
  req.on('error', function(e) { console.log('[Bot] Error al registrar comandos:', e.message); });
  req.write(body);
  req.end();
}
