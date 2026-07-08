// WA Poller v2 - Monitorea la pestaña real de WhatsApp via CDP
// Envía mensajes nuevos al webhook del CRM

const http = require('http');
const https = require('https');

var lastMsg = '';
var SEEN = {};

function getTargets() {
  return new Promise(function(resolve) {
    http.get('http://localhost:9222/json', function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { resolve(JSON.parse(d)); });
    }).on('error', function() { resolve([]); });
  });
}

function callCDP(wsUrl, method, params) {
  return new Promise(function(resolve) {
    var WS = require('C:\\Users\\xtptx\\Desktop\\cmrjunioservidor\\node_modules\\ws');
    var ws = new WS(wsUrl);
    var id = Date.now();
    var done = false;
    
    ws.on('open', function() { ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); });
    ws.on('message', function(data) {
      var r = JSON.parse(data.toString());
      if (r.id === id && !done) { done = true; resolve(r); ws.close(); }
    });
    ws.on('error', function() { if (!done) { done = true; resolve(null); } });
    setTimeout(function() { if (!done) { done = true; resolve(null); try { ws.close(); } catch(e) {} } }, 5000);
  });
}

function evaluate(wsUrl, js) {
  return callCDP(wsUrl, 'Runtime.evaluate', { expression: js }).then(function(r) {
    return r ? (r.result?.result?.value || null) : null;
  });
}

function postToCRM(text, from) {
  var ts = new Date().toISOString();
  var data = JSON.stringify({ text: text, message: text, from: from, source: 'whatsapp_cdp', timestamp: ts });
  return new Promise(function(resolve) {
    var req = https.request({
      hostname: 'movilbro-crm.onrender.com', port: 443,
      path: '/codeopen/webhook/whatsapp', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, function(r) { var d = ''; r.on('data', function(c) { d += c; }); r.on('end', function() { resolve({ status: r.statusCode, body: d.substring(0, 100) }); }); });
    req.on('error', function(e) { resolve({ error: e.message }); });
    req.write(data);
    req.end();
  });
}

async function openFirstChat(wsUrl) {
  var r = await evaluate(wsUrl, '(function(){var s=document.querySelector("#side");if(!s)return;var rows=s.querySelectorAll(\'[role="row"]\');if(!rows||!rows.length)return;var t=rows[0].querySelector(\'[role="gridcell"]\')||rows[0];var b=t.getBoundingClientRect();return JSON.stringify({x:Math.round(b.x+b.w/2),y:Math.round(b.y+b.h/2)})})()');
  if (!r) return;
  try {
    var pos = JSON.parse(r);
    var ws2 = new (require('C:\\Users\\xtptx\\Desktop\\cmrjunioservidor\\node_modules\\ws'))(wsUrl);
    await new Promise(function(resolve) {
      ws2.on('open', function() {
        ws2.send(JSON.stringify({id:1,method:'Input.dispatchMouseEvent',params:{type:'mousePressed',x:pos.x,y:pos.y,button:'left',clickCount:1}}));
        setTimeout(function() {
          ws2.send(JSON.stringify({id:2,method:'Input.dispatchMouseEvent',params:{type:'mouseReleased',x:pos.x,y:pos.y,button:'left',clickCount:1}}));
          setTimeout(function() { ws2.close(); resolve(); }, 500);
        }, 200);
      });
    });
  } catch(e) {}
}

async function checkWA() {
  var targets = await getTargets();
  var wa = null;
  for (var i = 0; i < targets.length; i++) {
    if (targets[i].url === 'https://web.whatsapp.com/') { wa = targets[i]; break; }
  }
  if (!wa) return;
  
  var wsUrl = wa.webSocketDebuggerUrl;
  
  // Check state
  var title = await evaluate(wsUrl, 'document.title');
  if (!title) return;
  
  var hasLog = await evaluate(wsUrl, '!!document.querySelector(\'[role="log"]\')');
  
  if (!hasLog) {
    // Try to open a chat once
    console.log('[Poller] Opening chat...');
    await openFirstChat(wsUrl);
    await new Promise(function(r) { setTimeout(r, 3000); });
    hasLog = await evaluate(wsUrl, '!!document.querySelector(\'[role="log"]\')');
  }
  
  if (hasLog) {
    var msg = await evaluate(wsUrl, '(function(){var l=document.querySelector(\'[role="log"]\');if(!l)return"";var r=l.querySelectorAll(\'[role="row"]\');if(!r.length)return"";var t=(r[r.length-1].textContent||"").trim();return t.substring(0,200)})()');
    
    if (msg && msg.length > 5 && msg.indexOf('CodeOpen') === -1 && msg !== lastMsg) {
      lastMsg = msg;
      var key = msg.substring(0, 40);
      if (!SEEN[key]) {
        SEEN[key] = true;
        console.log('[Poller] >>>', msg.substring(0, 80));
        var result = await postToCRM(msg, 'Cliente WhatsApp');
        console.log('[Poller] Webhook:', result.status);
      }
    }
  }
  
  // Check unread count from title
  var unreadMatch = title.match(/\((\d+)\)/);
  var unread = unreadMatch ? parseInt(unreadMatch[1]) : 0;
  if (unread > 0) console.log('[Poller] No-leídas:', unread);
}

console.log('[WA-Poller v2] Iniciado');

async function poll() {
  try { await checkWA(); } catch(e) { console.log('[Poller] Error:', e.message); }
  setTimeout(poll, 5000);
}

poll();
process.on('SIGINT', function() { process.exit(); });
