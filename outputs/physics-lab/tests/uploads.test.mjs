import test from 'node:test';import assert from 'node:assert/strict';
import {checkFiles,dimensions,LIMITS} from '../assets/core.mjs';
import {browser,png} from './helpers.mjs';
test('all formats, combined count/size limits, PDF and corrupt input, scaling without upsampling',()=>{
 for(const type of ['image/png','image/jpeg','image/webp'])checkFiles([],[{type,size:10}]);
 for(const f of [{type:'application/pdf',size:20},{type:'image/svg+xml',size:10},{type:'image/png',size:0},{type:'image/png',size:LIMITS.single+1}])assert.throws(()=>checkFiles([],[f]));
 const f={type:'image/png',size:1};assert.throws(()=>checkFiles(Array(8).fill(f),[f]));checkFiles(Array(7).fill(f),[f]);
 assert.throws(()=>checkFiles([{...f,size:20*1024**2}],[{...f,size:5*1024**2}]));
 assert.deepEqual(dimensions(4800,2400),[2400,1200]);assert.deepEqual(dimensions(100,200),[100,200]);assert.deepEqual(dimensions(2400,4800),[1200,2400]);assert.throws(()=>dimensions(0,1));
});
test('browser uploads role-separated images, preview enlargement/removal and readable resizing',async t=>{
 const {page}=await browser(t);
 const buf=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=3000;c.height=1500;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,3000,1500);x.fillStyle='black';x.font='100px serif';x.fillText('F = ma',100,200);return c.toDataURL().split(',')[1];});
 await page.locator('#problem-images').setInputFiles({name:'problem.png',mimeType:'image/png',buffer:Buffer.from(buf,'base64')});
 await page.waitForSelector('#problem-previews img');assert.match(await page.locator('#problem-previews').innerText(),/2400 × 1200/);
 await page.locator('#solution-images').setInputFiles({name:'solution.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForSelector('#solution-previews img');
 assert.equal(await page.locator('#problem-previews img').count(),1);assert.equal(await page.locator('#solution-previews img').count(),1);
 await page.locator('#problem-previews button').first().click();assert.equal(await page.locator('#image-dialog').isVisible(),true);await page.locator('#close-image').click();
 await page.locator('#solution-previews').getByText('이미지 삭제').click();assert.equal(await page.locator('#solution-previews img').count(),0);
 await page.locator('#problem-images').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('읽을 수 없습니다'));
 await page.locator('#problem-images').setInputFiles({name:'paper.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF')});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('PDF'));
});

test('browser decodes actual JPEG and WebP uploads',async t=>{
 const {page}=await browser(t);
 for(const type of ['image/jpeg','image/webp']){
  const base64=await page.evaluate(type=>{const c=document.createElement('canvas');c.width=80;c.height=60;c.getContext('2d').fillText('F=ma',10,20);return c.toDataURL(type).split(',')[1];},type);
  await page.locator('#solution-images').setInputFiles({name:'solution.'+type.split('/')[1],mimeType:type,buffer:Buffer.from(base64,'base64')});
  await page.waitForSelector('#solution-previews img');assert.match(await page.locator('#solution-previews img').getAttribute('src'),/^data:image\/png;base64,/);
  await page.locator('#solution-previews').getByText('이미지 삭제').click();
 }
});
