const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  var loggedIn = await page.evaluate(() => {
    return document.body.innerText.includes('Dashboard');
  });
  console.log('Logged in:', loggedIn);

  if (!loggedIn) {
    var inputs = await page.$$('input[type="email"]');
    if (inputs.length > 0) {
      await inputs[0].fill('xtptx88@gmail.com');
      var buttons = await page.$$('button');
      for (var b of buttons) {
        var text = await b.textContent();
        if (text.includes('Enviar')) { await b.click(); break; }
      }
      console.log('Code sent. Waiting 60s for you to check email and enter code...');
      await page.waitForTimeout(60000);
    }
  }

  // After login, extract Identity Pool ID
  var poolIds = await page.evaluate(() => {
    try {
      var results = [];
      var html = document.documentElement.outerHTML;
      var regex = /[a-z]{2}-[a-z]+-\d+:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g;
      var match;
      while ((match = regex.exec(html)) !== null) {
        results.push(match[0]);
      }
      return results;
    } catch(e) { return []; }
  });
  
  console.log('Identity Pool IDs found:', poolIds.length > 0 ? poolIds : 'NONE');

  // Also try to get it from the JavaScript bundle
  var scripts = await page.$$('script[src]');
  for (var s of scripts) {
    var src = await s.getAttribute('src');
    if (src && src.includes('index-')) {
      console.log('Main JS bundle:', src);
      // Download the JS and search for identity pool
      try {
        var response = await page.evaluate(async (url) => {
          try {
            var r = await fetch(url);
            var text = await r.text();
            var matches = text.match(/[a-z]{2}-[a-z]+-\d+:\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g);
            return matches ? matches : [];
          } catch(e) { return []; }
        }, src);
        console.log('Identity Pools in JS:', response);
      } catch(e) {}
      break;
    }
  }

  await browser.close();
})();
