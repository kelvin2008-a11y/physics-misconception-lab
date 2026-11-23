import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {mkdir,readFile,writeFile,cp,readdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url));
if(process.argv[2]==='test'){
 const files=(await readdir(join(root,'tests'))).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>join(root,'tests',x));
 const run=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});process.exit(run.status??1);
}else if(process.argv[2]==='build'){
 const out=join(root,'dist');await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
 const {BACKEND_URL}=await import('./assets/config.mjs');
 let html=await readFile(join(root,'index.html'),'utf8');
 if(BACKEND_URL){const url=new URL(BACKEND_URL);if(!['http:','https:'].includes(url.protocol)||url.origin!==BACKEND_URL)throw Error('BACKEND_URL must be an exact origin');html=html.replace("connect-src 'self' https://api.openai.com","connect-src 'self' https://api.openai.com "+url.origin);}
 await writeFile(join(out,'index.html'),html);await cp(join(root,'assets'),join(out,'assets'),{recursive:true});
 await cp(join(root,'bgg-gini'),join(out,'bgg-gini'),{recursive:true});
 console.log('Built static app assets only: outputs/physics-lab/dist');
}else{console.error('Usage: node scripts.mjs test|build');process.exit(1);}
