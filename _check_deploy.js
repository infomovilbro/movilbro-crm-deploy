var http = require('https');
var body = 'email=aaa&password=aaa123';
var opts = {
  hostname: 'movilbro-crm.onrender.com',
  path: '/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
};
var req = http.request(opts, function(r) {
  var d = '';
  r.on('data', function(c) { d += c; });
  r.on('end', function() {
    var c = r.headers['set-cookie'];
    if (!c) { console.log('NO COOKIE', r.statusCode); return; }
    var cookie = c[0].split(';')[0];
    http.get({ hostname: 'movilbro-crm.onrender.com', path: '/settings', headers: { 'Cookie': cookie } }, function(r2) {
      var d2 = '';
      r2.on('data', function(c2) { d2 += c2; });
      r2.on('end', function() {
        console.log('Has onclick inline:', d2.includes('onclick='));
        console.log('Has openNavGroup fn:', d2.includes('function openNavGroup'));
        console.log('Has bottomNav before script:', d2.indexOf('bottomNav') < d2.indexOf('<script>'));
        console.log('HTML length:', d2.length);
      });
    });
  });
});
req.write(body);
req.end();
