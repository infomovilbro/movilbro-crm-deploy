const http = require('http');
const WebSocket = require('ws');

async function main() {
  var targets = await getJSON('http://127.0.0.1:9222/json');
  var t = targets.find(function(x) { return x.url && x.url.includes('panelMando'); });
  if (!t) { console.log('No panelMando tab'); return; }

  var sock = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(function(r) { sock.on('open', r); });

  function send(msg) {
    return new Promise(function(res, rej) {
      sock.send(JSON.stringify(msg));
      var handler = function(data) {
        try { var d = JSON.parse(data.toString()); if (d.id === msg.id) { sock.removeListener('message', handler); res(d); } } catch(e) {}
      };
      sock.on('message', handler);
      setTimeout(function() { sock.removeListener('message', handler); rej(new Error('Timeout')); }, 15000);
    });
  }

  async function evalInPage(expr) {
    var r = await send({ id: Date.now(), method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } });
    return r.result.result.value;
  }

  await send({ id: 1, method: 'Page.enable', params: {} });

  // Navigate to efectosFactura (efectos a cobrar = invoices to collect)
  console.log('Navigating to efectosFactura...');
  await send({ id: 2, method: 'Page.navigate', params: { url: 'https://movilbro.ispgestion.com/efectosFactura' } });
  await new Promise(function(r) { setTimeout(r, 8000); });

  var url = await evalInPage('window.location.href');
  var title = await evalInPage('document.title');
  console.log('URL:', url);
  console.log('Title:', title);

  if (title.includes('login') || title.includes('Login')) {
    console.log('Redirected to login - session expired');
    sock.close();
    return;
  }

  // Get table data
  var tables = await evalInPage(`JSON.stringify(Array.from(document.querySelectorAll("table")).slice(0,5).map(function(t){
    return{id:t.id,rows:t.rows?t.rows.length:0,text:(t.innerText||"").substring(0,500).replace(/\\s+/g," ")};
  }))`);
  console.log('Tables:', tables);

  // Get all links pointing to facturas
  var links = await evalInPage(`JSON.stringify(Array.from(document.querySelectorAll("a[href]")).filter(function(a){
    var h=a.href.toLowerCase();var t=(a.textContent||"").toLowerCase();
    return (h.includes("fact")||h.includes("ver")||h.includes("imprimir")||h.includes("pdf")) && !h.includes("login");
  }).slice(0,20).map(function(a){
    return{text:(a.textContent||"").trim().substring(0,40),href:a.href.substring(0,120)};
  }))`);
  console.log('Invoice links:', links);

  // Save HTML
  var html = await evalInPage('document.documentElement.outerHTML');
  require('fs').writeFileSync('isp_efectos.html', html);
  console.log('Saved isp_efectos.html (' + html.length + ' bytes)');

  sock.close();
}

function getJSON(url) {
  return new Promise(function(res, rej) {
    http.get(url, function(r) {
      var d = '';
      r.on('data', function(c) { d += c; });
      r.on('end', function() { try { res(JSON.parse(d)); } catch(e) { rej(e); } });
    }).on('error', rej);
  });
}

main().catch(function(e) { console.error('Error:', e.message); });
