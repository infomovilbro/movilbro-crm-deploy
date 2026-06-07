const express = require('express');
const { requireAuth } = require('../middleware/auth');
const https = require('https');
const http = require('http');
const url = require('url');
const router = express.Router();

const ALLOWED = {
  'web.whatsapp.com': { host: 'web.whatsapp.com', protocol: 'https:' },
  'correo.piensasolutions.com': { host: 'correo.piensasolutions.com', protocol: 'https:' },
  'dashboard.stripe.com': { host: 'dashboard.stripe.com', protocol: 'https:' },
  'movilbro-pro-web-2026.web.app': { host: 'movilbro-pro-web-2026.web.app', protocol: 'https:' }
};

router.all('/:target(*)', requireAuth, (req, res) => {
  const target = req.params.target;
  if (!target) return res.status(400).send('No target specified');

  let targetUrl = target.startsWith('http') ? target : 'https://' + target;
  const parsed = url.parse(targetUrl);
  const allowed = ALLOWED[parsed.hostname];
  if (!allowed) return res.status(403).send('Target not allowed');

  // Forward original browser headers but override Host to match target
  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    'Accept': req.headers['accept'] || '*/*',
    'Accept-Language': req.headers['accept-language'] || 'es-ES,es;q=0.9',
    'Host': allowed.host
  };
  // Forward referer/origin from browser (critical for WhatsApp AJAX)
  if (req.headers['referer']) headers['Referer'] = req.headers['referer'];
  if (req.headers['origin']) headers['Origin'] = req.headers['origin'];
  if (req.headers['sec-fetch-dest']) headers['Sec-Fetch-Dest'] = req.headers['sec-fetch-dest'];
  if (req.headers['sec-fetch-mode']) headers['Sec-Fetch-Mode'] = req.headers['sec-fetch-mode'];
  if (req.headers['sec-fetch-site']) headers['Sec-Fetch-Site'] = req.headers['sec-fetch-site'];
  if (req.headers['x-requested-with']) headers['X-Requested-With'] = req.headers['x-requested-with'];
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers['accept-encoding']) headers['Accept-Encoding'] = req.headers['accept-encoding'];

  // Forward cookies from the original target domain if they exist in session
  if (req.session && req.session.proxyCookies && req.session.proxyCookies[parsed.hostname]) {
    headers['Cookie'] = req.session.proxyCookies[parsed.hostname];
  }

  const proxyReq = https.request(targetUrl, {
    method: req.method,
    headers,
    rejectUnauthorized: true
  }, (proxyRes) => {
    // Save cookies from response into session
    const setCookies = proxyRes.headers['set-cookie'];
    if (setCookies && req.session) {
      if (!req.session.proxyCookies) req.session.proxyCookies = {};
      if (!req.session.proxyCookies[parsed.hostname]) req.session.proxyCookies[parsed.hostname] = '';
      setCookies.forEach(c => {
        const cookieName = c.split('=')[0];
        const existing = req.session.proxyCookies[parsed.hostname];
        if (existing.includes(cookieName + '=')) {
          req.session.proxyCookies[parsed.hostname] = existing.replace(new RegExp(cookieName + '=[^;]+;?'), c.split(';')[0] + ';');
        } else {
          req.session.proxyCookies[parsed.hostname] += (existing ? ' ' : '') + c.split(';')[0];
        }
      });
    }

    // Strip problematic headers
    const cleanHeaders = { ...proxyRes.headers };
    delete cleanHeaders['x-frame-options'];
    delete cleanHeaders['X-Frame-Options'];
    delete cleanHeaders['content-security-policy'];
    delete cleanHeaders['Content-Security-Policy'];
    delete cleanHeaders['strict-transport-security'];
    delete cleanHeaders['Strict-Transport-Security'];
    delete cleanHeaders['transfer-encoding'];
    delete cleanHeaders['Transfer-Encoding'];
    delete cleanHeaders['set-cookie']; // We handle cookies manually
    cleanHeaders['Access-Control-Allow-Origin'] = '*';
    cleanHeaders['X-Frame-Options'] = 'SAMEORIGIN';

    // For web.whatsapp.com: inject <base> tag and patch anti-iframe JS
    var needsHtmlPatching = (parsed.hostname === 'web.whatsapp.com');
    if (needsHtmlPatching && proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html')) {
      var chunks = [];
      proxyRes.on('data', function(chunk) { chunks.push(chunk); });
      proxyRes.on('end', function() {
        var body = Buffer.concat(chunks).toString('utf8');
        // Inject base tag + WebSocket patch so assets + WS go through proxy
        // Patch 1: intercept WebSocket, XMLHttpRequest, fetch to proxy through CRM
        var patches = '<script>' +
        '/* WebSocket proxy */' +
        'var OW=window.WebSocket;window.WebSocket=function(u,p){if(typeof u==="string"&&u.indexOf("web.whatsapp.com")>=0){u=u.replace("wss://web.whatsapp.com:5222","wss://"+location.host+"/proxy-ws/5222");u=u.replace("wss://web.whatsapp.com","wss://"+location.host+"/proxy-ws/443")}return new OW(u,p)};window.WebSocket.prototype=OW.prototype;' +
        '/* XHR proxy */' +
        'var _XPO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"&&u.indexOf("//web.whatsapp.com")>=0){arguments[1]=u.replace(/https?:\\/\\/web\\.whatsapp\\.com\\//,"")}return _XPO.apply(this,arguments)};' +
        '/* fetch proxy */' +
        'var _FO=window.fetch;window.fetch=function(u,o){if(typeof u==="string"&&u.indexOf("//web.whatsapp.com")>=0){u=u.replace(/https?:\\/\\/web\\.whatsapp\\.com\\//,"")}return _FO.call(window,u,o)};' +
        '</script>';
        body = body.replace('<head>', '<head><base href="/proxy/web.whatsapp.com/">' + patches);
        // Patch frame-busting JS
        body = body.replace(/top\s*!==\s*self/g, 'false');
        body = body.replace(/self\s*!==\s*top/g, 'false');
        body = body.replace(/top\.location/g, 'self.location');
        body = body.replace(/\.top\.location/g, '.self.location');
        body = body.replace(/parent\.location/g, 'self.location');
        body = body.replace(/window\.top/g, 'window.self');
        // Patch feature detection that blocks non-whatsapp origins
        body = body.replace(/if\s*\(!\s*isWhatsApp\b/g, 'if (false');
        body = body.replace(/isWAError/g, 'false');
        // Inject message watcher (solo MENSAJES REALES, no basura UI)
        body = body.replace('</body>', '<script>' +
          // Esperar a que WhatsApp cargue completamente
          'setTimeout(function(){' +
            'var _esBasura=function(t){' +
              'if(t.length<8||t.length>300)return true;' +
              'if(/^\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}$/.test(t))return true;' +
              'if(/^\\d{1,2}:\\d{2}$/.test(t))return true;' +
              'if(/sticker|foto|pdf|elimin|reaccion|se\\s+elimin/i.test(t))return true;' +
              'if(/notificaciones.*desactivadas/i.test(t))return true;' +
              'var ui=["Cargando","Escribe","Buscar","Ajustes","Archivados","Favoritos","online","escribiendo"];' +
              'for(var i=0;i<ui.length;i++){if(t.indexOf(ui[i])>=0)return true}' +
              'return false};' +
            'var _enviados={};' +
            'var _ultMsg="";' +
            'var _ultNoLeidas=0;' +
            // Cada 3s: comprobar el ultimo mensaje visible en el chat
            'setInterval(function(){' +
              'try{' +
                // Buscar el area de mensajes: role="log" o aria-label con "mensajes"
                'var area=document.querySelector(\'[role="log"]\')||document.querySelector(\'div[aria-label*="mensaje" i]\')||document.querySelector(\'div[aria-label*="Mensaje" i]\');' +
                'if(area){' +
                  'var msgs=area.querySelectorAll(\'[role="row"],div[tabindex="-1"],div.message,div.msg\');' +
                  'if(!msgs.length)msgs=area.children;' +
                  'if(msgs.length){' +
                    'var ult=msgs[msgs.length-1];' +
                    'var txt=(ult.textContent||"").trim();' +
                    'if(txt&&txt!==_ultMsg&&!_esBasura(txt)){' +
                      '_ultMsg=txt;' +
                      'var k=txt.substring(0,80);' +
                      'if(!_enviados[k]){_enviados[k]=true;parent.postMessage({type:"wa_msg",text:txt},"*")}' +
                    '}' +
                  '}' +
                '}' +
                // Tambien vigilar titulo (mensajes en otros chats)
                'var m=document.title.match(/\\((\\d+)\\)/);' +
                'var n=m?parseInt(m[1]):0;' +
                'if(n>_ultNoLeidas&&n>0){_ultNoLeidas=n;parent.postMessage({type:"wa_unread",count:n},"*")}' +
                'if(n===0)_ultNoLeidas=0;' +
              '}catch(e){}' +
            '},3000);' +
          '},10000);' +
        '</script>');
        cleanHeaders['content-length'] = Buffer.byteLength(body, 'utf8');
        res.writeHead(proxyRes.statusCode, cleanHeaders);
        res.end(body);
      });
    } else {
      res.writeHead(proxyRes.statusCode, cleanHeaders);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (e) => {
    console.error('Proxy error:', e.message);
    if (!res.headersSent) res.status(502).send('Proxy error: ' + e.message);
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.rawBody && req.rawBody.length) {
      proxyReq.write(req.rawBody);
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
      proxyReq.write(JSON.stringify(req.body));
    }
  }
  proxyReq.end();
});

module.exports = router;
