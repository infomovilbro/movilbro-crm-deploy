const express = require('express');
const { requireAuth } = require('../middleware/auth');
const https = require('https');
const router = express.Router();

// Página principal: muestra web.whatsapp.com real en iframe
router.get('/', requireAuth, (req, res) => {
  res.render('whatsapp', { title: 'WhatsApp Web' });
});

// Proxy que sirve web.whatsapp.com real (quita X-Frame-Options, inyecta <base>)
var WHATSAPP_HOST = 'web.whatsapp.com';
var BASE_TAG = '<base href="https://web.whatsapp.com/">';

router.get('/content/*', requireAuth, (req, res) => {
  var reqPath = req.params[0] || '';
  var targetUrl = 'https://' + WHATSAPP_HOST + '/' + reqPath;

  var options = {
    hostname: WHATSAPP_HOST,
    path: '/' + reqPath,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': req.headers['accept'] || '*/*',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Referer': 'https://' + WHATSAPP_HOST + '/',
      'Origin': 'https://' + WHATSAPP_HOST,
      'Host': WHATSAPP_HOST,
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'iframe',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Upgrade-Insecure-Requests': '1'
    }
  };

  var proxyReq = https.request(options, function(proxyRes) {
    var cleanHeaders = { ...proxyRes.headers };
    delete cleanHeaders['x-frame-options'];
    delete cleanHeaders['X-Frame-Options'];
    delete cleanHeaders['content-security-policy'];
    delete cleanHeaders['Content-Security-Policy'];
    delete cleanHeaders['strict-transport-security'];
    delete cleanHeaders['Strict-Transport-Security'];
    cleanHeaders['Access-Control-Allow-Origin'] = '*';

    var chunks = [];
    proxyRes.on('data', function(chunk) { chunks.push(chunk); });
    proxyRes.on('end', function() {
      var body = Buffer.concat(chunks);
      var contentType = proxyRes.headers['content-type'] || '';

      if (contentType.includes('text/html')) {
        var html = body.toString('utf8');
        // Inject <base> tag right after <head> so all relative assets load from web.whatsapp.com
        html = html.replace('<head>', '<head>' + BASE_TAG);
        // Also try to prevent the site from detecting iframe (common technique)
        html = html.replace(/if\s*\(top\s*!==\s*self\)/g, 'if (false)');
        html = html.replace(/if\s*\(self\s*!==\s*top\)/g, 'if (false)');
        html = html.replace(/top\.location/g, 'self.location');
        body = Buffer.from(html, 'utf8');
        cleanHeaders['content-length'] = body.length;
      }

      res.writeHead(proxyRes.statusCode, cleanHeaders);
      res.end(body);
    });
  });

  proxyReq.on('error', function(e) {
    if (!res.headersSent) res.status(502).send('Proxy error: ' + e.message);
  });
  proxyReq.end();
});

// For base path, redirect to content/
router.get('/proxy-redirect', requireAuth, (req, res) => {
  res.redirect('/whatsapp/content/');
});

module.exports = router;
