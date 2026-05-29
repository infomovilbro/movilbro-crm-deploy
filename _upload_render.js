const fs = require('fs');
const path = require('path');
const https = require('https');

var RENDER_URL = 'movilbro-crm.onrender.com';
var COOKIE = 'movilbro.sid=s%3AdBOgMzsUShaciRSB8fXEmOzRpwynE6bX.0yadlIzS988KYJiFSGihuucm%2Bctsw6ozJLRtjyIbXwo';
var MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Read cookies from file
var cookieFile = path.join(__dirname, '..', 'cookies.txt');
if (fs.existsSync(cookieFile)) {
  var lines = fs.readFileSync(cookieFile, 'utf8').split('\n');
  lines.forEach(function(l) {
    if (l.includes('movilbro.sid')) {
      var parts = l.split('\t');
      if (parts.length >= 7) {
        COOKIE = 'movilbro.sid=' + parts[6].trim();
      }
    }
  });
}

console.log('Usando cookie:', COOKIE.substring(0, 50) + '...');

function uploadZip(zipPath) {
  return new Promise(function(resolve, reject) {
    var zipName = path.basename(zipPath);
    var zipData = fs.readFileSync(zipPath);
    var boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    
    var bodyParts = [];
    bodyParts.push('--' + boundary);
    bodyParts.push('Content-Disposition: form-data; name="zip"; filename="' + zipName + '"');
    bodyParts.push('Content-Type: application/zip');
    bodyParts.push('');
    bodyParts.push(zipData.toString('binary'));
    bodyParts.push('--' + boundary + '--');
    bodyParts.push('');
    
    var body = bodyParts.join('\r\n');
    
    var options = {
      hostname: RENDER_URL,
      path: '/isp/nube/subir-zip',
      method: 'POST',
      headers: {
        'Cookie': COOKIE,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': Buffer.byteLength(body, 'binary')
      }
    };
    
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          var result = JSON.parse(data);
          resolve(result);
        } catch(e) {
          resolve({ ok: false, error: 'Respuesta inválida: ' + data.substring(0, 100) });
        }
      });
    });
    
    req.on('error', function(e) { reject(e); });
    req.write(body, 'binary');
    req.end();
  });
}

async function main() {
  var zipsDir = path.join(process.env.USERPROFILE || 'C:\\Users\\xtptx', 'Desktop', 'zips_para_render');
  
  if (!fs.existsSync(zipsDir)) {
    console.log('No existe:', zipsDir);
    // Fallback to individual year-month ZIPs from nube
    zipsDir = path.join(__dirname, '..', 'nube');
    console.log('Usando nube dir directamente');
  }
  
  var zips = fs.readdirSync(zipsDir).filter(function(f) { return f.endsWith('.zip'); }).sort();
  
  if (zips.length === 0) {
    console.log('No hay ZIPs en', zipsDir);
    return;
  }
  
  console.log('ZIPs a subir:', zips.length);
  
  for (var i = 0; i < zips.length; i++) {
    var zipName = zips[i];
    var zipPath = path.join(zipsDir, zipName);
    var sizeMB = Math.round(fs.statSync(zipPath).size / (1024 * 1024));
    process.stdout.write('[' + (i+1) + '/' + zips.length + '] ' + zipName + ' (' + sizeMB + ' MB)... ');
    
    try {
      var result = await uploadZip(zipPath);
      if (result.ok) {
        console.log('✅', result.message || 'OK');
      } else {
        console.log('❌', result.error || 'Error');
      }
    } catch(e) {
      console.log('❌', e.message.substring(0, 60));
    }
    // Small delay between uploads
    await new Promise(function(r) { setTimeout(r, 1000); });
  }
  
  console.log('\nCompletado. Revisa https://movilbro-crm.onrender.com/isp/nube');
}

main().catch(function(e) { console.error('Fatal:', e.message); });
