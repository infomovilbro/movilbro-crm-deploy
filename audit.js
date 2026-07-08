const{chromium}=require('playwright');
(async()=>{
const b=await chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:15e3});
const ctx=b.contexts()[0];
const p=await ctx.newPage();
const base='https://86573810-96d3-4ac6-8040-dc969e3db07f-00-1xuuzh2fo2bgy.riker.replit.dev';

// Check login first
await p.goto(base+'/',{timeout:15e3,waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,3e3));
if(!await p.evaluate(()=>document.body.innerText.includes('Cerrar sesión'))){
  console.log('NO_LOGIN - test with logged-in browser');
}
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
  {name:'CODOPEN',url:base+'/codeopen'},
  {name:'TIENDA',url:base+'/tienda'},
  {name:'WHATASAPP',url:base+'/whatsapp'},
  {name:'SETTINGS',url:base+'/settings'},
  {name:'PORTAL',url:base+'/portal'},
];
for(const sec of sections){
  try{
    await p.goto(sec.url,{timeout:10e3,waitUntil:'domcontentloaded'});
    await new Promise(r=>setTimeout(r,2e3));
    const title=await p.title().catch(()=>'?');
    const body=await p.evaluate(()=>document.body.innerText.substring(0,200).replace(/\n/g,' '));
    const fatal=await p.evaluate(()=>document.body.innerText.includes('Error')||document.body.innerText.includes('Cannot'));
    const login=await p.evaluate(()=>document.body.innerText.includes('Iniciar Sesión'));
    console.log(sec.name,'|',title.substring(0,40),'|',fatal?'❌':'✅',login?'LOGIN':'',body.substring(0,80));
  }catch(e){
    console.log(sec.name,'| ERR:',e.message.substring(0,40));
  }
}
await b.close();
})().catch(e=>console.log('FATAL:',e.message))
