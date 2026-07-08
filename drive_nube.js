const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const pages = b.contexts()[0].pages();
  const p = pages.find(p => p.url().includes('drive.google.com'));
  if (!p) { console.log('Drive page not found'); return; }
  await p.bringToFront();

  // First click nube folder to open it
  // Use evaluate to navigate
  await p.evaluate(() => {
    // Find the nube link/entry and click it
    const entries = document.querySelectorAll('[role="row"], [role="gridcell"], [data-doc-id]');
    for (const el of entries) {
      if (el.textContent.trim() === 'nube') {
        el.click();
        return 'clicked nube';
      }
    }
    return 'nube not found';
  });
  await p.waitForTimeout(2000);
  console.log('Current URL:', p.url());

  // Get contents
  const text = await p.evaluate(() => document.body.innerText);
  const lines = text.split('\n').filter(l => l.trim() && l.length > 2).map(l => l.trim()).slice(0, 80);
  console.log('=== INSIDE NUBE FOLDER ===');
  lines.forEach(l => console.log(l));

  // Also check Clientes_KYC
  await p.goto('https://drive.google.com/drive/u/0/folders/1JrStvTy-l0msOmfwT1S0Jupg6Ru6Zemx', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  // Click Clientes_KYC
  await p.evaluate(() => {
    const entries = document.querySelectorAll('[role="row"], [data-doc-id]');
    for (const el of entries) {
      if (el.textContent.includes('Clientes_KYC')) {
        el.click();
        return 'clicked';
      }
    }
    return 'not found';
  });
  await p.waitForTimeout(2000);
  const text2 = await p.evaluate(() => document.body.innerText);
  const lines2 = text2.split('\n').filter(l => l.trim() && l.length > 2).map(l => l.trim()).slice(0, 40);
  console.log('\n=== INSIDE Clientes_KYC ===');
  lines2.forEach(l => console.log(l));
})();
