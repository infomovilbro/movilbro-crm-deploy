const https = require('https');
const qs = 'email=eloyfuentesbermudez%40gmail.com';
const req = https.request({
  hostname: 'movilbro-crm.onrender.com',
  path: '/auth/login/solicitar',
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(qs) }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data.substring(0, 1000));
  });
});
req.on('error', e => console.log('Error:', e.message));
req.write(qs);
req.end();
