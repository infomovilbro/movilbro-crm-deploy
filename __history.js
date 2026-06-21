const { chromium } = require('playwright');
async function main() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = b.contexts()[0];
  const pages = ctx.pages();
  let p = null;
  for (const page of pages) { if (page.url().includes('replit.com/@')) { p = page; break; } }
  if (!p) { console.log('NO_PAGE'); await b.close(); return; }

  const h = await p.$('[aria-label="History"]');
  if (h) {
    await h.click();
    console.log('CLICKED_HISTORY');
    await new Promise(r => setTimeout(r, 3000));
    const buttons = await p.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({
          t: (el.textContent || '').trim().substring(0, 40),
          a: (el.getAttribute('aria-label') || '').substring(0, 40)
        }))
        .filter(x => x.t || x.a);
    });
    const gitpull = buttons.filter(x => x.t.toLowerCase().includes('pull') || x.a.toLowerCase().includes('pull'));
    const fetchbtn = buttons.filter(x => x.t.toLowerCase().includes('fetch') || x.a.toLowerCase().includes('fetch'));
    const git = buttons.filter(x => x.t.toLowerCase().includes('git') || x.a.toLowerCase().includes('git'));
    console.log('PULL:', JSON.stringify(gitpull));
    console.log('FETCH:', JSON.stringify(fetchbtn));
    console.log('GIT:', JSON.stringify(git));
    console.log('FIRST20:', JSON.stringify(buttons.slice(0, 20)));
  } else {
    console.log('NO_HISTORY');
  }
  await b.close();
}
main().catch(e => { console.log('ERR', e.message); });
