const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  
  await page.goto('https://movilbro.ispgestion.com/contratosmadre/573', { waitUntil: 'networkidle', timeout: 15000 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: 'contrato_573.png', fullPage: true });
  console.log('Captura guardada: contrato_573.png');
  
  await browser.close();
})();
