const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  
  // Try to download by creating a temporary anchor element
  var result = await ctx.newPage().then(async function(page) {
    await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Use the browser's fetch to download the CSV as blob and get the content
    var csvContent = await page.evaluate(async () => {
      try {
        // The app might have the download URL in the Vue component data
        // Try to find the file list data
        var appEl = document.getElementById('app');
        var vueApp = appEl && appEl.__vue_app__;
        if (vueApp) {
          // Try to access the Vue app's state
          var pinia = vueApp.config.globalProperties.$pinia;
          var stores = pinia ? Object.keys(pinia.state.value) : [];
          return { hasVue: true, stores: stores };
        }
        return { hasVue: false };
      } catch(e) { return { error: e.message }; }
    });

    // Try to find the actual download mechanism
    // Method: Use the browser's built-in fetch to try many API patterns
    var csvResult = await page.evaluate(async () => {
      var tests = [
        { url: '/api/v1/storage?file=cdrs_monthly.csv', method: 'GET' },
        { url: '/api/v1/storage/download', method: 'POST', body: JSON.stringify({ file: 'cdrs_monthly.csv' }) },
        { url: '/api/v1/files/download', method: 'POST', body: JSON.stringify({ path: 'cdrs_monthly.csv' }) },
        { url: '/api/v1/download', method: 'POST', body: JSON.stringify({ file: 'cdrs_monthly.csv' }) },
      ];
      
      for (var t of tests) {
        try {
          var opts = { method: t.method, headers: { 'Content-Type': 'application/json' } };
          if (t.body) opts.body = t.body;
          var r = await fetch(t.url, opts);
          var text = await r.text();
          if (text && !text.includes('<!DOCTYPE') && text.length > 50) {
            return { success: true, url: t.url, data: text.substring(0, 500) };
          }
        } catch(e) {}
      }
      
      // Last resort: try to extract the file content from the DOM
      // Maybe it's embedded in the page as base64
      var html = document.body.innerHTML;
      var matches = html.match(/cdrs_monthly[^<]{0,300}/i);
      if (matches) return { dom: matches[0] };
      
      return { success: false };
    });

    return csvResult;
  });

  console.log(JSON.stringify(result, null, 2));

  // If we couldn't get the CSV via API, try downloading via the context's cookies
  if (!result.success) {
    var cookies = await ctx.cookies();
    console.log('\nCookies:', cookies.map(function(c) { return c.name + '=' + c.value.substring(0, 30); }).join('\n'));
  }

  await browser.close();
})();
