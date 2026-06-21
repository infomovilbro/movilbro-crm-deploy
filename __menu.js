const { chromium } = require('playwright');
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = b.contexts()[0];
  const pages = ctx.pages();
  let p = null;
  for (const page of pages) { if (page.url().includes('replit.com/@')) { p = page; break; } }
  if (!p) { console.log('NO_PAGE'); await b.close(); return; }

  // Click Menu
  const menu = await p.$('[aria-label="Menu"]');
  if (menu) { await menu.click(); console.log('MENU'); await new Promise(r => setTimeout(r, 2000)); }

  // Check for restart/reboot/recover options
  const btns = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [role="menuitem"], a'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        t: (el.textContent || '').trim().substring(0, 50),
        a: (el.getAttribute('aria-label') || '').substring(0, 50)
      }))
      .filter(x => x.t || x.a);
  });
  const recover = btns.filter(x => x.t.toLowerCase().includes('recover') || x.a.toLowerCase().includes('recover')
    || x.t.toLowerCase().includes('restart') || x.a.toLowerCase().includes('restart')
    || x.t.toLowerCase().includes('reboot') || x.a.toLowerCase().includes('reboot')
    || x.t.toLowerCase().includes('reset') || x.a.toLowerCase().includes('reset'));
  console.log('RECOVER:', JSON.stringify(recover));
  console.log('ALL:', JSON.stringify(btns));
  await b.close();
}
main().catch(e => { console.log('ERR', e.message); });
