var https = require('https');
var http = require('http');
var qs = require('querystring');
var jar = {};
var BASE = 'movilbro-crm.onrender.com';

function req(method, path, body, ct) {
  return new Promise(function(resolve) {
    var cookieStr = Object.keys(jar).length ? Object.entries(jar).map(function(e) { return e[0] + '=' + e[1]; }).join('; ') : '';
    var lib = path.includes('localhost') ? http : https;
    var opts = { hostname: BASE, path: path, method: method, rejectUnauthorized: false };
    if (cookieStr) { if (!opts.headers) opts.headers = {}; opts.headers.Cookie = cookieStr; }
    if (body) { if (!opts.headers) opts.headers = {}; opts.headers['Content-Type'] = ct || 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(body); }
    var r = lib.request(opts, function(rp) {
      var d = '';
      rp.on('data', function(c) { d += c; });
      rp.on('end', function() {
        var sc = rp.headers['set-cookie'];
        if (sc) sc.forEach(function(x) { var kv = x.split(';')[0].split('='); jar[kv[0].trim()] = kv[1]; });
        resolve({ status: rp.statusCode, body: d, headers: rp.headers });
      });
    });
    if (body) r.write(body);
    r.end();
  });
}

(async function() {
  // Check login page
  console.log('=== Login Page ===');
  var login = await req('GET', '/auth/login');
  console.log('Status:', login.status, 'Size:', login.body.length, 'bytes');
  console.log('Has title:', login.body.includes('Iniciar Sesión'));
  
  // Try to login as infomovilbro (but we don't know the password)
  // Let's check the solicitar password flow
  console.log('\n=== Solicitar Password ===');
  var sol = await req('POST', '/auth/login/solicitar', qs.stringify({ email: 'infomovilbro@gmail.com' }), 'application/x-www-form-urlencoded');
  console.log('Status:', sol.status);
  console.log('Response includes success:', sol.body.includes('Contraseña') || sol.body.includes('enviada'));
  
  // Check the nube page when not logged in
  console.log('\n=== Nube Page (no auth) ===');
  var nube = await req('GET', '/isp/nube');
  console.log('Status:', nube.status, 'Location:', nube.headers.location || 'none');
  
  // Check nube HTML for any error
  if (nube.status === 200) {
    if (nube.body.includes('Error') || nube.body.includes('error')) {
      console.log('ERROR found in page!');
      console.log(nube.body.substring(0, 1000));
    }
  }
})();
