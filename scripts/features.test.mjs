import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  validateStructure,
  validateBank,
  validateTeacherPack,
  courseAssets,
} from '../src/engine/validation.ts'
import { exportBackup, prepareBackup, applyBackup } from '../src/engine/backup.ts'
import { packEditorHistory, unpackEditorHistory } from '../src/engine/editor-history.ts'
const course = JSON.parse(readFileSync('public/course.json', 'utf8'))
const bank = JSON.parse(readFileSync('public/assessment.json', 'utf8'))
const memory = () => {
  const m = new Map()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  }
}
test('demo validates all visual variants and answer bank', () => {
  validateStructure(course)
  validateBank(bank, course)
  assert.equal(
    new Set(
      course.lectures.flatMap((l) => l.slides.flatMap((s) => (s.visual ? [s.visual.type] : []))),
    ).size,
    18,
  )
  assert.ok(courseAssets(course).includes(course.font))
})
test('editor history stores repeated images once and restores losslessly', () => {
  const src = 'data:image/png;base64,aGVsbG8='
  const history = {
    past: [{ image: { src, alt: 'before' } }],
    present: { image: { src, alt: 'after' } },
    future: [],
  }
  const packed = packEditorHistory(history)
  assert.deepEqual(packed.imageStore, [src])
  assert.deepEqual(unpackEditorHistory(packed), history)
  assert.deepEqual(unpackEditorHistory(history), history)
  assert.throws(
    () => unpackEditorHistory({ present: { src: 'editor-image:2' }, imageStore: [] }),
    /Повреждённое/,
  )
})

test('slide images accept embedded raster and reject active content and oversized data', () => {
  const c = structuredClone(course)
  const s = c.lectures[0].slides[0]
  s.image = { src: 'data:image/png;base64,aGVsbG8=', alt: 'Описание', caption: 'Подпись' }
  validateStructure(c)
  for (const src of [
    'javascript:alert(1)',
    'data:image/svg+xml;base64,aGVsbG8=',
    'data:image/png;base64,' + 'A'.repeat(1500000),
  ]) {
    s.image.src = src
    assert.throws(() => validateStructure(c), /image.src/)
  }
})

test('invalid nested visual reports exact lecture and slide', () => {
  const c = structuredClone(course)
  const l = c.lectures.find((l) => l.slides.some((s) => s.visual?.type === 'network'))
  const s = l.slides.find((s) => s.visual?.type === 'network')
  s.visual.edges[0].to = 'missing'
  assert.throws(() => validateStructure(c), /slides\[.*edges\[0\].*неизвестный узел/)
})
test('reject malformed visual, assets, duplicate task and invalid glossary link', () => {
  for (const change of [
    (c) => {
      c.logo = 'javascript:alert(1)'
    },
    (c) => {
      c.glossary = [{ term: 'x', definition: 'y', slideIds: ['missing'] }]
    },
    (c) => {
      c.lectures[0].slides[1].visual = { type: 'unknown', caption: 'x' }
    },
    (c) => {
      c.lectures[0].slides[1].id = c.lectures[0].id
    },
  ]) {
    const c = structuredClone(course)
    change(c)
    assert.throws(() => validateStructure(c))
  }
})
test('answer banks reject stale version, incomplete matching, wrong type and unknown keys', () => {
  for (const change of [
    (b) => {
      b.contentVersion = 'old'
    },
    (b) => {
      delete b.keys['L001-Q01-T04'].pairs.i2
    },
    (b) => {
      b.keys['L001-Q01-T01'].type = 'short'
    },
    (b) => {
      b.keys.extra = { type: 'short', accepted: ['x'], explanation: 'x' }
    },
  ]) {
    const b = structuredClone(bank)
    change(b)
    assert.throws(() => validateBank(b, course))
  }
})
test('public backup excludes private notes, drafts, and other courses', () => {
  const m = memory()
  const p = `lecture:/:${course.id}:`
  m.setItem(p + 'private:' + course.contentVersion, '{"script":"PRIVATE_QA_MARKER_9374"}')
  m.setItem(p + 'editor:' + course.contentVersion, '{"keys":{}}')
  m.setItem(p + 'theme', '"dark"')
  const b = exportBackup(course, '/', m)
  assert.deepEqual(Object.keys(b.entries), ['theme'])
  assert.ok(!JSON.stringify(b).includes('PRIVATE_QA_MARKER_9374'))
  assert.equal(prepareBackup(b, course).entries.theme, 'dark')
})
test('migration retains unchanged position and drops old scores even for unchanged task', () => {
  const m = memory()
  const l = course.lectures[0]
  m.setItem(
    `lecture:/:${course.id}:${course.contentVersion}:${l.id}:progress`,
    JSON.stringify(l.slides[0].id),
  )
  m.setItem(`lecture:/:${course.id}:${course.contentVersion}:attempts`, '{"L001-Q01-T01":{}}')
  const b = exportBackup(course, '/', m)
  const next = { ...course, contentVersion: 'next' }
  const plan = prepareBackup(b, next)
  assert.equal(plan.entries[`next:${l.id}:progress`], l.slides[0].id)
  assert.equal(plan.entries['next:attempts'], undefined)
  assert.equal(plan.skipped, 1)
})
test('backup rejects private injection and wrong course', () => {
  const b = exportBackup(course, '/', memory())
  b.entries.private = { script: 'x' }
  assert.throws(() => prepareBackup(b, course), /Недопустимое/)
  assert.throws(() => prepareBackup({ ...b, courseId: 'other' }, course))
})
test('backup rollback preserves prior values on quota failure', () => {
  const m = memory()
  const key = `lecture:/:${course.id}:theme`
  m.setItem(key, '"light"')
  const storage = {
    ...m,
    setItem: (k, v) => {
      if (k.endsWith(':materials')) throw Error('quota')
      m.setItem(k, v)
    },
  }
  assert.throws(() =>
    applyBackup({ theme: 'dark', materials: 'https://example.com' }, course, '/', storage),
  )
  assert.equal(m.getItem(key), '"light"')
})
test('teacher version is explicit, malformed notes fail', () => {
  const pack = {
    schemaVersion: 1,
    courseId: course.id,
    contentVersion: 'old',
    notes: {
      s: {
        script: 'x',
        preparation: '',
        notebook: '',
        questions: '',
        answer: '',
        estimatedSeconds: 30,
      },
    },
  }
  assert.throws(() => validateTeacherPack(pack, course))
  validateTeacherPack(pack, course, true)
  pack.notes.s.estimatedSeconds = -1
  assert.throws(() => validateTeacherPack(pack, course, true))
})
