const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // Go to panelMando (already logged in)
  await page.goto('https://movilbro.ispgestion.com/panelMando', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Logged in. URL:', page.url());

  // Get all main menu items
  const menuItems = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      const text = a.textContent.trim();
      if (href && href.startsWith('/') && !href.includes('logout') && !href.includes('javascript') && text.length > 1 && text.length < 80) {
        items.push({ href, text });
      }
    });
    // Remove duplicates
    const seen = new Set();
    return items.filter(i => { const k = i.href; if (seen.has(k)) return false; seen.add(k); return true; });
  });

  console.log('\n=== MENU PRINCIPAL ===');
  menuItems.forEach(m => console.log('  ' + m.href.padEnd(55) + m.text));

  // Visit ONLY the sections from the menu (GET only, no actions)
  const sectionsToVisit = menuItems.map(m => m.href);
  
  for (const section of sectionsToVisit) {
    try {
      const url = 'https://movilbro.ispgestion.com' + section;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);
      
      const title = await page.title();
      const bodyText = await page.evaluate(() => {
        // Get main content area text (not nav, not sidebar)
        const main = document.querySelector('.content, #content, main, .page-content, .panel-body, .grid-view') || document.body;
        return (main ? main.innerText : document.body.innerText).substring(0, 1000);
      });
      
      const isError = bodyText.includes('418') || bodyText.includes('No tienes permiso') || bodyText.includes('Error 418');
      
      if (!isError) {
        console.log('\n✅ ' + section);
        console.log('   Título: ' + title);
        console.log('   Contenido (primeros 300):');
        console.log('   ' + bodyText.substring(0, 300).replace(/\n/g, '\n   '));
        
        // Extract table headers if present
        const tableHeaders = await page.evaluate(() => {
          const headers = [];
          document.querySelectorAll('th, .grid-view .header, .sort-link').forEach(th => {
            const t = th.textContent.trim();
            if (t && t.length < 50) headers.push(t);
          });
          return headers;
        });
        if (tableHeaders.length > 0) {
          console.log('   Columnas tabla: ' + tableHeaders.join(', '));
        }
        
        // Extract form fields
        const formFields = await page.evaluate(() => {
          const fields = [];
          document.querySelectorAll('input[type!="hidden"], select, textarea').forEach(el => {
            const id = el.id || '';
            const name = el.getAttribute('name') || '';
            const label = el.closest('.form-group, .control-group, div')?.querySelector('label')?.textContent?.trim() || '';
            if (name || label) fields.push({ id, name, label: label.substring(0, 40) });
          });
          return fields;
        });
        if (formFields.length > 0) {
          console.log('   Campos formulario:');
          formFields.forEach(f => console.log('     - ' + (f.label || f.name)));
        }

        // Get action buttons
        const buttons = await page.evaluate(() => {
          const btns = [];
          document.querySelectorAll('button, a.btn, input[type="submit"], input[type="button"]').forEach(b => {
            const t = (b.textContent || b.getAttribute('value') || '').trim();
            if (t && t.length < 40) btns.push(t);
          });
          return [...new Set(btns)];
        });
        if (buttons.length > 0) console.log('   Botones: ' + buttons.join(', '));
        
      } else {
        console.log('\n❌ ' + section + ' - Error 418 (sin acceso)');
      }
    } catch(e) {
      console.log('\n⚠️ ' + section + ' - Error: ' + e.message.substring(0, 60));
    }
  }

  console.log('\n=== ANÁLISIS COMPLETADO ===');
  await browser.close();
})();
