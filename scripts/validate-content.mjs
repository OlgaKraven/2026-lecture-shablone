import { readFile } from 'node:fs/promises'
import { validateStructure, validateBank } from '../src/engine/validation.ts'
const c = JSON.parse(await readFile('public/course.json', 'utf8'))
validateStructure(c)
if (c.assessment && !/^https?:/.test(c.assessment.url))
  validateBank(JSON.parse(await readFile('public/' + c.assessment.url, 'utf8')), c)
if (!c.demo)
  for (const l of c.lectures) if (l.slides.length < 80) throw Error(l.id + ': меньше 80 слайдов')
const slides = c.lectures.flatMap((l) => l.slides)
console.log(
  JSON.stringify(
    {
      course: c.id,
      demo: c.demo,
      lectures: c.lectures.length,
      slides: slides.length,
      tasks: slides.filter((s) => s.task).length,
      visuals: slides.filter((s) => s.visual || s.steps || s.rows).length,
      status: 'passed',
    },
    null,
    2,
  ),
)
