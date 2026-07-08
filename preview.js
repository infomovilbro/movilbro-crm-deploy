const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts()[0].pages();
  const page = pages.find(p => p.url().includes('movilbro-crm-deploy') && !p.url().includes('.replit.dev'));
  if (!page) { console.log('No workspace page'); return; }
  
  console.log('Page:', page.url());
  
  // Click Preview button
  const previewBtn = page.locator('button:has-text("Preview")');
  if (await previewBtn.count() > 0) {
    await previewBtn.click();
    console.log('Clicked Preview');
    await page.waitForTimeout(5000);
    
    // Check for new tabs or iframes
    const allPages = browser.contexts()[0].pages();
    console.log('Total pages:', allPages.length);
    allPages.forEach((p, i) => {
      const u = p.url();
      if (u.includes('replit.dev') || u.includes('replit.app')) console.log(i + ':', u);
    });
    
    // Check the page text for URL
    const text = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    const match = text.match(/https?:\/\/[a-zA-Z0-9-]+\.replit\.dev[^\s<]*/);
    if (match) console.log('CRM URL found:', match[0]);
  } else {
    console.log('Preview button not found');
  }
  
  await browser.close();
})().catch(e => console.log('ERR:', e.message));
