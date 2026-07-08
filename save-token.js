const { chromium } = require('playwright');
const { db } = require('./database');

(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  var p = ctx.pages()[1];
  
  var idToken = await p.evaluate(function() {
    var c = document.cookie.split('; ').find(function(r) { return r.startsWith('idToken='); });
    return c ? c.substring('idToken='.length) : null;
  });
  
  if (!idToken) { console.log('No idToken found'); await b.close(); return; }
  
  var expiry = Date.now() + 3500 * 1000 - 60000;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('likes_token_cache', ?)").run(JSON.stringify({ token: idToken, expiry: expiry }));
  console.log('Token saved, expires:', new Date(expiry).toISOString());
  
  // Test if token works
  const https = require('https');
  var testResult = await new Promise(function(resolve, reject) {
    var opts = {
      hostname: 'api.likestelecom.com',
      path: '/line/gb?lineNumber=602605562',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + idToken, 'User-Agent': 'axios/1.7.2' },
      timeout: 10000, rejectUnauthorized: false
    };
    var r = https.request(opts, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { resolve({ status: res.statusCode, data: d.substring(0, 500) }); });
    });
    r.on('error', reject);
    r.end();
  });
  console.log('Test result:', JSON.stringify(testResult));
  
  await b.close();
})();
