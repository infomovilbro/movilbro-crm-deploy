const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const pages = b.contexts()[0].pages();
  const p = pages.find(p => p.url().includes('drive.google.com'));
  if (!p) { console.log('Drive page not found'); return; }
  await p.bringToFront();
  await p.waitForTimeout(3000);

  const items = await p.evaluate(() => {
    // Try multiple selectors to find file/folder names
    const all = [];
    // Google Drive renders files in a virtualized grid, data attributes
    document.querySelectorAll('[data-doc-id], [data-id], [role="row"], [role="gridcell"], [data-entity-type]').forEach(el => {
      const t = el.textContent.trim().substring(0, 80);
      if (t && t.length > 1 && t.length < 60) all.push(t);
    });
    return [...new Set(all)].slice(0, 50);
  });
  console.log('=== FILES/FOLDERS IN DRIVE ROOT ===');
  items.forEach(i => console.log(' -', i));

  // Also get the HTML structure to identify folder names
  const html = await p.evaluate(() => {
    const containers = document.querySelectorAll('[data-target="doc"], [role="grid"]');
    if (containers.length > 0) return containers[0].innerHTML.substring(0, 2000);
    // Try another common Drive selectors
    const main = document.querySelector('.a-pa-a, .a-g-W, div[role="main"]');
    if (main) return main.innerHTML.substring(0, 2000);
    return 'No recognizable container found';
  });
  console.log('\n=== HTML STRUCTURE ===');
  console.log(html.substring(0, 1500));
})();
