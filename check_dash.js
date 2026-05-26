const { chromium } = require('playwright');
const http = require('http');
const axios = require('axios');

async function checkLocal() {
  return new Promise((ok) => {
    http.get('http://localhost:3000/isp/dashboard', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const hasContracts = data.includes('Sin contratos') || (data.includes('cliente_nombre') && data.includes('Contratos'));
        const hasIncidencias = data.includes('Sin incidencias') || data.includes('cliente_nombre');
        console.log('Local dashboard:');
        console.log('  Status:', res.statusCode);
        console.log('  Has contracts:', !data.includes('Sin contratos') ? 'YES' : 'NO (empty)');
        console.log('  Has incidencias:', !data.includes('Sin incidencias') ? 'YES' : 'NO (empty)');
        ok();
      });
    });
  });
}

async function checkLocalWithAuth() {
  const jar = {};
  const api = axios.create({ baseURL: 'http://localhost:3000', maxRedirects: 0, validateStatus: s => s < 500 });
  api.interceptors.response.use(r => {
    const sc = r.headers['set-cookie'];
    if (sc) sc.forEach(c => { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k.trim()] = v; });
    return r;
  });
  api.interceptors.request.use(c => {
    const cookies = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (cookies) c.headers.Cookie = cookies;
    return c;
  });

  await api.get('/auth/login');
  const lr = await api.post('/auth/login', new URLSearchParams({ email: 'infomovilbro', password: 'movilbro2026' }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (lr.headers.location) await api.get(lr.headers.location);

  const resp = await api.get('/isp/dashboard', { timeout: 30000 });
  const body = resp.data || '';
  console.log('\nLocal ISP dashboard (authenticated):');
  console.log('  Status:', resp.status);
  console.log('  Contains contratos:', !body.includes('Sin contratos') ? 'YES' : 'NO (empty)');
  console.log('  Contains incidencias:', !body.includes('Sin incidencias') ? 'YES' : 'NO (empty)');
  console.log('  Stats:', body.match(/stat-value[^<]*<[^>]*>([^<]+)/g)?.slice(0, 10) || 'N/A');
}

async function checkISPGestion() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  console.log('\n=== ISP Gestion Analysis ===');
  
  // Login to ISP Gestion
  console.log('Logging into ISP Gestion...');
  await page.goto('https://movilbro.ispgestion.com/site/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => { document.getElementById('coordenadas_control_presencia').value = '37.019,-4.561'; });
  await page.fill('#LoginForm_usuario', '25345335W');
  await page.fill('#LoginForm_contrase\u00f1a', 'Ortiz88.');
  await page.click('#acceder');
  await page.waitForTimeout(3000);
  const loginUrl = page.url();
  console.log('Login result:', loginUrl.includes('login') ? 'FAILED' : 'OK (' + page.url() + ')');
  if (loginUrl.includes('login')) {
    console.log('Login failed - account may be blocked');
    await browser.close();
    return;
  }
  
  // Check contracts in ISP Gestion
  await page.goto('https://movilbro.ispgestion.com/contratosmadre', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Contracts page title:', await page.title());
  const contracts = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr');
    const data = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 7) {
        const rowData = [];
        cells.forEach(c => rowData.push(c.textContent.trim()));
        // Filter out header/filter rows
        if (rowData[0] && !isNaN(parseInt(rowData[0])) && parseInt(rowData[0]) > 0) {
          data.push({ id: rowData[0], cliente: rowData[3], tipo: rowData[4], estado: rowData[8] });
        }
      }
    });
    return data.slice(0, 5);
  });
  console.log('Recent contracts in ISP Gestion:', contracts.length > 0 ? contracts.length + ' found' : 'NONE');
  contracts.forEach(c => console.log('  #' + c.id + ' ' + c.cliente + ' - ' + (c.estado || '')));

  // Check incidences
  await page.goto('https://movilbro.ispgestion.com/incidenciasContratos/create', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('\nIncidencias page title:', await page.title());
  
  // Check tickets
  await page.goto('https://movilbro.ispgestion.com/llamadas', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Tickets page title:', await page.title());
  const tickets = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr');
    const data = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 5) {
        const firstCell = cells[0]?.textContent?.trim();
        if (firstCell && !isNaN(parseInt(firstCell)) && parseInt(firstCell) > 0) {
          data.push({ id: firstCell });
        }
      }
    });
    return data.slice(0, 5);
  });
  console.log('Tickets found:', tickets.length);

  await browser.close();
}

(async () => {
  await checkLocalWithAuth();
  await checkISPGestion();
})();
