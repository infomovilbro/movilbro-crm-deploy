const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Get the file row HTML
  var info = await page.evaluate(() => {
    try {
      var all = document.querySelectorAll('*');
      for (var el of all) {
        if (el.textContent && el.textContent.trim() === 'cdrs_20260526.csv') {
          var row = el.closest('.file-row') || el.closest('[class*=\"row\"]') || el.closest('tr') || el.closest('li') || el.parentElement;
          return {
            elTag: el.tagName,
            elClass: el.className,
            elId: el.id || '',
            parentHTML: row ? row.outerHTML.substring(0, 2500) : el.outerHTML.substring(0, 2500)
          };
        }
      }
      // Try finding the last daily CSV (today or yesterday)
      for (var el of all) {
        if (el.textContent && el.textContent.trim().match(/cdrs_2026052\d\.csv/)) {
          var row = el.closest('[class*=\"row\"]') || el.parentElement;
          return {
            elTag: el.tagName,
            elClass: el.className,
            text: el.textContent.trim(),
            parentHTML: row ? row.outerHTML.substring(0, 2500) : el.outerHTML.substring(0, 2500)
          };
        }
      }
      return { error: 'No CSV files found' };
    } catch(e) { return { error: e.message }; }
  });

  console.log('=== FILE ROW INFO ===');
  console.log(JSON.stringify(info, null, 2));

  // Also get all elements that could be file download triggers
  var downloadElements = await page.evaluate(() => {
    var items = [];
    document.querySelectorAll('i[class*=\"download\"], [class*=\"download\"], button:not([type]), [role=\"button\"]').forEach(function(el) {
      if (el.offsetParent !== null) { // only visible elements
        items.push({
          tag: el.tagName,
          text: el.textContent.trim().substring(0, 30),
          class: el.className.substring(0, 60),
          onclick: el.getAttribute('onclick') ? el.getAttribute('onclick').substring(0, 80) : '',
          rect: el.getBoundingClientRect()
        });
      }
    });
    return items.slice(0, 20);
  });
  console.log('\n=== POTENTIAL DOWNLOAD BUTTONS ===');
  downloadElements.forEach(function(d) { console.log('  ' + d.tag + ' ' + d.text.padEnd(20) + d.class); });

  // Try clicking download icon next to a CSV file
  await browser.close();
})();
