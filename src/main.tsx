import { createRoot } from 'react-dom/client'
import { LectureSite, validateCourse } from './engine'
fetch(`${import.meta.env.BASE_URL}course.json`).then(r=>{if(!r.ok)throw Error('Не удалось загрузить курс');return r.json()}).then(course=>{validateCourse(course);document.title=`${course.code} · ${course.discipline}`;createRoot(document.getElementById('root')!).render(<LectureSite course={course} base={import.meta.env.BASE_URL}/>)}).catch(error=>{document.getElementById('root')!.textContent=String(error)})
