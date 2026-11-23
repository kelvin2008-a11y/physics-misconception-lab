import {validateBgg,bggRequest,parseBgg} from './bgg.mjs';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {buildRequest,parseResponse,validateEvidence} from '../assets/core.mjs';

export const MODEL='gpt-6.1-terra';
export const BODY_LIMIT=36*1024*1024;
const fail=status=>Object.assign(new Error('Request rejected'),{status});
const object=(v,keys)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).every(k=>keys.includes(k));
export function validateInput(v){
 if(!object(v,['problem','solution','rubric','images','retry']))throw fail(400);
 for(const k of ['problem','solution','rubric'])if(v[k]!==undefined && (typeof v[k]!=='string'||v[k].length>20000))throw fail(400);
 if(v.retry!==undefined && v.retry!==null && (!object(v.retry,['question'])||typeof v.retry.question!=='string'||v.retry.question.length>20000))throw fail(400);
 if(v.images!==undefined && (!Array.isArray(v.images)||v.images.length>8))throw fail(400);
 for(const im of v.images||[]){
  if(!object(im,['role','data'])||!['problem','solution'].includes(im.role)||typeof im.data!=='string'||im.data.length>14*1024*1024)throw fail(400);
  const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(im.data);
  if(!m||m[2].length%4)throw fail(400);
  const bytes=Buffer.from(m[2],'base64');
  if(bytes.toString('base64')!==m[2]||!(m[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'))throw fail(400);
 }
 try{buildRequest({...v,model:MODEL});}catch{throw fail(400);}
 return v;
}
async function readBody(req,limit){
 const chunks=[];let size=0;
 for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>limit)throw fail(413);chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(400);}
}
async function upstreamJSON(response){
 if(!response.ok){await response.body?.cancel();throw fail([401,403,429].includes(response.status)?response.status:502);}
 const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw fail(502);chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createDiagnosisServer({apiKey=process.env.OPENAI_API_KEY,allowedOrigin=process.env.ALLOWED_ORIGIN,fetcher=fetch,bodyLimit=BODY_LIMIT,timeoutMs=45000,requestTimeoutMs=15000,maxConcurrent=2,maxPerMinute=6,maxPerDay=100,now=Date.now}={}){
 if(!apiKey?.trim())throw Error('OPENAI_API_KEY is required');
 let origin;try{origin=new URL(allowedOrigin);}catch{throw Error('ALLOWED_ORIGIN must be an exact origin');}
 if(!['http:','https:'].includes(origin.protocol)||origin.origin!==allowedOrigin)throw Error('ALLOWED_ORIGIN must be an exact origin');
 let active=0,minute=[],day=[];
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,data)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}};
  if(req.url==='/healthz'&&req.method==='GET'){send(200,{ok:true});return;}
  const isBgg=req.url==='/api/bgg-recommend';
  if(req.url!=='/api/diagnose'&&!isBgg){send(404,{error:'Not found'});return;}
  if(req.headers.origin!==allowedOrigin){send(403,{error:'Origin rejected'});return;}
  res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Vary','Origin');
  if(req.method==='OPTIONS'){
   if(req.headers['access-control-request-method']!=='POST'||(req.headers['access-control-request-headers']||'').split(',').some(h=>h.trim()&&h.trim().toLowerCase()!=='content-type')){send(403,{error:'Preflight rejected'});return;}
   res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);res.end();return;
  }
  if(req.method!=='POST'){send(405,{error:'Method rejected'});return;}
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||req.headers['content-encoding']){send(415,{error:'JSON required'});return;}
  const routeLimit=isBgg?Math.min(bodyLimit,1024*1024):bodyLimit;
  if(Number(req.headers['content-length'])>routeLimit){send(413,{error:'Input too large'});return;}
  const time=now();minute=minute.filter(t=>time-t<60000);day=day.filter(t=>time-t<86400000);
  if(active>=maxConcurrent||minute.length>=maxPerMinute||day.length>=maxPerDay){res.setHeader('Retry-After','60');send(429,{error:'Shared request limit reached'});return;}
  minute.push(time);day.push(time);active++;
  const controller=new AbortController();
  const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnected);
  const timer=setTimeout(()=>{controller.abort();send(504,{error:'Request timed out'});req.destroy();},requestTimeoutMs);
  let upstreamTimer;
  try{
   const input=(isBgg?validateBgg:validateInput)(await readBody(req,routeLimit));clearTimeout(timer);
   if(controller.signal.aborted)throw fail(504);
   upstreamTimer=setTimeout(()=>controller.abort(),timeoutMs);
   const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey.trim()},body:JSON.stringify(isBgg?bggRequest(input,MODEL):buildRequest({...input,model:MODEL})),signal:controller.signal});
   const raw=await upstreamJSON(response);
   const result=isBgg?parseBgg(raw,input):parseResponse(raw);if(!isBgg)validateEvidence(result.diagnosis,input);
   send(200,result);
  }catch(e){const status=controller.signal.aborted?504:([400,401,403,413,429,502].includes(e.status)?e.status:502);send(status,{error:({400:isBgg?'Invalid recommendation input':'Invalid diagnosis input',401:'Shared API credential rejected',403:'Shared model access denied',413:'Input too large',429:'Shared request limit reached',502:isBgg?'Recommendation service unavailable':'Diagnosis service unavailable',504:'Request timed out'})[status]});}
  finally{clearTimeout(timer);clearTimeout(upstreamTimer);active--;res.off('close',disconnected);}
 });
 server.requestTimeout=requestTimeoutMs;server.headersTimeout=Math.min(requestTimeoutMs,10000);server.timeout=requestTimeoutMs+timeoutMs;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=20;
 return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 try{createDiagnosisServer().listen(Number(process.env.PORT)||3000,'0.0.0.0');}catch{console.error('Backend configuration invalid; check environment settings.');process.exitCode=1;}
}
