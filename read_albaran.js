const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

async function main() {
  var targets = await new Promise(function(res, rej) {
    http.get('http://127.0.0.1:9222/json', function(r) {
      var d = '';
      r.on('data', function(c) { d += c; });
      r.on('end', function() { try { res(JSON.parse(d)); } catch(e) { rej(e); } });
    }).on('error', rej);
  });

  var t = targets.find(function(x) { return x.url && x.url.includes('albaran'); });
  if (!t) { console.log('No albaran tab, looking for any ispgestion tab...'); t = targets.find(function(x) { return x.url && x.url.includes('ispgestion'); }); }
  if (!t) { console.log('No ISP tab'); return; }
  console.log('Tab:', t.title, t.url.substring(0, 80));

  var sock = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(function(r) { sock.on('open', r); });

  function send(msg) {
    return new Promise(function(res, rej) {
      sock.send(JSON.stringify(msg));
      var handler = function(data) {
        try { var d = JSON.parse(data.toString()); if (d.id === msg.id) { sock.removeListener('message', handler); res(d); } } catch(e) {}
      };
      sock.on('message', handler);
      setTimeout(function() { sock.removeListener('message', handler); rej(new Error('Timeout')); }, 10000);
    });
  }

  // First check current URL
  var url = await send({ id: 1, method: 'Runtime.evaluate', params: { expression: 'window.location.href', returnByValue: true } });
  console.log('Current URL:', url.result.result.value);

  // Look for a search/filter form and table data
  var pageInfo = await send({ id: 2, method: 'Runtime.evaluate', params: { expression: 'JSON.stringify({title:document.title,tables:Array.from(document.querySelectorAll(\"table\")).map(function(t){return{id:t.id,rows:t.rows?t.rows.length:0,text:(t.innerText||\"\").substring(0,300).replace(/\\s+/g,\" \")}}).filter(function(t){return t.rows>0}),links:Array.from(document.querySelectorAll(\"a[href*=factur],a[href*=imprimir],a[href*=pdf],a[href*=doc]\")).slice(0,20).map(function(a){return{href:a.href,text:(a.textContent||\"\").trim().substring(0,30)}})})', returnByValue: true } });
  var info = JSON.parse(pageInfo.result.result.value);
  console.log('Title:', info.title);
  console.log('Tables:');
  info.tables.forEach(function(tbl) { console.log('  rows:', tbl.rows, '|', tbl.text.substring(0, 200)); });
  console.log('Invoice links:');
  info.links.forEach(function(l) { console.log(' ', l.text, '->', l.href.substring(0, 100)); });

  // Save full HTML
  var html = await send({ id: 3, method: 'Runtime.evaluate', params: { expression: 'document.documentElement.outerHTML', returnByValue: true } });
  fs.writeFileSync('isp_albaran_page2.html', html.result.result.value);
  console.log('\nSaved HTML:', html.result.result.value.length, 'bytes');

  sock.close();
}

main().catch(function(e) { console.error('Error:', e.message); });
