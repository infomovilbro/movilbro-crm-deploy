const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  var csvUrl = null;

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Click the right-arrow button to open the file details
  await page.evaluate(() => {
    var all = document.querySelectorAll('*');
    for (var el of all) {
      if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
        var row = el.closest('.file-row');
        if (row) {
          // Find the arrow button
          var arrowBtn = row.querySelector('.ri-arrow-right-s-line');
          if (arrowBtn) {
            arrowBtn.closest('button').click();
          } else {
            // Try all buttons in the row
            var btns = row.querySelectorAll('button');
            if (btns.length > 0) btns[btns.length - 1].click();
          }
        }
        return;
      }
    }
  });

  await page.waitForTimeout(3000);

  // Check if a detail panel opened
  var panel = await page.evaluate(() => {
    try {
      var panels = document.querySelectorAll('[class*=\"panel\"], [class*=\"drawer\"], [class*=\"detail\"]');
      for (var p of panels) {
        if (p.offsetParent !== null) return p.outerHTML.substring(0, 2000);
      }
      return 'No panel visible';
    } catch(e) { return e.message; }
  });
  console.log('Panel after click:', panel);

  // If a download button appeared, click it
  var downloadClicked = await page.evaluate(() => {
    try {
      var all = document.querySelectorAll('*');
      for (var el of all) {
        var t = el.textContent.toLowerCase().trim();
        if (t === 'descargar' || t === 'download' || t === 'abrir') {
          el.click();
          return 'Clicked: ' + t;
        }
      }
      return 'No download button found';
    } catch(e) { return e.message; }
  });
  console.log('Download action:', downloadClicked);
  await page.waitForTimeout(3000);

  console.log('CSV URL found:', csvUrl);

  await browser.close();
})();
