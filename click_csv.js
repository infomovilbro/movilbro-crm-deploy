const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Use page.evaluate to click the CSV file link
  var result = await page.evaluate(async () => {
    try {
      var all = document.querySelectorAll('*');
      for (var el of all) {
        if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
          el.click();
          await new Promise(function(r) { setTimeout(r, 3000); });
          return 'Clicked on: ' + el.tagName;
        }
      }
      return 'Not found';
    } catch(e) { return 'Error: ' + e.message; }
  });
  console.log('Result:', result);

  // Check what the page shows now
  await page.waitForTimeout(2000);
  var bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');
  console.log('Body after click:', bodyText);

  // Try to use the browser's download mechanism
  var csvContent = await page.evaluate(async () => {
    try {
      // Try fetching the file from the API directly
      var r = await fetch('/api/v1/resources/download?file=cdrs_monthly.csv');
      if (r.ok) {
        var text = await r.text();
        return { status: r.status, data: text.substring(0, 500) };
      }
      // Try another path
      var r2 = await fetch('/api/download?file=cdrs_monthly.csv');
      if (r2.ok) {
        var text2 = await r2.text();
        return { status: r2.status, data: text2.substring(0, 500) };
      }
      return { status: 'not found' };
    } catch(e) { return { error: e.message }; }
  });
  console.log('Download attempt:', JSON.stringify(csvContent, null, 2));

  await browser.close();
})();
