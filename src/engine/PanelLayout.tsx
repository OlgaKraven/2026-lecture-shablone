import {useEffect,useRef,useState} from 'react'
import type {CSSProperties,PointerEvent} from 'react'
import {read,save} from './storage'

const defaults=[40,40,20]
export function usePanelLayout(key:string){
 const [sizes,setSizes]=useState<number[]>(()=>{const v=read<number[]>(key,defaults);return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)&&v[0]>=20&&v[1]>=24&&v[2]>=14&&Math.abs(v.reduce((a,b)=>a+b,0)-100)<.1?v:defaults})
 const grid=useRef<HTMLDivElement>(null)
 const drag=useRef<{index:number;x:number;start:number[];width:number}|null>(null)
 useEffect(()=>{save(key,sizes)},[key,sizes])
 const resize=(index:number,delta:number,start=sizes)=>{
  const minimum=[20,24,14];const change=Math.max(minimum[index]-start[index],Math.min(start[index+1]-minimum[index+1],delta))
  const next=[...start];next[index]+=change;next[index+1]-=change;setSizes(next)
 }
 const separator=(index:number)=><div className={`panel-divider divider-${index}`} role="separator" aria-orientation="vertical" aria-label={index===0?'Ширина слайда и заметок':'Ширина заметок и содержания'} aria-valuemin={[20,24][index]} aria-valuemax={sizes[index]+sizes[index+1]-[24,14][index]} aria-valuenow={Math.round(sizes[index])} tabIndex={0}
  title="Перетащите границу или используйте стрелки влево и вправо"
  onPointerDown={e=>{if(!grid.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={index,x:e.clientX,start:[...sizes],width:(grid.current.getBoundingClientRect().width-(window.innerWidth<=1100?12:24))*100/(window.innerWidth<=1100?sizes[0]+sizes[1]:100)}}}
  onPointerMove={(e:PointerEvent<HTMLDivElement>)=>{const d=drag.current;if(d&&d.index===index)resize(index,(e.clientX-d.x)/d.width*100,d.start)}}
  onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
  onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}}
  onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();resize(index,e.key==='ArrowRight'?2:-2)}}}/>
 return {grid,separator,reset:()=>setSizes([...defaults]),style:{'--preview-width':`${sizes[0]}fr`,'--notes-width':`${sizes[1]}fr`,'--outline-width':`${sizes[2]}fr`} as CSSProperties}
}
