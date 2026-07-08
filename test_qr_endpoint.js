const https = require('https');

https.get('https://movilbro-crm.onrender.com/codeopen/baileys-qr', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
}).on('error', e => console.log('Error:', e.message));