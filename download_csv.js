const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // Listen for network responses
  var apiResponses = [];
  page.on('response', function(response) {
    var url = response.url();
    if (url.includes('api') || url.includes('csv') || url.includes('file') || url.includes('storage') || url.includes('download') || url.includes('drive')) {
      apiResponses.push({ url: url, status: response.status() });
    }
  });

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Clear responses from page load
  apiResponses = [];

  // Click on cdrs_monthly.csv
  var clicked = await page.evaluate(() => {
    try {
      var all = document.querySelectorAll('*');
      for (var el of all) {
        if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return el.tagName + ' ' + (el.className || '');
        }
      }
      return 'Not found';
    } catch(e) { return 'Error: ' + e.message; }
  });
  console.log('Clicked:', clicked);

  await page.waitForTimeout(5000);

  console.log('\nAPI responses after click:');
  apiResponses.forEach(function(r) { console.log('  ' + r.status + ' ' + r.url); });

  // If no API responses, try getting the file list from the page
  var files = await page.evaluate(() => {
    try {
      var items = [];
      document.querySelectorAll('.v-list-item, .v-list-item-title, .file-item, [class*=\"file\"]').forEach(function(el) {
        var text = el.textContent.trim();
        if (text && text.length > 0 && text.length < 60 && (text.includes('.csv') || text.includes('.xls'))) {
          items.push(text);
        }
      });
      return items;
    } catch(e) { return []; }
  });
  console.log('\nVisible files:', files.slice(0, 10));

  // Try right-click / context menu approach
  var contextResult = await page.evaluate(async () => {
    try {
      var all = document.querySelectorAll('*');
      for (var el of all) {
        if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
          el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
          await new Promise(function(r) { setTimeout(r, 2000); });
          return 'Context menu opened';
        }
      }
      return 'Not found';
    } catch(e) { return 'Error: ' + e.message; }
  });
  console.log('\nContext menu:', contextResult);

  // Check for any download buttons/links now
  var downloadBtns = await page.evaluate(() => {
    var items = [];
    document.querySelectorAll('a, button, [role=\"menuitem\"], .v-list-item').forEach(function(el) {
      var text = el.textContent.trim();
      if (text.toLowerCase().includes('descarg') || text.toLowerCase().includes('download') || text.toLowerCase().includes('export')) {
        items.push(text);
      }
    });
    return items;
  });
  console.log('Download buttons after context menu:', downloadBtns);

  await browser.close();
})();
