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

  // Build clean headers - only forward essential ones, not host/cookie from our domain
  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    'Accept': req.headers['accept'] || '*/*',
    'Accept-Language': req.headers['accept-language'] || 'es-ES,es;q=0.9',
    'Referer': `https://${allowed.host}/`,
    'Origin': `https://${allowed.host}`,
    'Host': allowed.host,
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'iframe',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1'
  };

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
        // Inject base tag so all assets load from the real web.whatsapp.com
        body = body.replace('<head>', '<head><base href="/proxy/web.whatsapp.com/">');
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
          'var _rx=[/^\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}$/,/^\\d{1,2}:\\d{2}$/,/^[\\d\\s:()\\-+]+$/,/^\\d+\\s*(fotos|foto|archivos?|pdf|pagina)$/i,' +
            '/sticker/i,/\\bfoto\\b/i,/\\bpdf\\b/i,/elimin(a|ste)|reaccion(aste|o)/i,/se\\s+elimin/i,/notificaciones.*desactivadas/i];' +
          'var _ui=["Cargando","default-","ic-","wds-","wa-","icon","filter","svg","refresh","new-chat","more-verti",' +
            '"chat-filled","status","communities","channel","search","menu","Meta AI","reenv\u00eda","Descubre","Abre WhatsApp",' +
            '"Escribe","Buscar","Ajustes","Archivados","Favoritos","Todos","Grupos","online","escribiendo","anclado",' +
            '"seleccionar","Escribir mensaje","Activar","desactivadas","default-group","default-contact"];' +
          'function _esBasura(t){for(var i=0;i<_rx.length;i++){if(_rx[i].test(t))return true}for(var i=0;i<_ui.length;i++){if(t.indexOf(_ui[i])>=0)return true}return false};' +
          'var _sent={};' +
          'setTimeout(function(){' +
            'var base=(document.body&&document.body.innerText)||"";' +
            'var canSend=false;' +
            'setTimeout(function(){canSend=true;}, 60000);' +
            'new MutationObserver(function(){' +
              'if(!canSend)return;' +
              'var t=(document.body&&document.body.innerText)||"";' +
              'if(!t||t===base)return;' +
              'var old=base;base=t;' +
              'var na=t.split(String.fromCharCode(10));' +
              'var ol=old.split(String.fromCharCode(10));' +
              'na.forEach(function(l){' +
                'l=l.trim();' +
                'if(l.length<8||l.length>300)return;' +
                'if(ol.indexOf(l)>=0)return;' +
                'if(_esBasura(l))return;' +
                'var k=l.substring(0,80);if(_sent[k])return;_sent[k]=true;' +
                'try{parent.postMessage({type:"wa_msg",text:l},"*")}catch(e){}' +
              '});' +
            '}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});' +
          '},30000);' +
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

  if (req.body && Object.keys(req.body).length) {
    proxyReq.write(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  }
  proxyReq.end();
});

module.exports = router;
