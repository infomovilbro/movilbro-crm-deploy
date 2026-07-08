const{chromium}=require('playwright');
(async()=>{
const b=await chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:15e3});
const p=(await b.contexts()[0].pages()).find(pg=>pg.url().includes('riker'));
if(!p){console.log('NO');await b.close();return}
const base='https://86573810-96d3-4ac6-8040-dc969e3db07f-00-1xuuzh2fo2bgy.riker.replit.dev';

const tests=[
  {name:'CLIENTE_fiscal',url:base+'/clientes/fiscal/B75559955'},
  {name:'ISP_INCIDENCIAS',url:base+'/isp/incidencias'},
  {name:'ISP_CDRS',url:base+'/isp/cdrs'},
  {name:'ISP_FACTURACION',url:base+'/isp/facturacion'},
];

for(const t of tests){
  await p.goto(t.url,{timeout:10e3,waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,4e3));
  const text=await p.evaluate(()=>document.body.innerText);
  const error=text.includes('Error:')||text.includes('Cannot')||text.includes('Página no encontrada');
  const data=text.includes('Líneas')||text.includes('Factura')||text.includes('Contrato')||text.includes('CDR')||text.includes('Total');
  const login=text.includes('Iniciar Sesión');
  console.log((error?'❌':data?'✅':'⚠️'),t.name,'| err:',error,'data:',data,'login:',login,'|',text.replace(/\n/g,'|').substring(0,100));
}
await b.close();
})().catch(e=>console.log('ERR:',e.message))
