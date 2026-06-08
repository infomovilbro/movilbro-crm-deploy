const http = require('http');
const https = require('https');

const CRM_HOST = 'movilbro-crm.onrender.com';
const SEEN = new Set();
var persistentWs = null;
var lastUnread = 0;
var lastMsgKey = '';

function postToWebhook(text, from) {
  return new Promise(function(resolve) {
    if (text.includes('CodeOpen')) { resolve({ skipped: true }); return; }
    var ts = new Date().toISOString();
    var data = JSON.stringify({ text: text, message: text, from: from, source: 'whatsapp_cdp', timestamp: ts });
    var req = https.request({ hostname: CRM_HOST, port: 443, path: '/codeopen/webhook/whatsapp', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() { resolve({ status: res.statusCode }); });
    });
    req.on('error', function() { resolve({ error: true }); });
    req.write(data);
    req.end();
  });
}

function evaluate(expression) {
  return new Promise(function(resolve) {
    if (!persistentWs) { resolve(''); return; }
    var msgId = Date.now();
    var handler = function(data) {
      try {
        var resp = JSON.parse(data.toString());
        if (resp.id === msgId) {
          persistentWs.removeListener('message', handler);
          resolve(resp.result?.result?.value || resp.result?.exceptionDetails?.text || '');
        }
      } catch(e) {}
    };
    persistentWs.on('message', handler);
    persistentWs.send(JSON.stringify({ id: msgId, method: 'Runtime.evaluate', params: { expression: expression } }));
    setTimeout(function() { persistentWs.removeListener('message', handler); resolve(''); }, 5000);
  });
}

async function connect() {
  return new Promise(function(resolve) {
    http.get('http://localhost:9222/json', function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        var targets = JSON.parse(d);
        var wa = targets.find(function(t) { return t.url === 'https://web.whatsapp.com/'; });
        if (!wa) { console.log('[V] No WA tab found'); resolve(false); return; }
        
        var WS = require('C:\\Users\\xtptx\\Desktop\\cmrjunioservidor\\node_modules\\ws');
        persistentWs = new WS(wa.webSocketDebuggerUrl);
        persistentWs.on('open', function() { console.log('[V] Conectado'); resolve(true); });
        persistentWs.on('error', function() { persistentWs = null; resolve(false); });
        persistentWs.on('close', function() { persistentWs = null; });
        setTimeout(function() { if (!persistentWs) resolve(false); }, 5000);
      });
    }).on('error', function() { resolve(false); });
  });
}

async function checkAndPost() {
  try {
    // Get title and unread count
    var state = await evaluate(`
      (function(){
        var title = document.title;
        var m = title.match(/\\\((\\d+)\\\\)/);
        var unread = m ? parseInt(m[1]) : 0;
        var log = document.querySelector('[role="log"]');
        var lastMsg = '';
        if (log) {
          var rows = log.querySelectorAll('[role="row"]');
          if (rows.length) {
            var txt = (rows[rows.length-1].textContent || '').trim();
            if (txt.length > 5 && txt.length < 500 && !txt.includes('CodeOpen')) {
              lastMsg = txt.substring(0, 200);
            }
          }
        }
        return JSON.stringify({ title: title, unread: unread, log: !!log, lastMsg: lastMsg });
      })()
    `);
    
    var s = JSON.parse(state || '{}');
    
    // If unread count changed, notify
    if (s.unread > 0 && s.unread !== lastUnread) {
      lastUnread = s.unread;
      var msg = 'Tienes ' + s.unread + ' mensaje(s) sin leer en WhatsApp';
      console.log('[V] No-leídas:', s.unread);
      await postToWebhook(msg, 'WhatsApp (Sistema)');
    }
    if (s.unread === 0) lastUnread = 0;
    
    // If there's a last message, post it
    if (s.lastMsg && s.lastMsg !== lastMsgKey) {
      lastMsgKey = s.lastMsg;
      var dedupKey = s.lastMsg.substring(0, 60);
      if (!SEEN.has(dedupKey)) {
        SEEN.add(dedupKey);
        console.log('[V] Msg:', s.lastMsg.substring(0, 80));
        await postToWebhook(s.lastMsg, 'Cliente WhatsApp');
      }
    }
  } catch(e) {}
}

async function ensureChatOpen() {
  var state = await evaluate('JSON.stringify({log:!!document.querySelector(\'[role="log"]\'),footer:!!document.querySelector("footer")})');
  var s = JSON.parse(state || '{}');
  
  if (!s.log && !s.footer) {
    // No chat open, click the first chat
    console.log('[V] Abriendo primer chat...');
    await evaluate(`
      (function(){
        var side = document.querySelector('#side');
        var rows = side ? side.querySelectorAll('[role="row"]') : [];
        if (rows.length > 0) {
          var target = rows[0].querySelector('[role="gridcell"]') || rows[0].querySelector('[tabindex="0"]') || rows[0];
          target.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true}));
          target.dispatchEvent(new MouseEvent('mouseup', {bubbles:true,cancelable:true}));
          target.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true}));
        }
      })()
    `);
    await new Promise(function(r) { setTimeout(r, 3000); });
  }
}

async function main() {
  console.log('[WA-Vigilante-CDP] Iniciando...');
  var ok = await connect();
  if (!ok) { setTimeout(main, 5000); return; }
  
  await ensureChatOpen();
  console.log('[V] Monitoreando cada 4s');
  
  setInterval(checkAndPost, 4000);
  
  process.on('SIGINT', function() { if (persistentWs) persistentWs.close(); process.exit(); });
}

main().catch(function(e) { console.error(e); process.exit(1); });
