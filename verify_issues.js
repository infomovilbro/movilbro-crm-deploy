const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  
  // Navigate to the client view page for Dolores Sierra
  await p.goto('https://movilbro-crm.onrender.com/clientes/fiscal/24851082L', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  
  console.log('=== ISSUE 1: Consumo GB dropdown ===');
  const gbSelect = await p.$eval('#gbLineSelect', el => {
    const opts = Array.from(el.options).map(o => o.textContent + '=' + o.value);
    return { options: opts, selectedValue: el.value };
  }).catch(e => 'ERROR: ' + e.message);
  console.log(JSON.stringify(gbSelect, null, 2));
  
  console.log('\n=== ISSUE 2: Check for duplicate sections ===');
  const sections = await p.$$eval('.card-body tr, [class*="card-body"]', els => {
    const lines = [];
    els.forEach(e => {
      const th = e.querySelector('th');
      if (th) lines.push(th.textContent.trim());
    });
    // Count repeated th values
    const counts = {};
    lines.forEach(l => { counts[l] = (counts[l] || 0) + 1; });
    const dupes = Object.entries(counts).filter(([k,v]) => v > 1);
    return { repeats: dupes, all: lines.slice(0, 30) };
  }).catch(e => 'ERROR: ' + e.message);
  console.log(JSON.stringify(sections, null, 2));
  
  console.log('\n=== ISSUE 3: AEAT section ===');
  const aeatHtml = await p.$eval('.card-header:has-text(\"AEAT\")', el => {
    const card = el.closest('.card');
    const rows = Array.from(card.querySelectorAll('tr')).map(tr => ({
      th: tr.querySelector('th')?.textContent?.trim(),
      td: tr.querySelector('td')?.textContent?.trim()
    }));
    return rows;
  }).catch(e => 'ERROR: ' + e.message);
  console.log(JSON.stringify(aeatHtml, null, 2));
  
  console.log('\n=== ISSUE 4: Keep-alive visible text ===');
  const bodyHtml = await p.evaluate(() => document.body.innerHTML);
  const keepAliveMatch = bodyHtml.match(/setInterval.*fetch.*\/health[^<]*/);
  console.log('Keep-alive code found in HTML:', keepAliveMatch ? 'YES (visible as text)' : 'NO (hidden)');
  
  console.log('\n=== ISSUE 6: FB Pixel / Keep-alive visible lines ===');
  const lines = bodyHtml.split('\n').filter(l => l.includes('health') || l.includes('keepAlive')).slice(0, 5);
  lines.forEach(l => console.log(l?.substring(0, 200)));
  
  await p.close();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });
