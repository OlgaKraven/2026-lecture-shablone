import {readFile} from 'node:fs/promises'
import {validateCourse} from '../src/engine/model.ts'
const c=JSON.parse(await readFile('public/course.json','utf8'));validateCourse(c)
const keys=c.assessment?JSON.parse(await readFile('public/'+c.assessment.url,'utf8')):null
const ids=new Set();let slides=0;let tasks=0;let visuals=0
const unique=id=>{if(ids.has(id))throw Error('Повтор ID: '+id);ids.add(id)}
for(const l of c.lectures){unique(l.id);if(!c.demo&&l.slides.length<80)throw Error(l.id+': меньше 80 слайдов');for(const s of l.slides){slides++;unique(s.id)
 if(s.visual||s.steps||s.rows)visuals++
 if(s.visual){const v=s.visual;if(!v.caption)throw Error('Нет вывода визуализации');if(v.type==='bars'&&(!(v.max>0)||v.items.some(x=>x.value<0||x.value>v.max)||v.items.length>3))throw Error('Неверная шкала');if((v.type==='process'||v.type==='timeline')&&(v.items.length<2||v.items.length>4))throw Error('Схема поддерживает 2–4 шага');if(v.type==='tree'&&(v.branches.length>4||v.branches.some(b=>b.items.length>2)))throw Error('Дерево поддерживает до четырёх ветвей по два листа');if(v.type==='network'&&(v.nodes.length>4||v.edges.some(e=>!v.nodes.some(n=>n.id===e.from)||!v.nodes.some(n=>n.id===e.to))))throw Error('Некорректная схема связей')}
 if(s.task){tasks++;const t=s.task;unique(t.id);const k=keys?.keys[t.id];if(c.assessment&&!k)throw Error('Нет ключа '+t.id);if(t.type==='single'&&t.options?.length!==4)throw Error('single: нужно 4 варианта');if(t.type==='multiple'&&(t.options?.length!==5||!t.choose||t.choose<2))throw Error('multiple: нужно 5 вариантов и число ответов');if(t.type==='matching'&&(t.items?.length!==4||t.options?.length!==4))throw Error('matching: нужны 4 пары');const optionIds=new Set(t.options?.map(o=>o.id));if(optionIds.size!==(t.options?.length||0))throw Error('Повтор ID варианта');if(k?.correct?.some(id=>!optionIds.has(id)))throw Error('Ключ с неизвестным вариантом');if(t.type==='multiple'&&k&&k.correct.length!==t.choose)throw Error('Число правильных ответов не совпадает');if(k?.pairs&&Object.values(k.pairs).some(id=>!optionIds.has(id)))throw Error('Неизвестная пара')}
}}
console.log(JSON.stringify({course:c.id,demo:c.demo,lectures:c.lectures.length,slides,tasks,visuals,status:'passed'},null,2))

