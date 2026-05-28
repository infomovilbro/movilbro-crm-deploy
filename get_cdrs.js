const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Try to get CSV content via API
  var result = await page.evaluate(async () => {
    try {
      var resp = await fetch('/api/files/cdrs_monthly.csv');
      if (!resp.ok) return 'Status: ' + resp.status;
      var text = await resp.text();
      return text.substring(0, 3000);
    } catch(e) { return 'Error: ' + e.message; }
  });
  console.log('=== CDRS_MONTHLY.CSV CONTENT ===');
  console.log(result);

  // Try other paths for the files
  var paths = ['/api/files', '/api/resources', '/files', '/api/storage', '/api/download'];
  for (var p of paths) {
    try {
      var resp = await page.evaluate(async (path) => {
        try {
          var r = await fetch(path);
          return { status: r.status, text: (await r.text()).substring(0, 500) };
        } catch(e) { return { status: 'error', text: e.message }; }
      }, p);
      console.log('\n' + p + ': ' + resp.status);
      if (resp.text && resp.text.length > 10) console.log(resp.text.substring(0, 300));
    } catch(e) { console.log(p + ': error'); }
  }

  // Look for the actual download element
  var downloadInfo = await page.evaluate(() => {
    var items = [];
    // Look for any element containing csv
    document.querySelectorAll('*').forEach(function(el) {
      if (el.children.length === 0 && el.textContent && el.textContent.includes('.csv')) {
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          items.push(el.textContent.trim());
        }
      }
    });
    return items.slice(0, 30);
  });
  console.log('\n=== VISIBLE CSV ELEMENTS ===');
  downloadInfo.forEach(function(i) { console.log('  ' + i); });

  // Click on one of the CSV files to trigger download
  var csvElements = await page.$$('*');
  for (var el of csvElements) {
    var text = await el.textContent();
    if (text.includes('cdrs_monthly.csv')) {
      console.log('\nFound cdrs_monthly.csv element, clicking...');
      await el.click();
      await page.waitForTimeout(3000);
      break;
    }
  }
  
  var url = page.url();
  console.log('URL after click:', url);

  await browser.close();
})();
