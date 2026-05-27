const { db } = require('../../database');
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');

async function downloadLatestCDRs() {
  try {
    // 1. Autenticar con Cognito para obtener tokens
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

    // 2. Lanzar Playwright headless
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 3. Inyectar tokens Cognito en localStorage ANTES de cargar la página
    await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    await page.evaluate(function(tokenData) {
      // Los tokens se almacenan con este formato en la app
      var prefix = 'CognitoIdentityServiceProvider.76opnp6ffescubvuuao8am20d';
      var username = 'eloyfuentesbermudez@gmail.com';
      
      localStorage.setItem(prefix + '.' + username + '.idToken', tokenData.idToken);
      localStorage.setItem(prefix + '.' + username + '.accessToken', tokenData.accessToken);
      localStorage.setItem(prefix + '.' + username + '.refreshToken', tokenData.refreshToken);
      localStorage.setItem(prefix + '.LastAuthUser', username);
      localStorage.setItem(prefix + '.' + username + '.signInDetails', JSON.stringify({
        loginId: username,
        authFlowType: 'USER_PASSWORD_AUTH'
      }));
    }, { idToken, accessToken, refreshToken });

    // 4. Recargar la página - ahora debería mostrar el dashboard
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    var loggedIn = await page.evaluate(() => document.body.innerText.includes('Dashboard'));
    console.log('Sesión iniciada:', loggedIn);

    if (!loggedIn) {
      await browser.close();
      return { ok: false, error: 'No se pudo iniciar sesión en Likes Telecom' };
    }

    // 5. Descargar el CSV
    var csvContent = null;
    page.on('response', async function(resp) {
      var url = resp.url();
      if (url.includes('.csv') && resp.status() === 200) {
        try { csvContent = await resp.text(); } catch(e) {}
      }
    });

    // Hacer clic en el botón de acción del archivo cdrs_monthly.csv
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

    // Si no se descargó, buscar botón de descarga
    if (!csvContent) {
      await page.evaluate(() => {
        try {
          var all = document.querySelectorAll('button, a');
          for (var el of all) {
            var t = (el.textContent || '').toLowerCase().trim();
            if (t === 'descargar' || t === 'download') { el.click(); return; }
          }
        } catch(e) {}
      });
      await page.waitForTimeout(3000);
    }

    await browser.close();

    if (csvContent && !csvContent.includes('<!DOCTYPE')) {
      return { ok: true, data: csvContent };
    }
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

module.exports = { downloadLatestCDRs, importCDRs };
