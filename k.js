const{chromium}=require('playwright');
(async()=>{
const b=await chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:15e3});
const p=(await b.contexts()[0].pages()).find(pg=>pg.url().includes('movilbro-crm-deploy-2'));
if(!p)return;
await p.evaluate(()=>{const btns=Array.from(document.querySelectorAll('button'));const s=btns.find(b=>b.textContent.trim()==='Shell');if(s)s.click()});
await new Promise(r=>setTimeout(r,2e3));
await p.evaluate(()=>{const ta=document.querySelector('textarea.xterm-helper-textarea');if(ta)ta.focus()});
await new Promise(r=>setTimeout(r,500));
await p.keyboard.press('Control+c');
await new Promise(r=>setTimeout(r,1e3));
await p.keyboard.type('git pull && PORT=5000 node server.js\n',{delay:15});
console.log('DONE');
await b.close();
})().catch(e=>console.log('ERR:',e.message))
