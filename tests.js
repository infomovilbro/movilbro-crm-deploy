const axios = require('axios');
const BASE = 'http://localhost:3005';
const jar = {};
const api = axios.create({baseURL:BASE, maxRedirects:0, validateStatus: s=>s<500});
api.interceptors.response.use(r=>{const sc=r.headers['set-cookie']; if(sc) sc.forEach(c=>{const[kv]=c.split(';');const[k,v]=kv.split('=');jar[k.trim()]=v;});return r;});
api.interceptors.request.use(c=>{const cookies=Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');if(cookies)c.headers.Cookie=cookies;return c;});

(async()=>{
  await api.get('/auth/login');
  const lr = await api.post('/auth/login', new URLSearchParams({email:'infomovilbro',password:'movilbro2026'}), {headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  if(lr.headers.location) await api.get(lr.headers.location);
  const chk = await api.get('/isp/dashboard');
  console.log('Login:', chk.status===200?'OK':'FAIL ('+chk.status+')');

  const routes = ['/isp/dashboard','/isp/panel-mando','/isp/workflows','/isp/workflows/create','/isp/workflows/1','/isp/contratos','/isp/contratos/create','/isp/contratos/1','/isp/portabilidades','/isp/portabilidades/create','/isp/tarifas','/isp/descuentos','/isp/permanencias','/isp/documentos','/isp/plantillas','/isp/campanas','/isp/noticias','/isp/eventos','/isp/nodos','/isp/equipos','/isp/articulos','/isp/caja','/isp/caja/arqueos','/isp/incidencias','/isp/listados','/isp/tareas','/isp/clientes','/isp/tickets','/isp/tickets/create'];
  let ok=0, fail=0, fails=[];
  for(const r of routes){
    try{
      const resp = await api.get(r,{timeout:6000});
      const d = (resp.data||'').toString();
      const hasErr = resp.status!==200 || d.includes('SyntaxError') || d.includes('ReferenceError') || d.includes('not defined');
      if(hasErr){fail++;fails.push(r+' ['+resp.status+']');process.stdout.write('X');}
      else{ok++;process.stdout.write('.');}
    }catch(e){fail++;fails.push(r+' ERROR');process.stdout.write('F');}
  }
  console.log('\nOK:'+ok+' FAIL:'+fail);
  fails.forEach(f=>console.log('  FAIL: '+f));
  process.exit(fail>0?1:0);
})();
