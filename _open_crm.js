const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const p = b.contexts()[0].pages()[0];
  await p.goto('https://movilbro-crm.onrender.com', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  console.log('CRM URL:', p.url());
  console.log('CRM TITLE:', await p.title());
  await b.close();
})().catch(e => console.error('Error:', e.message));
