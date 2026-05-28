const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

async function main() {
  var targets = await getJSON('http://127.0.0.1:9222/json');
  var t = targets.find(function(x) { return x.url && x.url.includes('panelMando'); });
  if (!t) { console.log('No panelMando tab'); process.exit(1); }

  var sock = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(function(r) { sock.on('open', r); });

  function send(msg) {
    return new Promise(function(res, rej) {
      sock.send(JSON.stringify(msg));
      var handler = function(data) {
        try { var d = JSON.parse(data.toString()); if (d.id === msg.id) { sock.removeListener('message', handler); res(d); } } catch(e) {}
      };
      sock.on('message', handler);
      setTimeout(function() { sock.removeListener('message', handler); rej(new Error('Timeout')); }, 30000);
    });
  }

  async function evalInPage(expr) {
    var r = await send({ id: Date.now(), method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } });
    return r.result.result.value;
  }

  await send({ id: 1, method: 'Page.enable', params: {} });

  // Try multiple invoice listing URLs
  var urls = [
    'https://movilbro.ispgestion.com/albaranCompraCabecera/index',
    'https://movilbro.ispgestion.com/efectosFactura',
    'https://movilbro.ispgestion.com/facturas/listado'
  ];

  for (var url of urls) {
    console.log('Trying:', url);
    await send({ id: Date.now(), method: 'Page.navigate', params: { url: url } });
    await new Promise(function(r) { setTimeout(r, 6000); });
    
    var currentUrl = await evalInPage('window.location.href');
    var title = await evalInPage('document.title');
    console.log('  URL:', currentUrl);
    console.log('  Title:', title);
    
    // Check if we have a valid page (not login)
    var bodyText = await evalInPage('(document.body?document.body.innerText:"").substring(0,500)');
    
    if (!currentUrl.includes('login') && bodyText.length > 100) {
      console.log('  Found valid page!');
      console.log('  Body:', bodyText.replace(/\s+/g,' ').substring(0,300));
      
      // Check for invoice links
      var invoiceLinks = await evalInPage(`JSON.stringify(Array.from(document.querySelectorAll('a[href]')).filter(function(a){
        var t=(a.textContent||'').toLowerCase();
        var h=(a.href||'').toLowerCase();
        return t.includes('factur')||t.includes('ver')||t.includes('pdf')||t.includes('imprimir')||h.includes('fact')||h.includes('albaran')||h.includes('ver');
      }).slice(0,30).map(function(a){
        return{text:(a.textContent||'').trim().substring(0,40),href:(a.href||'').substring(0,120)};
      }))`);
      
      var links = JSON.parse(invoiceLinks || '[]');
      console.log('  Invoice links:', links.length);
      links.forEach(function(l) { console.log('   ', l.text, '->', l.href); });
      
      // Save HTML
      var html = await evalInPage('document.documentElement.outerHTML');
      var fn = 'isp_listado_' + url.replace(/[^a-zA-Z0-9]/g, '_') + '.html';
      fs.writeFileSync(fn, html);
      console.log('  Saved:', fn, html.length, 'bytes');
      break;
    }
  }

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
