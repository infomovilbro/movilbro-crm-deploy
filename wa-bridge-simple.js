const http = require('http');
const https = require('https');

var ws = null;
var lastMsg = '';
var SEEN = {};

function connect() {
  return new Promise(function(resolve) {
    http.get('http://localhost:9222/json', function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        var targets = JSON.parse(d);
        var wa = targets.find(function(t) { return t.url === 'https://web.whatsapp.com/'; });
        if (!wa) { console.log('[Bridge] No WA tab'); resolve(false); return; }
        
        var WS = require('C:\\Users\\xtptx\\Desktop\\cmrjunioservidor\\node_modules\\ws');
        ws = new WS(wa.webSocketDebuggerUrl);
        
        ws.on('open', function() { console.log('[Bridge] Conectado'); resolve(true); });
        ws.on('error', function() { ws = null; resolve(false); });
        ws.on('close', function() { console.log('[Bridge] Desconectado'); ws = null; });
        setTimeout(function() { if (!ws) resolve(false); }, 5000);
      });
    }).on('error', function() { resolve(false); });
  });
}

function evaluate(js) {
  return new Promise(function(resolve) {
    if (!ws) { resolve(null); return; }
    var id = Date.now();
    var handler = function(data) {
      var r = JSON.parse(data.toString());
      if (r.id === id) {
        ws.removeListener('message', handler);
        resolve(r.result?.result?.value || null);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: id, method: 'Runtime.evaluate', params: { expression: js } }));
    setTimeout(function() { ws.removeListener('message', handler); resolve(null); }, 5000);
  });
}

async function check() {
  if (!ws) { console.log('[Bridge] Reconectando...'); await connect(); return; }
  
  var title = await evaluate('document.title');
  if (!title) return;
  
  console.log('[Bridge]', title);
  
  // Get unread count and last message
  var data = await evaluate('(function(){var t=document.title;var m=t.match(/\\((\\d+)\\)/);var u=m?parseInt(m[1]):0;var l=document.querySelector(\'[role="log"]\');if(l){var r=l.querySelectorAll(\'[role="row"]\');if(r.length){var txt=r[r.length-1].textContent||"";return JSON.stringify({unread:u,msg:txt.trim().substring(0,200),log:true})}}return JSON.stringify({unread:u,log:false})})()');
  
  if (!data) return;
  var state = JSON.parse(data);
  
  // New message?
  if (state.msg && state.msg.length > 5 && state.msg.indexOf('CodeOpen') === -1 && state.msg !== lastMsg) {
    lastMsg = state.msg;
    var key = state.msg.substring(0, 40);
    if (!SEEN[key]) {
      SEEN[key] = true;
      console.log('[Bridge] >>>', state.msg.substring(0, 80));
      var ts = new Date().toISOString();
      var body = JSON.stringify({ text: state.msg, message: state.msg, from: 'Cliente WhatsApp', timestamp: ts });
      var req = https.request({ hostname: 'movilbro-crm.onrender.com', port: 443, path: '/codeopen/webhook/whatsapp', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, function(r) { var d = ''; r.on('data', function(c) { d += c; }); r.on('end', function() { console.log('[Bridge] CRM:', r.statusCode); }); });
      req.on('error', function() {});
      req.write(body);
      req.end();
    }
  }
}

async function main() {
  await connect();
  setInterval(check, 4000);
}

main().catch(function(e) { console.log('[Bridge] Fatal:', e.message); process.exit(); });
