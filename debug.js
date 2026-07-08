const{chromium}=require('playwright');
(async()=>{
const b=await chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:15e3});
const ctx=b.contexts()[0];
const p=ctx.pages().find(pg=>pg.url().includes('codeopen')||pg.url().includes('riker.replit'));
if(!p){console.log('NO_PAGE');await b.close();return}

const base='https://86573810-96d3-4ac6-8040-dc969e3db07f-00-1xuuzh2fo2bgy.riker.replit.dev';

// 1. Test health endpoint
await p.goto(base+'/health',{timeout:10e3,waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,1e3));
const health=await p.evaluate(()=>document.body.innerText);
console.log('HEALTH:',health.substring(0,200));

// 2. Check client detail API
await p.goto(base+'/clientes/fiscal/B75559955',{timeout:15e3,waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,5e3));
const clientBody=await p.evaluate(()=>{
  const text=document.body.innerText;
  const tabs=Array.from(document.querySelectorAll('button')).filter(b=>b.offsetParent).map(b=>b.textContent.trim()).filter(b=>b.length>0&&b.length<30);
  return {tabs:tabs.slice(0,15),hasError:text.includes('Error'),hasData:text.includes('Líneas')||text.includes('Facturas'),textPreview:text.substring(0,400)};
});
console.log('CLIENTE:',JSON.stringify(clientBody,null,2));

// 3. Check CDRs page
await p.goto(base+'/isp/cdrs',{timeout:10e3,waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,4e3));
const cdrsBody=await p.evaluate(()=>{
  const text=document.body.innerText;
  return {hasError:text.includes('Error'),hasData:text.includes('CDR')||text.includes('Importe'),preview:text.substring(0,500)};
});
console.log('CDRS:',JSON.stringify(cdrsBody,null,2));

// 4. Check ISP API error
await p.goto(base+'/isp/incidencias',{timeout:10e3,waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,4e3));
const incBody=await p.evaluate(()=>document.body.innerText.substring(0,500));
console.log('INCIDENCIAS:',incBody);

await b.close();
})().catch(e=>console.log('ERR:',e.message))
