import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {mkdir,copyFile,cp,readdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url));
if(process.argv[2]==='test'){
 const files=(await readdir(join(root,'tests'))).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>join(root,'tests',x));
 const run=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});process.exit(run.status??1);
}else if(process.argv[2]==='build'){
 const out=join(root,'dist');await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
 await copyFile(join(root,'index.html'),join(out,'index.html'));await cp(join(root,'assets'),join(out,'assets'),{recursive:true});
 console.log('Built static app assets only: outputs/physics-lab/dist');
}else{console.error('Usage: node scripts.mjs test|build');process.exit(1);}
