const{chromium}=require('playwright');
(async()=>{
const b=await chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:15e3});
const ctx=b.contexts()[0];
// Find a logged-in page
let p=ctx.pages().find(pg=>pg.url().includes('codeopen')||pg.url().includes('riker.replit'));
if(!p)p=ctx.pages()[0];
const base='https://86573810-96d3-4ac6-8040-dc969e3db07f-00-1xuuzh2fo2bgy.riker.replit.dev';

const sections=[
  {name:'DASHBOARD',url:base+'/'},
  {name:'CLIENTES',url:base+'/clientes'},
  {name:'ALTAS',url:base+'/altas'},
  {name:'PRODUCTOS',url:base+'/productos'},
  {name:'ORDENES',url:base+'/ordenes'},
  {name:'SUSCRIPCIONES',url:base+'/suscripciones'},
  {name:'TICKETS',url:base+'/tickets'},
  {name:'FACTURACION',url:base+'/facturacion'},
  {name:'PAGOS',url:base+'/pagos'},
  {name:'REMESAS',url:base+'/remesas'},
  {name:'CLIENTE_FISCAL',url:base+'/clientes/fiscal/B75559955'},
  {name:'ISP_DASHBOARD',url:base+'/isp'},
  {name:'ISP_FACTURACION',url:base+'/isp/facturacion'},
  {name:'ISP_CONTRATOS',url:base+'/isp/contratos'},
  {name:'ISP_CDRS',url:base+'/isp/cdrs'},
  {name:'ISP_NUBE',url:base+'/isp/nube'},
  {name:'ISP_TARIFAS',url:base+'/isp/tarifas'},
  {name:'ISP_PORTABILIDADES',url:base+'/isp/portabilidades'},
  {name:'ISP_INCIDENCIAS',url:base+'/isp/incidencias'},
  {name:'ISP_TICKETS',url:base+'/isp/tickets'},
  {name:'ISP_CAJA',url:base+'/isp/caja'},
  {name:'ISP_NODOS',url:base+'/isp/nodos'},
  {name:'ISP_NOTICIAS',url:base+'/isp/noticias'},
  {name:'ISP_EVENTOS',url:base+'/isp/eventos'},
  {name:'ISP_CAMPANAS',url:base+'/isp/campanas'},
  {name:'ISP_DOCUMENTOS',url:base+'/isp/documentos'},
  {name:'ISP_PLANTILLAS',url:base+'/isp/plantillas'},
  {name:'CODOPEN',url:base+'/codeopen'},
  {name:'TIENDA',url:base+'/tienda'},
  {name:'TIENDA_AGENDA',url:base+'/tienda/agenda'},
  {name:'TIENDA_CAJA',url:base+'/tienda/caja'},
  {name:'TIENDA_PREPAGO',url:base+'/tienda/prepago'},
  {name:'TIENDA_INVENTARIO',url:base+'/tienda/inventario'},
  {name:'TIENDA_PRESUPUESTOS',url:base+'/tienda/presupuestos'},
  {name:'TIENDA_PLANTILLA',url:base+'/tienda/plantilla'},
  {name:'TIENDA_HISTORIAL',url:base+'/tienda/historial-dia'},
  {name:'TIENDA_CIERRES',url:base+'/tienda/cierres'},
  {name:'TIENDA_DEVOLUCIONES',url:base+'/tienda/devoluciones'},
  {name:'SETTINGS',url:base+'/settings'},
  {name:'USUARIOS',url:base+'/users'},
  {name:'BACKUP',url:base+'/backup'},
  {name:'TELEGRAM',url:base+'/telegram'},
  {name:'STRIPE',url:base+'/stripe'},
  {name:'COBERTURA',url:base+'/coverage'},
  {name:'HISTORIAL',url:base+'/history'},
  {name:'LEADS',url:base+'/leads'},
  {name:'KYC',url:base+'/kyc'},
  {name:'AFTERSALES',url:base+'/aftersales'},
  {name:'PROCESOS',url:base+'/massive-processes'},
  {name:'RESOURCES',url:base+'/resources'},
  {name:'PORTAL',url:base+'/portal'},
  {name:'AGENTES',url:base+'/agents'},
];
for(const sec of sections){
  try{
    await p.goto(sec.url,{timeout:10e3,waitUntil:'domcontentloaded'});
    await new Promise(r=>setTimeout(r,1500));
    const title=await p.title().catch(()=>'?');
    const body=await p.evaluate(()=>document.body.innerText.substring(0,300).replace(/\n/g,'|'));
    const fatal=body.includes('Error')||body.includes('Cannot')||body.includes('no such column')||body.includes('not found');
    const login=body.includes('Iniciar Sesión');
    // Get buttons/tabs visible
    const tabs=await p.evaluate(()=>Array.from(document.querySelectorAll('button')).filter(b=>b.offsetParent).map(b=>b.textContent.trim()).filter(b=>b.length>0&&b.length<30).slice(0,8).join(','));
    console.log((fatal?'❌':login?'🔒':'✅'),sec.name,'|',title.substring(0,35),'|',body.substring(0,60),'|',tabs);
  }catch(e){
    console.log('❌',sec.name,'| ERR:',e.message.substring(0,50));
  }
}
await b.close();
})().catch(e=>console.log('FATAL:',e.message))
