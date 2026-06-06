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
        // Inject message watcher script via postMessage
        body = body.replace('</body>', '<script>' +
          'window._waLastText="";' +
          'new MutationObserver(function(){' +
            'var t=(document.body&&document.body.innerText)||"";' +
            'if(!t||t===window._waLastText)return;' +
            'var old=window._waLastText;' +
            'window._waLastText=t;' +
            'if(!old)return;' +
            'var na=t.split(String.fromCharCode(10,13).charAt(0));' +
            'var ol=old.split(String.fromCharCode(10,13).charAt(0));' +
            'na.forEach(function(l){' +
              'l=l.trim();' +
              'if(l.length>2&&ol.indexOf(l)<0&&!/^[\\d\\s:()\\-+]+$/.test(l)&&!/^\\d{1,2}:\\d{2}$/.test(l)){' +
                'try{parent.postMessage({type:"wa_msg",text:l},"*")}catch(e){}' +
              '}' +
            '});' +
          '}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});' +
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
