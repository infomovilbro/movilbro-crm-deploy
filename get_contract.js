const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // Try different contract list URLs
  const urlsToTry = ['/contratosmadre', '/contratos', '/contratosmadre/index', '/contratosmadre/admin'];
  let url = '';
  for (const u of urlsToTry) {
    await page.goto('https://movilbro.ispgestion.com' + u, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    if (!page.url().includes('error') && !page.url().includes('login')) {
      url = page.url();
      break;
    }
  }
  console.log('Contracts list URL:', url);
  await page.waitForTimeout(1000);
  console.log('Title:', await page.title());

  // Get the contract list
  const contracts = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr');
    const data = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length > 3) {
        const rowData = [];
        cells.forEach(c => rowData.push(c.textContent.trim()));
        data.push(rowData);
      }
    });
    return data;
  });

  console.log('\n=== CONTRATOS ENCONTRADOS (' + contracts.length + ') ===');
  contracts.slice(0, 20).forEach((c, i) => {
    console.log('  #' + (i + 1) + ': ' + c.join(' | '));
  });

  // View first contract detail (GET only)
  console.log('\nViewing contract #573...');
  await page.goto('https://movilbro.ispgestion.com/contratosmadre/573', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('Contract detail URL:', page.url());
  
  // Extract all labels and values
  const detail = await page.evaluate(() => {
    const fields = {};
    // Get all visible text
    const rows = document.querySelectorAll('.form-group, .control-group, tr, .field');
    rows.forEach(row => {
      const label = row.querySelector('label, .control-label, th:first-child')?.textContent?.trim();
      if (label) {
        let val = '';
        const input = row.querySelector('input:not([type="hidden"]):not([type="button"]), select, textarea, .field-value, span:not(.btn), td:last-child, p, .uneditable-input');
        if (input) val = input.value || input.textContent?.trim() || '';
        if (val) fields[label] = val;
      }
    });
    // Also get from any view/display layout
    document.querySelectorAll('.view td, .detail-view td, .table-bordered td').forEach(td => {
      const label = td.previousElementSibling?.textContent?.trim();
      if (label && td.textContent.trim()) {
        fields[label] = td.textContent.trim();
      }
    });
    return fields;
  });
  
  console.log('\n=== DATOS DEL CONTRATO #573 ===');
  for (const [k, v] of Object.entries(detail)) {
    console.log('  ' + k.padEnd(35) + (v || '-').substring(0, 80));
  }
  
  // Save HTML
  const html = await page.content();
  fs.writeFileSync('isp_contrato_573.html', html);
  console.log('\nHTML guardado en isp_contrato_573.html (puedo abrirlo si quieres)');

  await browser.close();
})();
