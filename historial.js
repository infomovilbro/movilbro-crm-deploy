const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts()[0].pages();
  
  console.log('=== PAGINAS ABIERTAS ===');
  pages.forEach((p, i) => {
    const url = p.url();
    console.log(i + ':', url.substring(0, 180));
  });
  
  await browser.close();
})().catch(e => console.log('ERR:', e.message));
