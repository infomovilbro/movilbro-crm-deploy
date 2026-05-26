const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (s) => s({
      coords: { latitude: 37.019, longitude: -4.561, accuracy: 10 },
      timestamp: Date.now()
    });
  });
  const page = await context.newPage();

  console.log('1. Login page...');
  await page.goto('https://movilbro.ispgestion.com/site/login', { waitUntil: 'networkidle', timeout: 30000 });
  
  await page.evaluate(() => {
    document.getElementById('coordenadas_control_presencia').value = '37.019,-4.561';
  });
  await page.fill('#LoginForm_usuario', '25345979W');
  await page.fill('#LoginForm_contrase\u00f1a', '030220251259aB@');
  await page.click('#acceder');
  await page.waitForTimeout(4000);

  const url = page.url();
  console.log('2. URL after login:', url);
  
  if (url.includes('login')) {
    console.log('LOGIN FAILED');
    const html = await page.content();
    const blocked = html.match(/bloqueado hasta[^<]+/i);
    if (blocked) console.log('Blocked:', blocked[0]);
    await browser.close();
    return;
  }

  console.log('3. LOGIN OK! Navigating sections...');

  // Check billing sections
  const sections = [
    { name: 'Panel Mando', url: '/panelMando' },
    { name: 'Contratos', url: '/contratosmadre' },
    { name: 'Clientes', url: '/clientes' },
    { name: 'Facturación', url: '/facturacion' },
    { name: 'Prefacturación', url: '/prefacturacion' },
    { name: 'Facturas', url: '/facturas' },
    { name: 'Configuración', url: '/configuracion' },
    { name: 'Incidencias', url: '/incidencias' },
    { name: 'Flujos', url: '/flujos' },
    { name: 'Tareas', url: '/flujos/index_tareas_realizar' },
    { name: 'Tickets', url: '/llamadas' },
    { name: 'Campanas Marketing', url: '/campanasPublicitariasCabecera' },
    { name: 'Noticias', url: '/noticias/panel' },
    { name: 'Calendario', url: '/eventos/calendario' },
    { name: 'Listados', url: '/listados' },
  ];

  for (const s of sections) {
    try {
      await page.goto('https://movilbro.ispgestion.com' + s.url, { waitUntil: 'networkidle', timeout: 15000 });
      const title = await page.title();
      const body = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      const has418 = body.includes('418') || body.includes('No tienes permiso');
      const hasError = body.includes('Error');
      console.log(`  [${has418 ? '❌' : '✅'}] ${s.name.padEnd(20)} ${title.substring(0,50)}`);
      
      // For billing sections, get more detail
      if (s.name === 'Facturación' || s.name === 'Prefacturación' || s.name === 'Facturas' || s.name === 'Configuración') {
        if (!has418) {
          const detail = await page.evaluate(() => {
            const tables = document.querySelectorAll('table');
            const data = [];
            tables.forEach(t => {
              const rows = t.querySelectorAll('tr');
              rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length > 1) {
                  const rowData = [];
                  cells.forEach(c => rowData.push(c.textContent.trim().substring(0, 30)));
                  data.push(rowData.join(' | '));
                }
              });
            });
            return data.slice(0, 10);
          });
          console.log('    Data:', detail.length > 0 ? detail.join('\n    ') : 'No tables found');
          
          // Get form fields
          const fields = await page.evaluate(() => {
            const inputs = [];
            document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(el => {
              const label = el.closest('.form-group, .control-group, div')?.querySelector('label')?.textContent?.trim() || '';
              if (label || el.name) inputs.push({ name: el.name || '', label: label.substring(0, 40), type: el.type || 'select' });
            });
            return inputs.slice(0, 15);
          });
          if (fields.length > 0) console.log('    Fields:', fields.map(f => f.label || f.name).join(', '));
        }
      }
    } catch(e) {
      console.log(`  [⚠️] ${s.name.padEnd(20)} Error: ${e.message.substring(0, 60)}`);
    }
  }

  await browser.close();
})();
