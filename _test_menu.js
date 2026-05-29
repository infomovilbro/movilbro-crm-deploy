const http = require('http');

// Need to first login, then check an authenticated page
const options = {
  hostname: 'localhost',
  port: 3005,
  path: '/settings',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const checks = [
      { name: 'sidebarToggle button', pattern: 'id="sidebarToggle"' },
      { name: 'bottom-nav container', pattern: 'id="bottomNav"' },
      { name: 'sidebarBackdrop', pattern: 'id="sidebarBackdrop"' },
      { name: 'bottom-nav tienda', pattern: 'data-nav-group="tienda"' },
      { name: 'bottom-nav clientes', pattern: 'data-nav-group="clientes"' },
      { name: 'bottom-nav isp', pattern: 'data-nav-group="isp"' },
      { name: 'bottom-nav redes', pattern: 'data-nav-group="redes"' },
      { name: 'd-lg-none class on toggle', pattern: 'd-lg-none' },
      { name: 'sidebar show class JS', pattern: 'sidebar.classList.toggle' },
      { name: 'bottom-nav click handler', pattern: 'bottom-nav-item' },
    ];
    console.log('=== Mobile Menu HTML Checks ===');
    checks.forEach(c => {
      console.log(`${c.name}: ${data.includes(c.pattern) ? 'OK' : 'MISSING!'}`);
    });
    
    // Also check for potential issues
    if (data.includes('d-md-none')) console.log('WARNING: d-md-none still found (old code)');
    if (!data.includes('d-lg-none')) console.log('WARNING: d-lg-none not found!');
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.end();
