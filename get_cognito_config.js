const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const ctx = browser.contexts()[0];
    const page = await ctx.newPage();

    // Login to ISP Gestion first (to get access to Likes Telecom)
    await page.goto('https://movilbro.ispgestion.com/site/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => { var el = document.getElementById('coordenadas_control_presencia'); if (el) el.value = '37.019,-4.561'; });
    await page.fill('#LoginForm_usuario', '25345979W');
    await page.fill('#LoginForm_contrase\u00f1a', '030220251259aB@');
    await page.click('#acceder');
    await page.waitForTimeout(4000);
    if (page.url().includes('login')) { console.log('ISP login FAILED, asking user...'); return; }

    // Go to Likes Telecom resources
    await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    // Check if we need to log in
    var pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    if (pageText.includes('inicia sesi')) {
      console.log('Likes Telecom requiere login. Por favor, inicia sesión en el Edge abierto.');
      console.log('Email: eloyfuentesbermudez@gmail.com');
      await page.waitForTimeout(60000); // Wait 1 minute for user to log in
    }

    // Extract Cognito configuration from the app
    var config = await page.evaluate(() => {
      try {
        var items = {};
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key.includes('Cognito') || key.includes('aws') || key.includes('pool')) {
            items[key] = localStorage.getItem(key).substring(0, 200);
          }
        }
        return items;
      } catch(e) { return { error: e.message }; }
    });
    console.log('Cognito config:');
    for (var k in config) {
      console.log('  ' + k + ' = ' + config[k]);
    }

    // Also check session storage
    var session = await page.evaluate(() => {
      try {
        var items = {};
        for (var i = 0; i < sessionStorage.length; i++) {
          var key = sessionStorage.key(i);
          items[key] = sessionStorage.getItem(key).substring(0, 200);
        }
        return items;
      } catch(e) { return { error: e.message }; }
    });
    console.log('\nSession storage:');
    for (var k in session) {
      console.log('  ' + k + ' = ' + session[k]);
    }

    await browser.close();
  } catch(e) { console.log('Error:', e.message); }
})();
