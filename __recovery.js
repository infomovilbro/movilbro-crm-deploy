const { chromium } = require('playwright');
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = b.contexts()[0];
  const pages = ctx.pages();
  let p = null;
  for (const page of pages) { if (page.url().includes('replit.com/@')) { p = page; break; } }
  if (!p) { console.log('NO_PAGE'); await b.close(); return; }

  // Check the main content area for recovery mode UI
  const mainContent = await p.evaluate(() => {
    const main = document.querySelector('main, [role="main"], .main, #main');
    if (main) return main.textContent.substring(0, 2000);
    // Fallback: look for visible text container
    const all = document.body.innerText;
    return all.substring(0, 3000);
  });
  console.log('CONTENT:', mainContent);

  await b.close();
}
main().catch(e => { console.log('ERR', e.message); });
