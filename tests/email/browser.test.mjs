import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { createRequire } from 'node:module';
const runtime=process.env.EMAIL_PLAYWRIGHT_MODULES;
const a='11111111-1111-4111-8111-111111111111',c='33333333-3333-4333-8333-333333333333',d='44444444-4444-4444-8444-444444444444';
test('desktop/mobile dashboard, sender review, inert HTML, failed-send drafts and existing tabs', {skip:!runtime},async()=>{
 const require=createRequire(resolve(runtime,'package.json')), {chromium}=require('playwright');
 const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;const file=resolve(process.cwd(),'.'+(p==='/'?'/dashboard.html':p));if(!file.startsWith(process.cwd()+'/'))throw new Error();res.setHeader('content-type',extname(file)==='.js'?'application/javascript':extname(file)==='.css'?'text/css':'text/html');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;let draft=null;const submissions=[];let failTransport=false;
 try{
  browser=await chromium.launch({headless:true,...(process.env.EMAIL_CHROME_BIN?{executablePath:process.env.EMAIL_CHROME_BIN}:{})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;let data={success:true};
   if(path==='/api/forms/me')data={success:true,email:'reader@example.com'};
   if(path==='/api/forms/sites')data={success:true,sites:[]};
   if(path==='/api/forms/submissions')data={success:true,submissions:[]};
   if(path==='/api/forms/seo')data={success:true,profiles:[]};
   if(path==='/api/email/mailboxes')data={mailboxes:[{id:a,address:'one@example.com',status:'connected',permissions:{read:true,send:true,manage:true}}]};
   if(path==='/api/email/conversations')data={conversations:[{id:c,mailbox_id:a,subject:'A real conversation',snippet:'Preview',updated_at:'2026-10-20T12:00:00Z',in_inbox:true}],next:null};
   if(path==='/api/email/messages')data={conversation:{id:c,mailbox_id:a,subject:'A real conversation'},messages:[{id:d,from:['sender@example.org'],to:['one@example.com'],cc:[],date:'2026-10-20T12:00:00Z',body:'<img src="https://tracker.invalid/pixel" onerror="alert(1)">\nHello from sender',attachments:[]}],draft};
   if(path==='/api/email/drafts'){draft=req.postDataJSON();data={saved:true};}
   if(path==='/api/email/review')data={review:{from:'one@example.com',to:['sender@example.org'],cc:[],subject:'A real conversation'}};
   if(path==='/api/email/reply'){submissions.push(req.postDataJSON());if(failTransport)return route.abort();data={operation:{id:a,state:'failed',issue:'Gmail rejected reply.'}};}
   if(path==='/api/email/operations')return route.fulfill({status:404,json:{error:'Operation unavailable.'}});
   await route.fulfill({json:data});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard.html`);await page.getByRole('tab',{name:'Email',exact:true}).click();await page.getByRole('button',{name:/A real conversation/}).click();
  assert.equal(await page.locator('.email-message img').count(),0);
  const area=page.getByRole('textbox',{name:'Reply body'});await area.fill('Keep my failed reply');await page.getByRole('button',{name:'Review reply',exact:true}).click();await page.locator('.email-review').waitFor({state:'visible'});assert.match(await page.locator('.email-review').innerText(),/From: one@example.com/);
  await page.getByRole('button',{name:'Send reply',exact:true}).click();await page.getByText('Reply failed. Gmail rejected reply.').waitFor();assert.equal(await area.inputValue(),'Keep my failed reply');assert.equal(draft.body,'Keep my failed reply');assert.equal(submissions[0].review.from,'one@example.com');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/tfm-email-mobile.png',fullPage:true});const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,15)}));assert.equal(overflow.scroll<=overflow.width,true,JSON.stringify(overflow));
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/tfm-email-mobile.png',fullPage:true});
  await page.getByRole('tab',{name:'Submissions',exact:true}).click();assert.equal(await page.locator('#submissions-panel').isVisible(),true);assert.equal(await page.locator('#email-panel').isVisible(),false);
  await page.getByRole('tab',{name:'SEO Center',exact:true}).click();assert.equal(await page.locator('#seo-panel').isVisible(),true);
  await page.getByRole('tab',{name:'Email',exact:true}).click();const oldArea=await area.elementHandle();await page.getByRole('button',{name:/A real conversation/}).click();await page.waitForFunction(el=>!el.isConnected,oldArea);await page.waitForFunction(()=>!document.getElementById('email-reader').inert);assert.equal(await area.inputValue(),'Keep my failed reply');
  failTransport=true;await area.fill('Unknown submission');await page.getByRole('button',{name:'Review reply',exact:true}).click();await page.getByRole('button',{name:'Send reply',exact:true}).click();await page.getByRole('button',{name:'Check submission',exact:true}).waitFor();assert.equal(await area.isDisabled(),true);assert.equal(await area.inputValue(),'Unknown submission');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/tfm-email-desktop.png',fullPage:true});assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
