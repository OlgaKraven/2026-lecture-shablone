import type {Course,Lecture,Profile,Slide} from './model'
import {assetUrl} from './model'
import {Infographic} from './Infographic'
import {TaskView} from './Assessment'
export function SlideView({course,lecture,slide,profile,base,number,interactive=false}:{course:Course;lecture:Lecture;slide:Slide;profile:Profile;base:string;number:number;interactive?:boolean}){
 return <article className={`slide-frame kind-${slide.kind} ${slide.visual||slide.steps||slide.rows?'has-visual':''}`} data-slide-id={slide.id}>
 <img className="side-ornament" src={assetUrl(course.ornament,base)} alt=""/>
 <header className="slide-header"><div className="slide-brand"><img src={assetUrl(course.logo,base)} alt="Логотип"/><span>{course.code} · {lecture.semester}-й семестр</span></div><span className="slide-number">{String(number).padStart(2,'0')}</span></header>
 <div className="slide-content"><div className="slide-copy"><p className="slide-kicker">{slide.kicker}</p><h2>{slide.title}</h2>
 {slide.body&&<p className="slide-body-copy">{slide.body}</p>}
 {slide.bullets&&<ul>{slide.bullets.map(x=><li key={x}>{x}</li>)}</ul>}
 {slide.visual&&<Infographic visual={slide.visual} base={base}/>}
 {slide.steps&&!slide.visual&&<Infographic visual={{type:'process',items:slide.steps,caption:'Порядок чтения: слева направо, от первого шага к последнему.'}}/>}
 {slide.rows&&<table className="comparison-table"><thead><tr>{slide.columns?.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{slide.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table>}
 {slide.notebook&&<aside className="write-note"><span>Запишите</span><strong>{slide.notebook}</strong></aside>}
 {slide.task&&interactive&&<TaskView task={slide.task}/>}
 {slide.task&&!interactive&&<div className="public-task"><p>{slide.task.prompt}</p>{slide.task.type==='matching'?<div className="matching-public"><ol>{slide.task.items?.map(x=><li key={x.id}>{x.text}</li>)}</ol><ol type="A">{slide.task.options?.map(x=><li key={x.id}>{x.text}</li>)}</ol></div>:slide.task.options?<ol className="public-options">{slide.task.options.map((x,i)=><li key={x.id}><b>{String.fromCharCode(1040+i)}</b><span>{x.text}</span></li>)}</ol>:<div className="answer-line">Краткий ответ: __________________________________</div>}</div>}
 {slide.kind==='title'&&<div className="title-profile"><strong>{profile.fullName||'Преподаватель'}</strong><span>{profile.position}</span><span>{profile.department}</span></div>}
 </div>{slide.kind==='title'&&<img className="title-mascot" src={assetUrl(course.mascot,base)} alt={course.mascotAlt}/>}</div>
 <footer className="slide-footer"><span>{slide.source||lecture.question}</span><span>{course.demo?'Демонстрация шаблона':course.discipline}</span></footer>
 </article>
}


