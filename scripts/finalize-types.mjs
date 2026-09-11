import {readdir,readFile,writeFile} from 'node:fs/promises'
for(const file of await readdir('lib'))if(file.endsWith('.d.ts')){const p='lib/'+file;const text=await readFile(p,'utf8');await writeFile(p,text.replace(/^import ['"].*\.css['"];?\r?\n/gm,''))}
