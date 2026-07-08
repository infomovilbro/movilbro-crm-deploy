const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  
  await p.goto('https://movilbro-crm.onrender.com/clientes/fiscal/24851082L', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);

  console.log('=== ISSUE 5: KYC docs tab ===');
  const kycTab = await p.$('a:has-text("Documentos KYC")');
  if (kycTab) {
    await kycTab.click();
    await p.waitForTimeout(1000);
    const kycContent = await p.$eval('.tab-pane.active', el => el.textContent.trim().substring(0, 300)).catch(e => 'ERROR: ' + e.message);
    console.log('KYC tab content:', kycContent);
  } else {
    console.log('KYC tab not found');
  }

  console.log('\n=== ISSUE 7: WhatsApp panel/QR polling ===');
  // Check codeopen page for QR polling
  const qrScript = await p.evaluate(() => {
    const scripts = Array.from(document.scripts);
    for (const s of scripts) {
      if (s.textContent.includes('baileys') || s.textContent.includes('qr')) {
        return s.textContent.substring(0, 400);
      }
    }
    return null;
  });
  console.log('QR/Baileys reference:', qrScript ? 'FOUND' : 'None on this page');
  
  // Check layout.ejs for QR
  await p.goto('https://movilbro-crm.onrender.com/', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  const layoutQR = await p.evaluate(() => {
    const scripts = Array.from(document.scripts);
    for (const s of scripts) {
      if (s.textContent.includes('baileys') || (s.textContent.includes('qr') && s.textContent.includes('codeopen'))) {
        return s.textContent.substring(0, 400);
      }
    }
    return null;
  });
  console.log('Layout QR/Baileys:', layoutQR ? 'FOUND' : 'None');
  
  // Check keep-alive
  const keepAlive = await p.evaluate(() => {
    const html = document.documentElement.innerHTML;
    const match = html.match(/setInterval.*fetch.*health[^<]*/);
    return match ? match[0].substring(0, 200) : 'Not found';
  });
  console.log('Keep-alive on layout:', keepAlive);
  
  // Check payment method per line
  console.log('\n=== ISSUE 9: Payment method per line ===');
  const pmBtns = await p.$$eval('[onclick*="cambiarPagoLinea"]', els => {
    return els.slice(0, 5).map(el => ({
      text: el.textContent.trim(),
      onclick: el.getAttribute('onclick')
    }));
  }).catch(e => 'ERROR: ' + e.message);
  console.log('Payment buttons:', JSON.stringify(pmBtns, null, 2));
  console.log('Count:', Array.isArray(pmBtns) ? pmBtns.length : 0);
  
  await p.close();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
