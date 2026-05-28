const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Find all visible interactive elements
  var buttons = await page.evaluate(() => {
    var items = [];
    document.querySelectorAll('i, svg, [class*=\"icon\"], [class*=\"btn\"], [role=\"button\"], [class*=\"action\"]').forEach(function(el) {
      if (el.offsetParent !== null) {
        items.push({
          tag: el.tagName,
          text: el.textContent.trim().substring(0, 30),
          class: (el.className || '').substring(0, 60),
          title: el.getAttribute('title') || el.getAttribute('aria-label') || ''
        });
      }
    });
    return items;
  });
  console.log('=== VISIBLE INTERACTIVE ELEMENTS ===');
  buttons.forEach(function(b) { console.log('  ' + b.tag + ' text="' + b.text + '" class=' + b.class); });

  // Click the first CSV to select it, then look for download button
  var csvElements = await page.$$('*');
  for (var el of csvElements) {
    var text = await el.textContent();
    if (text && text.trim() === 'cdrs_20260526.csv') {
      await el.click();
      break;
    }
  }
  await page.waitForTimeout(2000);

  var newButtons = await page.evaluate(() => {
    var items = [];
    document.querySelectorAll('i, svg, [class*=\"icon\"], [class*=\"btn\"]').forEach(function(el) {
      if (el.offsetParent !== null) {
        var text = el.textContent.toLowerCase().trim();
        if (text.includes('descarg') || text.includes('download') || text.includes('abrir') || text.includes('open') || text.includes('export')) {
          items.push({
            html: el.outerHTML.substring(0, 200),
            rect: el.getBoundingClientRect()
          });
        }
      }
    });
    return items;
  });
  console.log('\n=== DOWNLOAD BUTTONS AFTER SELECT ===');
  newButtons.forEach(function(b) { console.log('  ' + b.html); });

  // Also try clicking the file row to see if a download trigger appears
  var fileRowHTML = await page.evaluate(() => {
    try {
      var all = document.querySelectorAll('*');
      for (var el of all) {
        if (el.textContent && el.textContent.trim() === 'cdrs_20260526.csv') {
          var row = el.closest('[class]');
          if (row) {
            row.click();
            return 'Clicked row';
          }
        }
      }
      return 'No row found';
    } catch(e) { return e.message; }
  });
  console.log('\nRow click:', fileRowHTML);
  await page.waitForTimeout(2000);

  // Check for any modal or panel that opened
  var modals = await page.evaluate(() => {
    var items = [];
    document.querySelectorAll('[class*=\"modal\"], [class*=\"dialog\"], [class*=\"panel\"], [class*=\"overlay\"], [class*=\"drawer\"]').forEach(function(el) {
      if (el.offsetParent !== null) {
        items.push(el.className.substring(0, 80));
      }
    });
    return items;
  });
  console.log('Visible modals/panels:', modals);

  await browser.close();
})();
