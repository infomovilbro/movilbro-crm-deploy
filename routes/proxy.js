const express = require('express');
const { requireAuth } = require('../middleware/auth');
const https = require('https');
const url = require('url');
const router = express.Router();

// TEST: simple fetch to see what WhatsApp returns
router.get('/test-whatsapp', requireAuth, function(req, res) {
  https.get('https://web.whatsapp.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout: 10000
  }, function(whatsRes) {
    var chunks = [];
    console.log('[TestWA] Status:', whatsRes.statusCode);
    console.log('[TestWA] Headers:', JSON.stringify(whatsRes.headers));
    
    whatsRes.on('data', function(c) { chunks.push(c); });
    whatsRes.on('end', function() {
      var buf = Buffer.concat(chunks);
      res.json({
        status: whatsRes.statusCode,
        contentType: whatsRes.headers['content-type'],
        contentEncoding: whatsRes.headers['content-encoding'] || 'none',
        contentLength: whatsRes.headers['content-length'] || 'chunked',
        bodyLength: buf.length,
        firstBytesHex: buf.slice(0, 50).toString('hex'),
        firstBytesUtf8: buf.slice(0, 200).toString('utf8'),
        isHTML: buf.slice(0, 9).toString('utf8').startsWith('<!'),
        hasApp: buf.toString('utf8').includes('id="app"')
      });
    });
  }).on('error', function(e) {
    res.json({ error: e.message });
  });
});

// Simplified proxy - just fetch and pipe, no patching
// This is the DIAGNOSTIC version to find the bug
router.all('/:target(*)', requireAuth, (req, res) => {
  const target = req.params.target;
  if (!target) return res.status(400).send('No target specified');

  let targetUrl = target.startsWith('http') ? target : 'https://' + target;
  const parsed = url.parse(targetUrl);
  const allowed = {
    'web.whatsapp.com': { host: 'web.whatsapp.com', protocol: 'https:' },
    'correo.piensasolutions.com': { host: 'correo.piensasolutions.com', protocol: 'https:' },
    'dashboard.stripe.com': { host: 'dashboard.stripe.com', protocol: 'https:' },
    'movilbro-pro-web-2026.web.app': { host: 'movilbro-pro-web-2026.web.app', protocol: 'https:' }
  };
  if (!allowed[parsed.hostname]) return res.status(403).send('Target not allowed');

  // Minimal headers - just what's needed
  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Host': allowed[parsed.hostname].host
};

  // Forward WhatsApp cookies from session if available
  if (req.session && req.session.proxyCookies && req.session.proxyCookies[parsed.hostname]) {
    headers['Cookie'] = req.session.proxyCookies[parsed.hostname];
  }

  const proxyReq = https.request(targetUrl, {
    method: req.method,
    headers,
    rejectUnauthorized: true,
    timeout: 30000
  }, (proxyRes) => {
    // Save cookies from response
    const setCookies = proxyRes.headers['set-cookie'];
    if (setCookies && req.session) {
      if (!req.session.proxyCookies) req.session.proxyCookies = {};
      if (!req.session.proxyCookies[parsed.hostname]) req.session.proxyCookies[parsed.hostname] = '';
      setCookies.forEach(function(c) {
        var name = c.split('=')[0];
        if (req.session.proxyCookies[parsed.hostname].includes(name + '=')) {
          req.session.proxyCookies[parsed.hostname] = req.session.proxyCookies[parsed.hostname].replace(new RegExp(name + '=[^;]+;?'), c.split(';')[0] + ';');
        } else {
          req.session.proxyCookies[parsed.hostname] += (req.session.proxyCookies[parsed.hostname] ? ' ' : '') + c.split(';')[0];
        }
      });
    }

    // Clean headers
    const cleanHeaders = {};
    Object.keys(proxyRes.headers).forEach(function(k) {
      var lk = k.toLowerCase();
      if (lk !== 'x-frame-options' && lk !== 'content-security-policy' && lk !== 'strict-transport-security' && lk !== 'transfer-encoding' && lk !== 'set-cookie') {
        cleanHeaders[k] = proxyRes.headers[k];
      }
    });
    cleanHeaders['X-Frame-Options'] = 'SAMEORIGIN';
    if (parsed.hostname === 'web.whatsapp.com') {
      cleanHeaders['Access-Control-Allow-Origin'] = '*';
    }

    // For WhatsApp: inject patches into HTML
    var isWA = (parsed.hostname === 'web.whatsapp.com');
    var ct = proxyRes.headers['content-type'] || '';
    if (isWA && ct.includes('text/html')) {
      var chunks = [];
      proxyRes.on('data', function(c) { chunks.push(c); });
      proxyRes.on('end', function() {
        var body = Buffer.concat(chunks).toString('utf8');
        
        // Only patch if we got valid HTML
        if (body.trim().startsWith('<!')) {
          // Basic patches
          body = body.replace('<head>', '<head><base href="/proxy/web.whatsapp.com/"><script>var OW=window.WebSocket;window.WebSocket=function(u,p){if(typeof u==="string"&&u.indexOf("web.whatsapp.com")>=0){u=u.replace("wss://web.whatsapp.com:5222","wss://"+location.host+"/proxy-ws/5222");u=u.replace("wss://web.whatsapp.com","wss://"+location.host+"/proxy-ws/443")}return new OW(u,p)};window.WebSocket.prototype=OW.prototype;</script>');
          body = body.replace(/top\s*!==\s*self/g, 'false');
          body = body.replace(/self\s*!==\s*top/g, 'false');
          body = body.replace(/top\.location/g, 'self.location');
          body = body.replace(/parent\.location/g, 'self.location');
          body = body.replace(/window\.top/g, 'window.self');
          
          console.log('[Proxy] WhatsApp HTML patched, length:', body.length);
        } else {
          console.log('[Proxy] WhatsApp returned non-HTML content, length:', body.length, 'first bytes:', body.substring(0, 100).replace(/[^ -~]/g, '.'));
        }
        
        cleanHeaders['content-length'] = Buffer.byteLength(body, 'utf8');
        res.writeHead(proxyRes.statusCode, cleanHeaders);
        res.end(body);
      });
    } else {
      res.writeHead(proxyRes.statusCode, cleanHeaders);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', function(e) {
    console.error('Proxy error:', e.message);
    if (!res.headersSent) res.status(502).json({ error: e.message });
  });
});

module.exports = router;
