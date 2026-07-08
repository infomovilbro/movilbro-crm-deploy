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
const cdp=await p.context().newCDPSession(p);
const exec=async(s)=>{
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(ch==='\n'){
      await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,unmodifiedText:'\r',text:'\r'});
      await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    }else{
      await cdp.send('Input.dispatchKeyEvent',{type:'char',text:ch,unmodifiedText:ch,key:ch,windowsVirtualKeyCode:ch.charCodeAt(0)});
    }
    await new Promise(r=>setTimeout(r,3));
  }
};
await exec('git pull && PORT=5000 node server.js\n');
console.log('SENT');
await b.close();
})().catch(e=>console.log('ERR:',e.message))
