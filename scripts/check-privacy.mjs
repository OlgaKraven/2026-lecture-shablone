import {readFile,readdir} from 'node:fs/promises'
async function files(dir){const entries=await readdir(dir,{withFileTypes:true});return(await Promise.all(entries.map(e=>e.isDirectory()?files(dir+'/'+e.name):dir+'/'+e.name))).flat()}
const all=await files('dist');const textFiles=all.filter(f=>/\.(json|js|html|css|txt|map)$/.test(f));const text=(await Promise.all(textFiles.map(f=>readFile(f,'utf8')))).join('\n');
for(const path of all)if(/\/private\/|teacher-notes|\.map$/.test(path))throw Error('Приватный или служебный файл в публикации: '+path)
if(text.includes('PRIVATE_QA_MARKER_9374'))throw Error('Тестовый приватный маркер попал в сборку')
try{const pack=JSON.parse(await readFile('private/demo-teacher-notes.json','utf8'));for(const note of Object.values(pack.notes))if(note.script.length>80&&text.includes(note.script.slice(0,100)))throw Error('Полный сценарий попал в сборку')}catch(e){if(e.code!=='ENOENT')throw e}
console.log('PASS: no teacher notes, private files or sourcemaps in dist. Autonomous educational assessment keys are intentionally public.')
