const { chromium } = require('playwright');
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = b.contexts()[0];
  const pages = ctx.pages();
  let p = null;
  for (const page of pages) { if (page.url().includes('replit.com/@')) { p = page; break; } }
  if (!p) { console.log('NO_PAGE'); await b.close(); return; }

  // Close any existing menu by clicking elsewhere
  await p.evaluate(() => document.body.click());
  await new Promise(r => setTimeout(r, 500));

  // Click "Tools & files" button to see available tools
  const toolsBtn = await p.$('[aria-label="Tools & files"]');
  if (toolsBtn) { await toolsBtn.click(); console.log('TOOLS'); await new Promise(r => setTimeout(r, 2000)); }

  // Look for restart/reboot options
  const tools = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"], a'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        t: (el.textContent || '').trim().substring(0, 50),
        a: (el.getAttribute('aria-label') || '').substring(0, 50)
      }))
      .filter(x => (x.t || x.a));
  });
  const restart = tools.filter(x =>
    x.t.toLowerCase().includes('restart') || x.a.toLowerCase().includes('restart') ||
    x.t.toLowerCase().includes('reboot') || x.a.toLowerCase().includes('reboot') ||
    x.t.toLowerCase().includes('reset') || x.a.toLowerCase().includes('reset') ||
    x.t.toLowerCase().includes('recover') || x.a.toLowerCase().includes('recover') ||
    x.t.includes('Run') || x.a.includes('Run') ||
    x.t.includes('run') || x.a.includes('run')
  );
  console.log('RESTART/RUN:', JSON.stringify(restart));
  console.log('ALL:', JSON.stringify(tools.slice(0, 30)));
  await b.close();
}
main().catch(e => { console.log('ERR', e.message); });
