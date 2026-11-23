import test from 'node:test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createDiagnosisServer,MODEL,physicsRequest,validateInput} from '../server/server.mjs';
import {instructions,schema,requestDiagnosis} from '../assets/core.mjs';
import {input,envelope,png,browser,until} from './helpers.mjs';
const origin='https://school.example';
async function setup(t,options={}){
 const calls=[];
 const server=createDiagnosisServer({apiKey:'test-server-secret',allowedOrigin:origin,maxPerMinute:100,maxPerDay:1000,fetcher:async(url,opts)=>{calls.push({url,...opts});return Response.json(envelope());},...options});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(body=input(),headers={})=>fetch(base+'/api/diagnose',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 return {calls,server,base,post};
}
test('HTTP fixed contract, images, retry, no secrets in output',async t=>{
 const {post,calls}=await setup(t);
 for(const body of [input(),{...input(),images:[{role:'problem',data:'data:image/png;base64,'+png}]},{...input(),retry:{question:'새 문제'}}]){
  const r=await post(body);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  assert.ok(!(await r.text()).includes('test-server-secret'));
  const call=calls.at(-1),request=JSON.parse(call.body);
  assert.equal(call.url,'https://api.openai.com/v1/responses');assert.equal(call.headers.Authorization,'Bearer test-server-secret');
  assert.equal(MODEL,'gpt-6.1-terra');assert.equal(request.model,MODEL);assert.equal(request.instructions,physicsRequest(input()).instructions);assert.deepEqual(request.reasoning,{effort:'high'});assert.equal(request.max_output_tokens,16000);assert.deepEqual(request.text.format.schema,schema);assert.equal(request.store,false);
 }
 assert.equal(JSON.parse(calls[1].body).input[0].content[2].type,'input_image');
});
test('HTTP rejects proxy fields, malformed input and origin bypasses before upstream',async t=>{
 const {post,base,calls}=await setup(t);
 for(const body of [null,[],{},...['model','instructions','input','url','store','key','schema'].map(k=>({...input(),[k]:'override'})),{...input(),problem:4},{...input(),rubric:'a'.repeat(20001)},{...input(),retry:{question:'x',extra:1}},{...input(),images:Array(9).fill({})},{...input(),images:[{role:'problem',data:'https://private.example'}]},{...input(),images:[{role:'problem',data:'data:image/png;base64,YWJjZA=='}]}])assert.equal((await post(body)).status,400);
 for(const value of ['null','https://school.example.evil','https://school.example/','http://school.example',''])assert.equal((await post(input(),{Origin:value})).status,403);
 assert.equal((await fetch(base+'/api/diagnose',{method:'POST'})).status,403);
 assert.equal((await post(input(),{'Content-Type':'text/plain'})).status,415);
 assert.equal((await fetch(base+'/api/diagnose',{headers:{Origin:origin}})).status,405);
 assert.equal((await fetch(base+'/unknown')).status,404);
 const pre=await fetch(base+'/api/diagnose',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
 assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),origin);
 assert.equal((await fetch(base+'/healthz')).status,200);assert.equal(calls.length,0);
});
test('HTTP body, rate and concurrency limits',async t=>{
 const small=await setup(t,{bodyLimit:50});assert.equal((await small.post()).status,413);assert.equal(small.calls.length,0);
 let time=0;const rate=await setup(t,{maxPerMinute:1,maxPerDay:2,now:()=>time});
 assert.equal((await rate.post()).status,200);assert.equal((await rate.post()).status,429);
 time=60001;assert.equal((await rate.post()).status,200);time=120002;assert.equal((await rate.post()).status,429);
 time=86400001;assert.equal((await rate.post()).status,200);
 let release,started;const ready=new Promise(r=>started=r);
 const concurrent=await setup(t,{maxConcurrent:1,fetcher:async()=>{started();await new Promise(r=>release=r);return Response.json(envelope());}});
 const first=concurrent.post();await ready;assert.equal((await concurrent.post()).status,429);release();assert.equal((await first).status,200);
});
test('HTTP upstream failures, invalid output, timeout are sanitized',async t=>{
 for(const fetcher of [async()=>{throw Error('test-server-secret photo');},async()=>Response.json({status:'completed',output:[]}),async()=>new Response('x'.repeat(1024*1024+1))]){
  const {post}=await setup(t,{fetcher});const r=await post();assert.equal(r.status,502);assert.deepEqual(await r.json(),{error:'Diagnosis service unavailable'});
 }
 const {post}=await setup(t,{timeoutMs:20,fetcher:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('secret'))))});
 assert.equal((await post()).status,504);
});
test('configuration fails closed',()=>{
 for(const allowedOrigin of ['*','null','https://school.example/path','https://school.example/'])assert.throws(()=>createDiagnosisServer({apiKey:'test',allowedOrigin}));
 assert.throws(()=>createDiagnosisServer({apiKey:'',allowedOrigin:origin}));
 assert.throws(()=>validateInput({...input(),images:[{role:'other',data:'x'}]}));
});
test('frontend chooses shared for blank key, direct for personal key',async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push({url:String(url),...options});return Response.json(String(url).includes('openai.com')?envelope():{diagnosis:JSON.parse(envelope().output[0].content[0].text),usage:null});};
 await requestDiagnosis({...input(),model:'',images:[{role:'problem',data:'data:image/png;base64,'+png,name:'private-name'}]},' ',{backendUrl:origin,fetcher});
 assert.equal(calls[0].url,origin+'/api/diagnose');assert.equal(calls[0].headers.Authorization,undefined);assert.equal(JSON.parse(calls[0].body).model,undefined);assert.ok(!calls[0].body.includes('private-name'));
 await requestDiagnosis({...input(),model:'personal-model'},'test-personal',{backendUrl:origin,fetcher});
 assert.equal(calls[1].headers.Authorization,'Bearer test-personal');assert.equal(JSON.parse(calls[1].body).model,'personal-model');
});
test('browser blank key uses configured backend and retry',async t=>{
 const {page}=await browser(t);let calls=0;
 await page.route('**/assets/config.mjs',r=>r.fulfill({contentType:'text/javascript',body:"export const DEFAULT_API_KEY='';export const BACKEND_URL='https://shared.example';"}));
 await page.route('https://shared.example/api/diagnose',r=>{calls++;assert.equal(r.request().headers().authorization,undefined);const d=JSON.parse(envelope().output[0].content[0].text);const body=r.request().postDataJSON();d.findings=[];return r.fulfill({contentType:'application/json',body:JSON.stringify({diagnosis:d,usage:null})});});
 await page.route('**/physics-misconception-lab/',async r=>r.fulfill({contentType:'text/html',body:(await readFile(new URL('../index.html',import.meta.url),'utf8')).replace("connect-src 'self' https://api.openai.com","connect-src 'self' https://api.openai.com https://shared.example")}));
 await page.reload();await page.locator('#problem').fill(input().problem);await page.locator('#solution').fill(input().solution);
 await page.locator('#analyze').click();await page.locator('#retry-answer').waitFor({state:'visible'});
 await page.locator('#retry-answer').fill('새 답안');await page.locator('#recheck').click();
 await page.waitForFunction(()=>document.querySelector('#recheck').disabled===false);
 assert.equal(calls,2);
});
test('chunked body limit and upload timeout enforced over HTTP',async t=>{
 const {request}=await import('node:http');
 const {base}=await setup(t,{bodyLimit:100,requestTimeoutMs:50});
 async function raw(write){
  return new Promise((resolve,reject)=>{
   const req=request(base+'/api/diagnose',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Transfer-Encoding':'chunked'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
   req.on('error',reject);write(req);
  });
 }
 assert.equal(await raw(req=>{req.write('x'.repeat(101));req.end();}),413);
 assert.equal(await raw(req=>{req.write('{');}),504);
});
test('client disconnect aborts upstream and releases concurrency',async t=>{
 const {request}=await import('node:http');let start,abort;
 const started=new Promise(r=>start=r),aborted=new Promise(r=>abort=r);
 const {base}=await setup(t,{maxConcurrent:1,fetcher:(_url,{signal})=>{start();return new Promise((_,reject)=>signal.addEventListener('abort',()=>{abort();reject(Error('aborted'));}));}});
 const req=request(base+'/api/diagnose',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'}});
 req.on('error',()=>{});req.end(JSON.stringify(input()));await started;req.destroy();await aborted;
});
test('configured build pins CSP origin and excludes backend/environment files',async t=>{
 const {mkdtemp,cp,writeFile,readdir,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'physics-build-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const root=new URL('../',import.meta.url);
 for(const name of ['scripts.mjs','index.html','assets','bgg-gini'])await cp(new URL(name,root),join(dir,name),{recursive:true});
 await writeFile(join(dir,'assets/config.mjs'),"export const DEFAULT_API_KEY='';export const BACKEND_URL='https://shared.example';");
 const run=spawnSync(process.execPath,[join(dir,'scripts.mjs'),'build'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const html=await readFile(join(dir,'dist/index.html'),'utf8');
 assert.ok(html.includes("connect-src 'self' https://api.openai.com https://shared.example;"));
 assert.deepEqual((await readdir(join(dir,'dist'))).sort(),['assets','bgg-gini','index.html']);
 const config=await readFile(new URL('../assets/config.mjs',import.meta.url),'utf8');assert.match(config,/DEFAULT_API_KEY = ''/);
 const server=await readFile(new URL('../server/server.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(server,/console\.(log|debug|info)|writeFile|appendFile|createWriteStream/);
 assert.match(await readFile(new URL('../../../render.yaml',import.meta.url),'utf8'),/plan: free/);
 assert.match(await readFile(new URL('../.env.example',import.meta.url),'utf8'),/^OPENAI_API_KEY=\n/);
});

test('shared credential and permission errors are distinct and sanitized',async t=>{
 for(const [code,message] of [[401,'Shared API credential rejected'],[403,'Shared model access denied']]){
 const {post}=await setup(t,{fetcher:async()=>Response.json({error:'test-server-secret'},{status:code})});
 const response=await post();assert.equal(response.status,code);assert.deepEqual(await response.json(),{error:message});
 }
});
