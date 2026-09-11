import type {Task} from './model'
export type Answer=string|string[]|Record<string,string>
export type Key={type:Task['type'];correct?:string[];accepted?:string[];numeric?:{value:number;tolerance:number};pairs?:Record<string,string>;explanation:string;optionExplanations?:Record<string,string>}
export type Result={status:'correct'|'incorrect'|'unanswered';score:number;explanation:string;solution:string}
export const normalize=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')
export function evaluate(task:Task,key:Key,answer:Answer):Result{
 if(key.type!==task.type)throw Error('Тип ключа не соответствует заданию')
 const empty=typeof answer==='string'?!answer.trim():Array.isArray(answer)?!answer.length:!Object.values(answer).some(x=>x.trim())
 if(empty)return {status:'unanswered',score:0,explanation:'Сначала введите ответ.',solution:''}
 let score=0;let solution=''
 if(task.type==='single'||task.type==='multiple'){
 const selected=Array.isArray(answer)?new Set(answer):new Set([String(answer)]);const correct=new Set(key.correct||[])
 score=correct.size>0&&correct.size===selected.size&&[...selected].every(x=>correct.has(x))?1:0
 solution=task.options?.filter(o=>correct.has(o.id)).map(o=>o.text).join('; ')||''
 }else if(task.type==='short'){
 const text=normalize(String(answer));score=key.accepted?.some(x=>normalize(x)===text)?1:0
 if(key.numeric){const number=Number(text.replace(',','.'));score=text!==''&&Number.isFinite(number)&&Math.abs(number-key.numeric.value)<=key.numeric.tolerance?1:0}
 solution=key.numeric?String(key.numeric.value):(key.accepted||[]).join(' / ')
 }else{
 const pairs=typeof answer==='object'&&!Array.isArray(answer)?answer:{};const items=task.items||[]
 score=items.reduce((n,item)=>n+(key.pairs?.[item.id]&&pairs[item.id]===key.pairs[item.id]?1:0),0)/items.length
 solution=items.map(item=>`${item.text} → ${task.options?.find(o=>o.id===key.pairs?.[item.id])?.text||'—'}`).join('\n')
 }
 return {status:score===1?'correct':'incorrect',score,explanation:key.explanation,solution}
}
export function shuffle<T>(list:T[],seed:number):T[]{const result=[...list];let x=seed>>>0;for(let i=result.length-1;i>0;i--){x=(Math.imul(x,1664525)+1013904223)>>>0;const j=x%(i+1);[result[i],result[j]]=[result[j],result[i]]}return result}
