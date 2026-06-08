const http = require('http');
const https = require('https');

function connectCDP() {
  return new Promise(function(resolve) {
    http.get('http://localhost:9222/json', function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        var targets = JSON.parse(d);
        var wa = null;
        for (var i = 0; i < targets.length; i++) {
          if (targets[i].url === 'https://web.whatsapp.com/') { wa = targets[i]; break; }
        }
        resolve(wa);
      });
    }).on('error', function() { resolve(null); });
  });
}

function evalWA(wsUrl, js) {
  return new Promise(function(resolve) {
    var WS = require('C:\\Users\\xtptx\\Desktop\\cmrjunioservidor\\node_modules\\ws');
    var ws = new WS(wsUrl);
    var id = Date.now();
    var done = false;
    
    ws.on('open', function() { ws.send(JSON.stringify({ id: id, method: 'Runtime.evaluate', params: { expression: js } })); });
    ws.on('message', function(data) {
      if (done) return;
      var r = JSON.parse(data.toString());
      if (r.id === id) { done = true; resolve(r.result?.result?.value || null); ws.close(); }
    });
    ws.on('error', function() { if (!done) { done = true; resolve(null); } });
    setTimeout(function() { if (!done) { done = true; resolve(null); try { ws.close(); } catch(e) {} } }, 4000);
  });
}

async function check() {
  var wa = await connectCDP();
  if (!wa) { console.log('[SP] No WA tab'); return; }
  
  var title = await evalWA(wa.webSocketDebuggerUrl, 'document.title');
  if (!title) { console.log('[SP] No title'); return; }
  
  console.log('[SP] Title:', title);
  
  // Check unread
  var m = title.match(/\((\d+)\)/);
  var unread = m ? parseInt(m[1]) : 0;
  
  // Check if chat is open
  var log = await evalWA(wa.webSocketDebuggerUrl, '!!document.querySelector(\'[role="log"]\')');
  
  if (log) {
    var msg = await evalWA(wa.webSocketDebuggerUrl, '(function(){var l=document.querySelector(\'[role="log"]\');if(!l)return"";var r=l.querySelectorAll(\'[role="row"]\');if(!r.length)return"";var t=r[r.length-1].textContent||"";return t.trim().substring(0,200)})()');
    if (msg) console.log('[SP] Last msg:', msg.substring(0, 80));
  }
}

console.log('[SimplePoller] Started');
setInterval(check, 6000);
check();
