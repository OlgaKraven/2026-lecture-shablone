import QRCode from 'qrcode'
import {useMemo} from 'react'
import type {Course,Slide} from './model'
import {safeUrl} from './model'
import {read} from './storage'

function QR({url}:{url:string}){
 const matrix=useMemo(()=>QRCode.create(url,{errorCorrectionLevel:'M'}).modules,[url])
 const size=matrix.size
 const path=Array.from({length:size*size},(_,i)=>matrix.data[i]?`M${i%size+4} ${Math.floor(i/size)+4}h1v1h-1z`:'').join('')
 return <svg className="resource-qr" viewBox={`0 0 ${size+8} ${size+8}`} role="img" aria-label="QR-код ссылки" shapeRendering="crispEdges"><rect width={size+8} height={size+8} fill="white"/><path d={path} fill="black"/></svg>
}
export function Resources({course,slide,base}:{course:Course;slide:Slide;base:string}){
 if(slide.kind==='materials'){
  const url=safeUrl(read(`lecture:${base}:${course.id}:materials`,course.materialsUrl))
  return url?<div className="materials-resource"><QR url={url}/><div><strong>Ссылка на материалы</strong><a href={url} target="_blank" rel="noreferrer">{url} ↗</a><p>Отсканируйте QR-код или откройте ссылку.</p></div></div>:<p className="resource-empty">Ссылка на материалы пока не указана. Добавьте её через «Прикрепить материалы» на главной странице.</p>
 }
 const entries=slide.references??course.literature?.[slide.readingGroup||'primary']??[]
 return entries.length?<div className="reading-list">{entries.map((entry,i)=>{const url=entry.url&&safeUrl(entry.url);return <div className="reading-entry" key={i}>{url&&<QR url={url}/>}<div><p>{entry.citation}</p>{url&&<a href={url} target="_blank" rel="noreferrer">Открыть источник ↗</a>}</div></div>})}</div>:<p className="resource-empty">Список литературы для этой дисциплины пока не заполнен.</p>
}
