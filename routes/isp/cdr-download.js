const { db } = require('../../database');
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');

async function downloadLatestCDRs() {
  try {
    console.log('Autenticando con Cognito...');
    const cognito = new CognitoIdentityProviderClient({ region: 'eu-central-1' });
    const authCmd = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: '76opnp6ffescubvuuao8am20d',
      AuthParameters: { USERNAME: 'eloyfuentesbermudez@gmail.com', PASSWORD: 'Teresa88.' }
    });
    const authRes = await cognito.send(authCmd);
    const idToken = authRes.AuthenticationResult.IdToken;
    const accessToken = authRes.AuthenticationResult.AccessToken;
    const refreshToken = authRes.AuthenticationResult.RefreshToken;
    console.log('Cognito OK');

    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.evaluate(function(tokenData) {
      var prefix = 'CognitoIdentityServiceProvider.76opnp6ffescubvuuao8am20d';
      var username = 'eloyfuentesbermudez@gmail.com';
      localStorage.setItem(prefix + '.' + username + '.idToken', tokenData.idToken);
      localStorage.setItem(prefix + '.' + username + '.accessToken', tokenData.accessToken);
      localStorage.setItem(prefix + '.' + username + '.refreshToken', tokenData.refreshToken);
      localStorage.setItem(prefix + '.LastAuthUser', username);
      localStorage.setItem(prefix + '.' + username + '.signInDetails', JSON.stringify({
        loginId: username, authFlowType: 'USER_PASSWORD_AUTH'
      }));
    }, { idToken, accessToken, refreshToken });

    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    var loggedIn = await page.evaluate(() => document.body.innerText.includes('Dashboard'));
    console.log('Sesión iniciada:', loggedIn);

    if (!loggedIn) {
      await browser.close();
      return { ok: false, error: 'No se pudo iniciar sesión en Likes Telecom' };
    }

    // Download CDR files
    var csvContent = null;
    var llamadasCsv = null;

    page.on('response', async function(resp) {
      var url = resp.url();
      if (url.includes('.csv') && resp.status() === 200) {
        try {
          var text = await resp.text();
          if (url.includes('cdrs_monthly')) {
            csvContent = text;
            console.log('CDR monthly CSV downloaded:', text.length, 'bytes');
          } else if (text.includes('fiscal_id') || text.includes('Fecha') || text.includes('fecha')) {
            llamadasCsv = text;
            console.log('Llamadas CSV downloaded:', text.length, 'bytes');
          }
        } catch(e) {}
      }
    });

    // Try to download cdrs_monthly.csv
    await page.evaluate(() => {
      try {
        var rows = document.querySelectorAll('.file-row');
        for (var row of rows) {
          if (row.textContent.includes('cdrs_monthly.csv')) {
            var btns = row.querySelectorAll('button');
            for (var btn of btns) {
              if (btn.innerHTML.includes('ri-arrow') || btn.innerHTML.includes('ri-download') || btn.innerHTML.includes('ri-file')) {
                btn.click(); return;
              }
            }
            if (btns.length > 0) btns[btns.length - 1].click();
            return;
          }
        }
      } catch(e) {}
    });
    await page.waitForTimeout(5000);

    // Try to also download detailed call files
    var csvFiles = await page.evaluate(() => {
      try {
        return Array.from(document.querySelectorAll('.file-row')).map(function(row) {
          return row.textContent.trim().substring(0, 200);
        });
      } catch(e) { return []; }
    });
    console.log('Available files:', csvFiles.filter(function(f) { return f.includes('.csv'); }));

    await browser.close();

    var result = { ok: false, data: null, llamadas: null };
    if (csvContent && !csvContent.includes('<!DOCTYPE')) {
      result.ok = true;
      result.data = csvContent;
    }
    if (llamadasCsv && !llamadasCsv.includes('<!DOCTYPE')) {
      result.llamadas = llamadasCsv;
    }
    if (result.ok) return result;
    return { ok: false, error: 'No se pudo descargar el CSV' };
  } catch(e) {
    return { ok: false, error: 'Error: ' + e.message };
  }
}

function importCDRs(csvText, periodo) {
  var lines = csvText.split('\n').filter(Boolean);
  var importados = 0;
  var insert = db.prepare('INSERT OR IGNORE INTO isp_cdrs (fiscal_id, linea, concepto, tipo, importe, unidades, periodo) VALUES (?,?,?,?,?,?,?)');
  for (var i = 1; i < lines.length; i++) {
    try {
      var cols = lines[i].split(',');
      if (cols.length < 3) continue;
      var fiscalId = (cols[0] || '').trim();
      var linea = (cols[1] || '').trim();
      var concepto = (cols[2] || '').trim();
      if (!fiscalId && !linea) continue;
      insert.run(fiscalId, linea, concepto, (cols[3] || 'exceso').trim(), parseFloat(cols[4] || 0), parseFloat(cols[5] || 0), (cols[6] || periodo || '').trim());
      importados++;
    } catch(e) {}
  }
  return importados;
}

function importLlamadas(csvText, periodo) {
  var lines = csvText.split('\n').filter(Boolean);
  var importados = 0;
  var insert = db.prepare('INSERT OR IGNORE INTO isp_llamadas (fiscal_id, linea, fecha, hora, destino, grupo, duracion, importe, periodo) VALUES (?,?,?,?,?,?,?,?,?)');
  for (var i = 1; i < lines.length; i++) {
    try {
      var cols = lines[i].split(',');
      if (cols.length < 5) continue;
      var fiscalId = (cols[0] || '').trim();
      var linea = (cols[1] || '').trim();
      var fecha = (cols[2] || '').trim();
      var hora = (cols[3] || '').trim();
      var destino = (cols[4] || '').trim();
      var grupo = (cols[5] || '').trim();
      var duracion = (cols[6] || '').trim();
      var importe = parseFloat(cols[7] || 0);
      if (!fiscalId && !linea) continue;
      insert.run(fiscalId, linea, fecha, hora, destino, grupo, duracion, importe, (cols[8] || periodo || '').trim());
      importados++;
    } catch(e) {}
  }
  return importados;
}

module.exports = { downloadLatestCDRs, importCDRs, importLlamadas };
