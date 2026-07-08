const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const pages = ctx.pages();
  console.log('Total pages:', pages.length);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    console.log(`\n--- PAGE ${i} ---`);
    console.log('URL:', p.url());
    console.log('Title:', await p.title());
    const text = await p.evaluate(() => document.body.innerText);
    console.log('Body text (first 2000 chars):', text.substring(0, 2000));
  }
  await b.close();
})().catch(e => console.error('Error:', e.message));
