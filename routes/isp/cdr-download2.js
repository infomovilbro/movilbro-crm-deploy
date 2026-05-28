const { db } = require('../../database');
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');

async function downloadAllCDRs() {
  try {
    console.log('Autenticando...');
    const cognito = new CognitoIdentityProviderClient({ region: 'eu-central-1' });
    const authCmd = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: '76opnp6ffescubvuuao8am20d',
      AuthParameters: { USERNAME: 'eloyfuentesbermudez@gmail.com', PASSWORD: 'Teresa88.' }
    });
    const authRes = await cognito.send(authCmd);
    const tokens = { idToken: authRes.AuthenticationResult.IdToken, accessToken: authRes.AuthenticationResult.AccessToken, refreshToken: authRes.AuthenticationResult.RefreshToken };
    console.log('Cognito OK');

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set up download handler BEFORE navigation
    var csvs = {};
    page.on('response', async function(resp) {
      var url = resp.url();
      if (url.includes('.csv') && resp.status() === 200) {
        try {
          var text = await resp.text();
          if (!text.includes('<!DOCTYPE') && text.length > 50) {
            var name = url.split('/').pop().split('?')[0];
            csvs[name] = text;
            console.log('Got:', name, text.length, 'bytes');
          }
        } catch(e) {}
      }
    });

    await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(function(t) {
      var p = 'CognitoIdentityServiceProvider.76opnp6ffescubvuuao8am20d';
      var u = 'eloyfuentesbermudez@gmail.com';
      localStorage.setItem(p + '.' + u + '.idToken', t.idToken);
      localStorage.setItem(p + '.' + u + '.accessToken', t.accessToken);
      localStorage.setItem(p + '.' + u + '.refreshToken', t.refreshToken);
      localStorage.setItem(p + '.LastAuthUser', u);
    }, tokens);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    var loggedIn = await page.evaluate(() => document.body.innerText.includes('Dashboard'));
    console.log('Sesión:', loggedIn);
    if (!loggedIn) { await browser.close(); return { ok: false, error: 'No login' }; }

    // Get download links for CSV files
    var downloadInfo = await page.evaluate(() => {
      try {
        var result = [];
        var fileRows = document.querySelectorAll('.file-row');
        fileRows.forEach(function(row) {
          var text = row.textContent.trim();
          if (!text.includes('.csv')) return;
          var links = row.querySelectorAll('a');
          var buttons = row.querySelectorAll('button');
          var all = [];
          links.forEach(function(l) { all.push({ tag: 'a', href: l.href, text: l.textContent.trim() }); });
          buttons.forEach(function(b) { all.push({ tag: 'button', html: b.innerHTML.substring(0,100), text: b.textContent.trim() }); });
          result.push({ name: text.substring(0,50), elements: all });
        });
        return JSON.stringify(result);
      } catch(e) { return '[]'; }
    });

    var files = JSON.parse(downloadInfo);
    console.log('Files:', files.length);
    files.forEach(function(f) { console.log(' ', f.name); });

    // Try to trigger download by clicking links/buttons
    for (var file of files) {
      if (file.name.includes('cdrs_monthly')) {
        console.log('Trying to download:', file.name);
        var rowIdx = files.indexOf(file);
        await page.evaluate(function(idx) {
          var rows = document.querySelectorAll('.file-row');
          var row = rows[idx];
          if (!row) return;
          // Try clicking last button (usually download)
          var btns = row.querySelectorAll('button');
          if (btns.length > 0) btns[btns.length - 1].click();
        }, rowIdx);
        await page.waitForTimeout(3000);
      }
    }

    await browser.close();
    console.log('Total downloaded:', Object.keys(csvs).length);
    return { ok: Object.keys(csvs).length > 0, csvs: csvs };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function importAllCDRs(csvs, periodo) {
  var total = 0;
  var totalLlamadas = 0;
  var insertCdr = db.prepare('INSERT OR IGNORE INTO isp_cdrs (fiscal_id, linea, concepto, tipo, importe, unidades, periodo) VALUES (?,?,?,?,?,?,?)');
  var insertLlam = db.prepare('INSERT OR IGNORE INTO isp_llamadas (fiscal_id, linea, fecha, hora, destino, grupo, duracion, importe, periodo) VALUES (?,?,?,?,?,?,?,?,?)');

  for (var name in csvs) {
    var text = csvs[name];
    var lines = text.split('\n').filter(Boolean);
    for (var i = 1; i < lines.length; i++) {
      try {
        var cols = lines[i].split(',');
        if (cols.length < 5) continue;
        var fiscalId = (cols[0] || '').trim();
        var linea = (cols[1] || '').trim();
        if (!fiscalId && !linea) continue;
        if (cols.length >= 8) {
          insertLlam.run(fiscalId, linea, (cols[2]||'').trim(), (cols[3]||'').trim(), (cols[4]||'').trim(), (cols[5]||'').trim(), (cols[6]||'').trim(), parseFloat(cols[7]||0), (cols[8]||periodo||'').trim());
          totalLlamadas++;
        } else {
          insertCdr.run(fiscalId, linea, (cols[2]||'').trim(), (cols[3]||'exceso').trim(), parseFloat(cols[4]||0), parseFloat(cols[5]||0), (cols[6]||periodo||'').trim());
          total++;
        }
      } catch(e) {}
    }
  }
  return { cdrs: total, llamadas: totalLlamadas };
}

module.exports = { downloadAllCDRs, importAllCDRs };
