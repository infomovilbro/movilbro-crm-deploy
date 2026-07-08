const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('movilbro-crm-deploy'));
  if (!page) { process.exit(); }
  
  // Try clicking the Run button instead of typing in Shell
  const runBtn = page.locator('button:has-text("Run")');
  if (await runBtn.count() > 0) {
    await runBtn.click();
    console.log('Clicked Run');
  } else {
    console.log('Run button not found');
  }
  process.exit();
})().catch(e => { process.exit(); });
