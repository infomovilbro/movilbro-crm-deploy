var express = require('express');
var db = require('../database').db;
var https = require('https');
var fs = require('fs');
var path = require('path');
var router = express.Router();

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

function tg(method, payload, cb) {
  var token = getToken();
  if (!token) { if (cb) cb(null); return; }
  try {
    var body = JSON.stringify(payload);
    var r = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + token + '/' + method,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { if (cb) { try { cb(JSON.parse(d)); } catch(e) { cb(null); } } });
    });
    r.on('error', function() { if (cb) cb(null); });
    r.write(body);
    r.end();
  } catch(e) { if (cb) cb(null); }
}

function msg(chatId, text) { tg('sendMessage', { chat_id: chatId, text: text }); }

function menu(chatId) {
  tg('sendMessage', {
    chat_id: chatId,
    text: 'CRM Movilbro - Funciones',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Backup BD', callback_data: 'c_backup' }, { text: 'Resumen', callback_data: 'c_resumen' }],
        [{ text: 'KPIs', callback_data: 'c_stats' }, { text: 'Buscar cliente', callback_data: 'c_cliente' }],
        [{ text: 'Tickets', callback_data: 'c_tickets' }, { text: 'Portabilidades', callback_data: 'c_porta' }],
        [{ text: 'Facturacion', callback_data: 'c_fact' }, { text: 'Ordenes', callback_data: 'c_ordenes' }],
        [{ text: 'Instalaciones', callback_data: 'c_inst' }, { text: 'Altas', callback_data: 'c_altas' }],
        [{ text: 'Bajas', callback_data: 'c_bajas' }, { text: 'Cobros', callback_data: 'c_cobros' }],
        [{ text: 'Encuestas', callback_data: 'c_enc' }, { text: 'Caja', callback_data: 'c_caja' }],
        [{ text: 'Agenda', callback_data: 'c_agenda' }, { text: 'Inventario', callback_data: 'c_inv' }],
        [{ text: 'Servidor', callback_data: 'c_serv' }, { text: 'Propuestas', callback_data: 'c_prop' }]
      ]
    }
  });
}

var espera = {};

router.post('/webhook', function(req, res) {
  var up = req.body;
  if (!up) { res.sendStatus(200); return; }

  // Boton inline pulsado
  if (up.callback_query) {
    var cq = up.callback_query;
    var cid = cq.message.chat.id;
    var mid = cq.message.message_id;
    var cbdata = cq.data || '';
    var cbid = cq.id;

    tg('answerCallbackQuery', { callback_query_id: cbid, text: 'Procesando...' });
    procesar(cbdata, cid, mid);
    res.sendStatus(200);
    return;
  }

  // Mensaje de texto
  if (up.message && up.message.text) {
    var cid = up.message.chat.id;
    var txt = up.message.text.trim();

    // Esperando respuesta del usuario
    if (espera[cid]) {
      var acc = espera[cid];
      delete espera[cid];
      if (acc === 'cliente') buscarCliente(cid, txt);
      else if (acc === 'propuesta') { db.prepare('INSERT INTO bot_propuestas (chat_id, texto) VALUES (?, ?)').run(String(cid), txt); msg(cid, '\u2705 Propuesta guardada.'); }
      res.sendStatus(200);
      return;
    }

    var p = txt.split(' ');
    var cmd = p[0].toLowerCase();
    var arg = p.slice(1).join(' ');

    if (cmd === '/start' || cmd === '/funciones' || cmd === '/menu') { menu(cid); res.sendStatus(200); return; }
    if (cmd === '/backup') { msg(cid, '\u23F3 Generando backup...'); hacerBackup(cid); res.sendStatus(200); return; }
    if (cmd === '/resumen') { resumen(cid); res.sendStatus(200); return; }
    if (cmd === '/stats') { stats(cid); res.sendStatus(200); return; }
    if (cmd === '/cliente' || cmd === '/clientes') { if (arg) buscarCliente(cid, arg); else { espera[cid] = 'cliente'; msg(cid, '\uD83D\uDC64 Escribe el telefono o nombre del cliente:'); } res.sendStatus(200); return; }
    if (cmd === '/tickets') { tickets(cid); res.sendStatus(200); return; }
    if (cmd === '/portabilidades' || cmd === '/porta') { portas(cid); res.sendStatus(200); return; }
    if (cmd === '/facturacion' || cmd === '/billing') { fact(cid); res.sendStatus(200); return; }
    if (cmd === '/ordenes' || cmd === '/orders') { ordenes(cid); res.sendStatus(200); return; }
    if (cmd === '/instalaciones') { instalaciones(cid); res.sendStatus(200); return; }
    if (cmd === '/altas') { msg(cid, '\uD83D\uDCE1 Altas disponibles en /resumen o CRM web.'); res.sendStatus(200); return; }
    if (cmd === '/bajas') { msg(cid, '\uD83D\uDD14 Bajas disponibles en /resumen o CRM web.'); res.sendStatus(200); return; }
    if (cmd === '/cobros') { cobros(cid); res.sendStatus(200); return; }
    if (cmd === '/encuestas') { msg(cid, '\uD83D\uDCDD Encuestas en CRM web (/surveys).'); res.sendStatus(200); return; }
    if (cmd === '/caja') { msg(cid, '\uD83D\uDFE2 Caja del dia en Panel Tienda del CRM.'); res.sendStatus(200); return; }
    if (cmd === '/agenda') { msg(cid, '\uD83D\uDCC5 Agenda en Panel Tienda del CRM.'); res.sendStatus(200); return; }
    if (cmd === '/inventario') { msg(cid, '\uD83D\uDCE6 Inventario en Panel Tienda del CRM.'); res.sendStatus(200); return; }
    if (cmd === '/servidor' || cmd === '/health') { servidor(cid); res.sendStatus(200); return; }
    if (cmd === '/propuesta' || cmd === '/propuestas') {
      if (arg) { db.prepare('INSERT INTO bot_propuestas (chat_id, texto) VALUES (?, ?)').run(String(cid), arg); msg(cid, '\u2705 Propuesta guardada.'); }
      else msg(cid, '\uD83D\uDCDD Escribe /propuestas + tu sugerencia.');
      res.sendStatus(200); return;
    }

    msg(cid, '\u2753 Usa /funciones para ver el menu.');
    res.sendStatus(200);
    return;
  }

  res.sendStatus(200);
});

function procesar(data, cid, mid) {
  switch (data) {
    case 'c_backup': msg(cid, '\u23F3 Generando backup...'); hacerBackup(cid); break;
    case 'c_resumen': resumen(cid); break;
    case 'c_stats': stats(cid); break;
    case 'c_cliente': espera[cid] = 'cliente'; msg(cid, '\uD83D\uDC64 Escribe el telefono o nombre del cliente:'); break;
    case 'c_tickets': tickets(cid); break;
    case 'c_porta': portas(cid); break;
    case 'c_fact': fact(cid); break;
    case 'c_ordenes': ordenes(cid); break;
    case 'c_inst': instalaciones(cid); break;
    case 'c_altas': msg(cid, '\uD83D\uDCE1 Usa /resumen para ver altas.'); break;
    case 'c_bajas': msg(cid, '\uD83D\uDD14 Usa /resumen para ver bajas.'); break;
    case 'c_cobros': cobros(cid); break;
    case 'c_enc': msg(cid, '\uD83D\uDCDD Encuestas en CRM web (/surveys).'); break;
    case 'c_caja': msg(cid, '\uD83D\uDFE2 Caja en Panel Tienda del CRM.'); break;
    case 'c_agenda': msg(cid, '\uD83D\uDCC5 Agenda en Panel Tienda del CRM.'); break;
    case 'c_inv': msg(cid, '\uD83D\uDCE6 Inventario en Panel Tienda del CRM.'); break;
    case 'c_serv': servidor(cid); break;
    case 'c_prop': espera[cid] = 'propuesta'; msg(cid, '\uD83D\uDCDD Escribe tu propuesta:'); break;
    default: msg(cid, '\u2753 Comando no reconocido.');
  }
}

function hacerBackup(cid) {
  try {
    var sb = require('./backup');
    sb.sendBackup().then(function(r) {
      msg(cid, r && r.success ? '\u2705 Backup enviado a Telegram.' : '\u274C Error backup: ' + (r && r.error || 'desconocido'));
    });
  } catch(e) { msg(cid, '\u274C Error: ' + e.message); }
}

function resumen(cid) {
  msg(cid, '\u23F3 Cargando resumen...');
  var LikesAPI = require('../likes-api');
  var api = LikesAPI.getApiInstance();
  api.getToken().then(function() {
    return Promise.all([
      api.getCustomers().then(function(r) { return r ? r.length : 0; }).catch(function() { return -1; }),
      api.getInstallations().then(function(r) { return r ? r.length : 0; }).catch(function() { return -1; }),
      api.getPortabilities().then(function(r) { return r ? r.length : 0; }).catch(function() { return -1; })
    ]);
  }).then(function(r) {
    var t = '\uD83D\uDCCA Resumen diario\n\uD83D\uDCC5 ' + new Date().toISOString().slice(0, 10) + '\n\n\uD83C\uDFE6 Clientes: ' + (r[0] >= 0 ? r[0] : 'N/A') + '\n\uD83D\uDD27 Instalaciones: ' + (r[1] >= 0 ? r[1] : 'N/A') + '\n\uD83D\uDCF1 Portabilidades: ' + (r[2] >= 0 ? r[2] : 'N/A');
    msg(cid, t);
  }).catch(function(e) { msg(cid, '\u274C Error al obtener datos: ' + e.message); });
}

function stats(cid) {
  msg(cid, '\u23F3 Cargando KPIs...');
  var LikesAPI = require('../likes-api');
  var api = LikesAPI.getApiInstance();
  api.getToken().then(function() {
    return Promise.all([
      api.getCustomers().then(function(r) { return r ? r.length : 0; }).catch(function() { return -1; }),
      api.getProducts().then(function(r) { return r ? r.length : 0; }).catch(function() { return -1; }),
      api.getInstallations().then(function(r) { return r ? r.length : 0; }).catch(function() { return -1; }),
      api.getPortabilities().then(function(r) { return r ? r.length : 0; }).catch(function() { return -1; })
    ]);
  }).then(function(r) {
    var t = '\uD83D\uDCC8 KPIs\n\n\uD83C\uDFE6 Clientes: ' + (r[0] >= 0 ? r[0] : 'N/A') + '\n\uD83D\uDCE6 Productos: ' + (r[1] >= 0 ? r[1] : 'N/A') + '\n\uD83D\uDD27 Instalaciones: ' + (r[2] >= 0 ? r[2] : 'N/A') + '\n\uD83D\uDCF1 Portabilidades: ' + (r[3] >= 0 ? r[3] : 'N/A');
    msg(cid, t);
  }).catch(function(e) { msg(cid, '\u274C Error: ' + e.message); });
}

function buscarCliente(cid, q) {
  var likes = require('../likes-api');
  var api = likes.getApiInstance();

  // Local
  var local = db.prepare("SELECT nombre, telefono FROM clients WHERE nombre LIKE ? OR telefono LIKE ? LIMIT 5").all('%' + q + '%', '%' + q + '%');
  var t = '\uD83D\uDC64 Resultados para: ' + q + '\n';
  if (local.length > 0) {
    t += '\n\uD83C\uDFE6 Clientes locales:\n';
    local.forEach(function(r) { t += '- ' + r.nombre + (r.telefono ? ' | ' + r.telefono : '') + '\n'; });
    msg(cid, t);
  } else {
    msg(cid, '\uD83D\uDD0D Buscando en API...');
    api.getToken().then(function() { return api.getCustomers(); }).then(function(clientes) {
      var filtrados = clientes.filter(function(c) {
        var nom = (c.nombre || c.name || '').toLowerCase();
        var tel = (c.telefono || c.phone || '').toLowerCase();
        return nom.indexOf(q.toLowerCase()) >= 0 || tel.indexOf(q.toLowerCase()) >= 0;
      }).slice(0, 5);
      if (filtrados.length > 0) {
        var t2 = '\uD83C\uDF10 Clientes API:\n';
        filtrados.forEach(function(c) {
          t2 += '- ' + (c.nombre || c.name || 'Sin nombre') + (c.telefono || c.phone ? ' | ' + (c.telefono || c.phone) : '') + '\n';
        });
        msg(cid, t2);
      } else {
        msg(cid, '\u274C No encontrado en API ni BD local.');
      }
    }).catch(function() { msg(cid, '\u274C No encontrado.'); });
  }
}

function tickets(cid) {
  var local = db.prepare("SELECT id, asunto, prioridad, estado FROM tickets WHERE estado != 'cerrado' ORDER BY id DESC LIMIT 10").all();
  if (local.length > 0) {
    var t = '\uD83C\uDFAB Tickets pendientes (local):\n';
    local.forEach(function(r) { t += '#' + r.id + ' ' + r.asunto + ' [' + r.estado + ']\n'; });
    msg(cid, t);
  } else {
    msg(cid, '\uD83C\uDFAB No hay tickets pendientes en BD local. Revisa en el CRM web.');
  }
}

function portas(cid) {
  msg(cid, '\u23F3 Cargando portabilidades...');
  var likes = require('../likes-api');
  var api = likes.getApiInstance();
  api.getToken().then(function() { return api.getPortabilities(); }).then(function(portas) {
    if (portas.length === 0) { msg(cid, '\uD83D\uDCF1 No hay portabilidades activas.'); return; }
    var t = '\uD83D\uDCF1 Portabilidades (' + portas.length + '):\n';
    portas.slice(0, 10).forEach(function(p) {
      t += '- ' + (p.linea || p.line || '-') + ' [' + (p.estado || p.status || '-') + ']\n';
    });
    msg(cid, t);
  }).catch(function() { msg(cid, '\u274C Error al obtener portabilidades.'); });
}

function fact(cid) {
  var mes = new Date().toISOString().slice(0, 7);
  var ing = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='ingreso' AND fecha LIKE ?").get(mes + '%').t;
  var gas = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE tipo='gasto' AND fecha LIKE ?").get(mes + '%').t;
  var t = '\uD83D\uDCB0 Facturacion del mes (' + mes + ')\n(Panel Tienda)\nIngresos: ' + parseFloat(ing).toFixed(2) + 'EUR\nGastos: ' + parseFloat(gas).toFixed(2) + 'EUR\nSaldo: ' + parseFloat(ing - gas).toFixed(2) + 'EUR';
  msg(cid, t);
}

function ordenes(cid) {
  var local = db.prepare("SELECT id, tipo, estado FROM orders WHERE estado NOT IN ('completada','cancelada') ORDER BY id DESC LIMIT 10").all();
  if (local.length > 0) {
    var t = '\uD83D\uDCE6 Ordenes pendientes:\n';
    local.forEach(function(r) { t += '#' + r.id + ' ' + r.tipo + ' [' + r.estado + ']\n'; });
    msg(cid, t);
  } else {
    msg(cid, '\u2705 No hay ordenes pendientes.');
  }
}

function instalaciones(cid) {
  msg(cid, '\u23F3 Cargando instalaciones...');
  var likes = require('../likes-api');
  var api = likes.getApiInstance();
  api.getToken().then(function() { return api.getInstallations(); }).then(function(inst) {
    if (inst.length === 0) { msg(cid, '\uD83D\uDD27 No hay instalaciones.'); return; }
    var t = '\uD83D\uDD27 Instalaciones (' + inst.length + '):\n';
    inst.slice(0, 10).forEach(function(i) {
      t += '- ' + (i.cliente_nombre || i.customer_name || 'Cliente') + ' [' + (i.estado || i.status || '-') + ']\n';
    });
    msg(cid, t);
  }).catch(function() { msg(cid, '\u274C Error al obtener instalaciones.'); });
}

function cobros(cid) {
  var local = db.prepare("SELECT id, concepto, importe, fecha_vencimiento, estado FROM invoices WHERE estado != 'pagado' ORDER BY fecha_vencimiento ASC LIMIT 10").all();
  if (local.length > 0) {
    var t = '\uD83D\uDCB3 Cobros pendientes:\n';
    local.forEach(function(r) { t += '-' + r.concepto + ' ' + parseFloat(r.importe).toFixed(2) + 'EUR [' + r.estado + ']\n'; });
    msg(cid, t);
  } else {
    msg(cid, '\u2705 No hay cobros pendientes en BD local.');
  }
}

function servidor(cid) {
  var dbSize = '0 B';
  try { var s = fs.statSync(path.join(__dirname, '..', 'movilbro.db')); dbSize = (s.size / 1024 / 1024).toFixed(2) + ' MB'; } catch(e) {}
  var uptime = process.uptime();
  var h = Math.floor(uptime / 3600);
  var m = Math.floor((uptime % 3600) / 60);
  var t = '\uD83D\uDEE1\uFE0F Servidor\nTiempo activo: ' + h + 'h ' + m + 'm\nBD: ' + dbSize + '\nNode: ' + process.version;
  var tk = getToken();
  t += '\n\uD83D\uDCED Telegram: ' + (tk ? 'OK' : 'NO') + ' | \uD83D\uDCA1 API Likes: ' + (db.prepare("SELECT value FROM settings WHERE key = 'likes_client_id'").get() ? 'OK' : 'NO');
  msg(cid, t);
}

// Notificaciones
function notifStart() {
  var cid = getChatId();
  if (cid) msg(cid, '\uD83D\uDFE2 Servidor CRM iniciado');
}
function notifSummary() {
  var cid = getChatId();
  if (cid) { msg(cid, '\uD83D\uDD14 Resumen diario'); resumen(cid); }
}
function notifOrder(d) { var c = getChatId(); if (c) msg(c, 'Nueva orden: ' + (d || '')); }
function notifTicket(d) { var c = getChatId(); if (c) msg(c, 'Nuevo ticket: ' + (d || '')); }

function regComandos() {
  var tk = getToken();
  if (!tk) return;
  var cmds = [
    { command: 'funciones', description: 'Menu principal' },
    { command: 'backup', description: 'Enviar backup' },
    { command: 'resumen', description: 'Resumen diario' },
    { command: 'stats', description: 'KPIs' },
    { command: 'cliente', description: 'Buscar cliente' },
    { command: 'tickets', description: 'Tickets' },
    { command: 'portabilidades', description: 'Portabilidades' },
    { command: 'facturacion', description: 'Facturacion' },
    { command: 'ordenes', description: 'Ordenes' },
    { command: 'instalaciones', description: 'Instalaciones' },
    { command: 'servidor', description: 'Servidor' },
    { command: 'propuestas', description: 'Enviar propuesta' }
  ];
  var b = JSON.stringify({ commands: cmds });
  var r = https.request({ hostname: 'api.telegram.org', path: '/bot' + tk + '/setMyCommands', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, function() {});
  r.write(b); r.end();
}

module.exports = { router: router, notifyServerStart: notifStart, sendDailySummary: notifSummary, notifyNewOrder: notifOrder, notifyNewTicket: notifTicket, registerBotCommands: regComandos };
