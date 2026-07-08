const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  console.log('Paginas abiertas:');
  for (var p of pages) {
    console.log(' -', p.url().substring(0, 120));
  }
  await b.close();
})();
