var https = require('https');
var xml = '<speak version="1.0" xml:lang="es-ES"><voice name="es-ES-AlvaroNeural">Hola esto es una prueba</voice></speak>';
var req = https.request({
  hostname: 'eastus.tts.speech.microsoft.com',
  path: '/cognitiveservices/v1',
  method: 'POST',
  headers: {
    'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
    'Content-Type': 'application/ssml+xml',
    'Ocp-Apim-Subscription-Key': 'NONE'
  },
  timeout: 5000
}, function(r) {
  console.log('Status:', r.statusCode);
  var d = [];
  r.on('data', function(c) { d.push(c); });
  r.on('end', function() {
    console.log('Body:', Buffer.concat(d).toString('utf8', 0, 200));
  });
});
req.write(xml);
req.on('error', function(e) { console.log('Error:', e.message); });
req.end();
