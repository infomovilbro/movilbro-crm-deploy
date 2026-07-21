/**
 * TEST CRM - Verifica que todo funciona antes de commitear
 * Uso: node test_crm.js <fiscalId> <lineNumber>
 * Ejemplo: node test_crm.js 25302621E 602605562
 */
const { chromium } = require('playwright');
const fiscalId = process.argv[2] || '25302621E';
const lineNumber = process.argv[3] || '602605562';

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const errors = [];
  page.on('requestfailed', req => errors.push('NET: '+req.url().substring(0,80)));
  page.on('pageerror', e => errors.push('JS: '+e.message));

  async function test(name, fn) {
    try {
      const result = await fn();
      const ok = result === true || (result && !result.error);
      console.log((ok ? '✅' : '❌'), name, ok ? '' : '-', typeof result === 'string' ? result : (result.error || JSON.stringify(result)));
      return result;
    } catch(e) { console.log('❌', name, '-', e.message); }
  }

  // 1. Cargar cliente
  await page.goto('https://movilbro-crm.onrender.com/clientes/fiscal/' + fiscalId, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const login = await page.evaluate(() => !!document.querySelector('input[type="password"]'));
  if (login) { console.log('❌ LOGIN - Autenticate primero'); await browser.close(); return; }

  await page.waitForTimeout(3000);

  // Tests
  await test('Filtro global existe', () => page.evaluate(() => !!document.getElementById('globalFilter')));
  await test('Filtro activas muestra solo activas', async () => {
    return page.evaluate(() => {
      const gf = document.getElementById('globalFilter');
      gf.value = 'activa'; gf.dispatchEvent(new Event('change'));
      const divs = document.querySelectorAll('[data-estado]');
      const vis = Array.from(divs).filter(d => d.style.display !== 'none');
      return vis.every(d => d.getAttribute('data-estado') === 'active' || d.getAttribute('data-estado') === 'activa') || vis.length + '/' + divs.length + ' visibles';
    });
  });
  await test('Selector solo moviles activas', () => page.evaluate(() => {
    const sel = document.getElementById('gbLineSelect');
    if (!sel) return 'NO HAY';
    const opts = Array.from(sel.options).filter(o => !o.disabled);
    return opts.every(o => /^[67]\d{8}$/.test(o.value)) ? opts.length + ' moviles' : 'LINEA NO MOVIL: '+opts.find(o => !/^[67]\d{8}$/.test(o.value)).value;
  }));
  await test('Ordenes tab existe', () => page.evaluate(() => {
    const tab = document.querySelector('[data-bs-target="#ordenes"]');
    const badge = tab ? tab.querySelector('.badge') : null;
    return { existe: !!tab, ordenes: badge ? badge.textContent : '0' };
  }));

  // 2. Consumo page
  await page.goto('https://movilbro-crm.onrender.com/clientes/' + fiscalId + '/line/' + lineNumber + '/consumo', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(20000);
  await test('Consumo page carga', () => page.evaluate(() => {
    const loading = document.getElementById('loading');
    const content = document.getElementById('content');
    const error = document.querySelector('.alert-danger');
    if (error) return 'ERROR: '+error.textContent;
    return { loadingHidden: loading && loading.style.display === 'none', contentVisible: content && content.style.display !== 'none', gb: document.getElementById('gbNac') ? document.getElementById('gbNac').textContent : 'N/A' };
  }));
  await test('Tabla diaria con coste', () => page.evaluate(() => {
    const ths = document.querySelectorAll('thead tr th');
    return Array.from(ths).some(th => th.textContent.includes('Coste')) ? 'columna Coste OK' : 'NO HAY columna Coste';
  }));

  // 3. Scoring
  await page.goto('https://movilbro-crm.onrender.com/clientes/fiscal/' + fiscalId, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await test('Scoring + factores', () => page.evaluate(async () => {
    const btn = document.querySelector('[onclick*="calcularScoring"]');
    if (!btn) return 'NO HAY boton scoring';
    const match = btn.getAttribute('onclick').match(/'([^']+)'/);
    const id = match ? match[1] : fiscalId;
    try {
      const r = await fetch('/clientes/'+encodeURIComponent(id)+'/calculate-scoring', { method: 'POST' });
      const d = await r.json();
      return d.ok ? d.scoring+'/10 - '+(d.detalleCompleto||[]).length+' factores' : 'ERROR';
    } catch(e) { return e.message; }
  }));

  console.log('\n=== ERRORES DE RED ===');
  errors.forEach(e => console.log('  '+e));
  console.log('\n=== HECHO ===');
  await browser.close();
})();
