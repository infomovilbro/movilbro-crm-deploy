var https = require('https');
var qs = require('querystring');
var jar = {};

function req(method, path, body, ct) {
  return new Promise(function(resolve) {
    var cookieStr = Object.keys(jar).length ? Object.entries(jar).map(function(e) { return e[0] + '=' + e[1]; }).join('; ') : '';
    var opts = { hostname: 'movilbro-crm.onrender.com', path: path, method: method, rejectUnauthorized: false };
    if (cookieStr) { if (!opts.headers) opts.headers = {}; opts.headers.Cookie = cookieStr; }
    if (body) { if (!opts.headers) opts.headers = {}; opts.headers['Content-Type'] = ct || 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(body); }
    var r = https.request(opts, function(rp) {
      var d = '';
      rp.on('data', function(c) { d += c; });
      rp.on('end', function() {
        var sc = rp.headers['set-cookie'];
        if (sc) sc.forEach(function(x) { var kv = x.split(';')[0].split('='); jar[kv[0].trim()] = kv[1]; });
        resolve({ status: rp.statusCode, body: d });
      });
    });
    if (body) r.write(body);
    r.end();
  });
}

(async function() {
  console.log('=== Testing Render ===');
  
  // Test solicitar password for infomovilbro
  console.log('\n1. Solicitar password for infomovilbro@gmail.com');
  var resp = await req('POST', '/auth/login/solicitar', qs.stringify({ email: 'infomovilbro@gmail.com' }), 'application/x-www-form-urlencoded');
  console.log('Status:', resp.status);
  if (resp.body.includes('success') || resp.body.includes('enviada') || resp.body.includes('Contrase')) {
    console.log('SUCCESS - Password should be sent');
  } else {
    // Extract error message
    var errMatch = resp.body.match(/alert[^>]*>([^<]+)/);
    if (errMatch) console.log('Message:', errMatch[1].trim());
    else console.log('Response snippet:', resp.body.substring(2500, 3000));
  }
  
  // Also test the login page directly
  console.log('\n2. Login page renders correctly');
  var login = await req('GET', '/auth/login');
  console.log('Status:', login.status, 'Size:', login.body.length);
  console.log('Has form:', login.body.includes('form'));
  
  // Check if email exists in system
  console.log('\n3. Testing email delivery...');
  var resp2 = await req('POST', '/auth/login/solicitar', qs.stringify({ email: 'eloyfuentesbermudez@gmail.com' }), 'application/x-www-form-urlencoded');
  console.log('Status for eloy:', resp2.status);
  if (resp2.body.includes('success') || resp2.body.includes('enviada')) {
    console.log('SUCCESS - Password should be sent to eloy');
  }
})();
