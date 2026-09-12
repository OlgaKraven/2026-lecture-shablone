import { readFile, access } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import {
  validateStructure,
  validateBank,
  validateTeacherPack,
  courseAssets,
  readiness,
} from '../src/engine/validation.ts'
const c = JSON.parse(await readFile('public/course.json', 'utf8'))
validateStructure(c)
const root = resolve('public')
const errors = []
for (const asset of courseAssets(c)) {
  if (/^https?:\/\//.test(asset)) continue
  const path = resolve(root, asset.replace(/^\//, ''))
  if (relative(root, path).startsWith('..')) throw Error('Путь вне public: ' + asset)
  try {
    await access(path)
  } catch {
    errors.push('Отсутствует файл: ' + asset)
  }
}
if (c.assessment && !/^https?:\/\//.test(c.assessment.url)) {
  try {
    validateBank(JSON.parse(await readFile(resolve(root, c.assessment.url), 'utf8')), c)
  } catch (e) {
    errors.push(String(e))
  }
}
const teacher = process.argv.find((x) => x.startsWith('--teacher='))?.slice(10)
if (teacher) {
  try {
    const pack = JSON.parse(await readFile(teacher, 'utf8'))
    validateTeacherPack(pack, c)
    for (const l of c.lectures)
      for (const s of l.slides)
        if (!pack.notes[s.id]?.script.trim()) errors.push('Нет сценария: ' + s.id)
  } catch (e) {
    errors.push(String(e))
  }
}
const report = {
  course: c.id,
  version: c.contentVersion,
  errors,
  warnings: readiness(c),
  teacherChecked: Boolean(teacher),
}
console.log(JSON.stringify(report, null, 2))
if (errors.length || (process.argv.includes('--strict') && report.warnings.length))
  process.exitCode = 1
