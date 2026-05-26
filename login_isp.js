const axios = require('axios');
const BASE = 'https://movilbro.ispgestion.com';

(async () => {
  const jar = {};
  const api = axios.create({ baseURL: BASE, maxRedirects: 5, validateStatus: s => s < 400 });
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

  const loginPage = await api.get('/site/login');
  const html = loginPage.data || '';

  // Extract CSRF token
  const csrfMatch = html.match(/YII_CSRF_TOKEN['"]?\s*:\s*['"]([^'"]+)/);
  const csrf = csrfMatch ? csrfMatch[1] : '';
  console.log('CSRF:', csrf);

  // Login with correct field names
  const formData = new URLSearchParams();
  formData.append('LoginForm[usuario]', '25345335W');
  formData.append('LoginForm[contraseña]', 'Ortiz88.');
  formData.append('coordenadas_control_presencia', '37.019,-4.561');
  formData.append('hash_control_presencia', 'abc123');
  formData.append('plataforma_control_presencia', 'web');
  formData.append('YII_CSRF_TOKEN', csrf);
  formData.append('yt0', '');

  console.log('Posting: LoginForm[usuario]=25345335W LoginForm[contraseña]=***');
  
  const login = await api.post('/site/login', formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Origin': 'https://movilbro.ispgestion.com',
      'Referer': 'https://movilbro.ispgestion.com/site/login'
    }
  });
  console.log('Login POST:', login.status, '->', login.headers.location || '-');
  console.log('Response size:', (login.data||'').length);

  if (login.headers.location) {
    let loc = login.headers.location;
    if (!loc.startsWith('http')) loc = BASE + loc;
    const dash = await api.get(loc);
    console.log('Dashboard status:', dash.status, 'size:', (dash.data||'').length);
    const dhtml = dash.data || '';
    
    // Find all menu links
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let m;
    const links = [];
    while ((m = linkRegex.exec(dhtml)) !== null) {
      const href = m[1];
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      if (href.startsWith('/') && !href.includes('logout') && !href.includes('javascript') && text.length > 0) {
        links.push({ href, text });
      }
    }
    console.log('\n=== ALL MENU LINKS ===');
    const seen = new Set();
    links.forEach(l => {
      const key = l.href + l.text;
      if (!seen.has(key)) {
        seen.add(key);
        console.log('  ' + l.href.padEnd(45) + l.text);
      }
    });
  } else {
    console.log('Login failed. Response sample:', (login.data||'').substring(0, 500));
  }
})();
