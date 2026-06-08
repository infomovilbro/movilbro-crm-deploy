var https = require('https');
var opts = { hostname: 'movilbro-crm.onrender.com', path: '/codeopen', method: 'GET', timeout: 10000 };
var req = https.request(opts, function(res) {
  var d = '';
  res.on('data', function(c) { d += c; });
  res.on('end', function() {
    console.log('Status:', res.statusCode);
    console.log('QR Panel:', d.indexOf('waQRPanel') >= 0 ? 'SI' : 'NO');
    if (d.indexOf('waQRPanel') >= 0) {
      var parts = d.split('waQRImage.src=');
      if (parts.length > 1) console.log('QR URL:', parts[1].split('"')[1]);
    }
  });
});
req.end();
