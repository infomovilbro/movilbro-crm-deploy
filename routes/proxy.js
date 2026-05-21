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
    delete cleanHeaders['set-cookie']; // We handle cookies manually

    res.writeHead(proxyRes.statusCode, cleanHeaders);
    proxyRes.pipe(res);
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
