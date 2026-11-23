import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {demo} from '../assets/core.mjs';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const valid=()=>structuredClone(demo);
export const envelope=(d=valid())=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(d)}]}],usage:{input_tokens:123,output_tokens:456,total_tokens:579}});
export const input=()=>({problem:'책의 힘을 설명하세요.',solution:'중력과 수직항력은 작용·반작용이다.',rubric:'힘의 주체를 명시',images:[]});
export const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGP4DwYMEAoAU7oL9ZisIGcAAAAASUVORK5CYII=';
export async function browser(t,{siteRoot=root}={}){
 const require=createRequire(import.meta.url);let chromium;
 try{({chromium}=require('playwright'));}catch{({chromium}=require('/Users/kanghyeonseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
 const server=createServer(async(req,res)=>{try{const rel=decodeURIComponent(req.url.split('?')[0]);if(!rel.startsWith('/physics-misconception-lab/'))throw Error();const path=resolve(siteRoot,rel.slice('/physics-misconception-lab/'.length)+(rel.endsWith('/')?'index.html':''));if(!path.startsWith(siteRoot+'/'))throw Error();const data=await readFile(path);res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let b;try{b=await chromium.launch({headless:true});}catch(e){server.close();throw e;}
 const context=await b.newContext({acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(10000);
 t.after(async()=>{await context.close();await b.close();await new Promise(r=>server.close(r));});
 await page.route('**/assets/config.mjs',r=>r.fulfill({contentType:'text/javascript',body:"export const DEFAULT_API_KEY='';export const BACKEND_URL='';"}));
 await page.goto(`http://127.0.0.1:${server.address().port}/physics-misconception-lab/`);
 return {page,context};
}
export async function fill(page){await page.locator('#problem').fill(input().problem);await page.locator('#solution').fill(input().solution);await page.locator('#api-key').fill('test-personal-secret');}
export async function mock(page,body=envelope(),status=200){await page.route('https://api.openai.com/v1/responses',r=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}));}
export async function until(page,text){await page.waitForFunction(text=>document.querySelector('#status').textContent.includes(text),text);}
