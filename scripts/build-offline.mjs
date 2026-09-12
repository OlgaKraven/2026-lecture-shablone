import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { courseAssets } from '../src/engine/validation.ts'
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : `${dir}/${e.name}`,
      ),
    )
  ).flat()
}
const list = (await files('dist')).filter((p) => !p.endsWith('/sw.js')).sort()
const hash = createHash('sha256')
for (const p of list) hash.update(await readFile(p))
const version = hash.digest('hex').slice(0, 16)
const course = JSON.parse(await readFile('dist/course.json', 'utf8'))
const paths = [...new Set([...list.map((p) => p.slice(5)), ...courseAssets(course)])]
await writeFile(
  'dist/sw.js',
  `const VERSION=${JSON.stringify(version)};
const PATHS=${JSON.stringify(paths)};
const ROOT=self.registration.scope;
const CACHE='lecture-offline:'+ROOT+VERSION;
const READY=new URL('__offline_ready__',ROOT).href;
const urls=[...new Set(PATHS.map(p=>new URL(p.replace(/^\\/(?!\\/)/,''),ROOT).href))];
let preparing=null;
const status=async()=>{const cache=await caches.open(CACHE);const marker=await cache.match(READY);if(!marker)return {ready:false,count:0};for(const url of urls)if(!await cache.match(url))return {ready:false,count:0};return {ready:true,count:urls.length}};
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{const port=event.ports[0];if(!port)return;event.waitUntil((async()=>{
 try{if(event.data.type==='PREPARE'){
  if(!preparing)preparing=(async()=>{const cache=await caches.open(CACHE);await cache.delete(READY);for(const url of urls){const response=await fetch(url,{cache:'reload'});if(!response.ok||response.type==='opaque')throw Error('Не удалось сохранить '+url);await cache.put(url,response)}await cache.put(READY,new Response(VERSION));return status()})().finally(()=>{preparing=null});
  port.postMessage(await preparing);
 }else if(event.data.type==='STATUS')port.postMessage(await status());
 else if(event.data.type==='REMOVE'){if(preparing)throw Error('Дождитесь завершения скачивания');for(const name of await caches.keys())if(name.startsWith('lecture-offline:'+ROOT))await caches.delete(name);port.postMessage({ready:false,count:0})}
 }catch(error){port.postMessage({error:String(error)})}
})())});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(event.request.mode==='navigate'&&url.origin===new URL(ROOT).origin&&url.pathname.startsWith(new URL(ROOT).pathname)){event.respondWith((async()=>{const c=await caches.open(CACHE);if(await c.match(READY)){const r=await c.match(new URL('index.html',ROOT).href);if(r)return r}return fetch(event.request)})());return}
 if(urls.includes(url.href))event.respondWith((async()=>{const c=await caches.open(CACHE);if(await c.match(READY)){const r=await c.match(url.href,{ignoreVary:true});if(r)return r}return fetch(event.request)})());
});
`,
)
console.log(`Offline manifest: ${paths.length} files, ${version}`)
