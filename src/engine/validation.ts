import type { Course, TeacherPack } from './model'
import type { Key } from './scoring'

type Obj = Record<string, any>
const fail = (path: string, message: string): never => {
  throw Error(`${path}: ${message}`)
}
const obj = (v: unknown, p: string): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : fail(p, 'ожидается объект')
const str = (v: unknown, p: string, empty = false) =>
  typeof v === 'string' && (empty || v.trim()) ? (v as string) : fail(p, 'ожидается текст')
const num = (v: unknown, p: string, min = 0) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min ? v : fail(p, `ожидается число ≥ ${min}`)
const arr = (v: unknown, p: string, min = 0): any[] =>
  Array.isArray(v) && v.length >= min ? v : fail(p, `ожидается список, минимум ${min}`)
const texts = (v: unknown, p: string, min = 0) =>
  arr(v, p, min).forEach((x, i) => str(x, `${p}[${i}]`))
const fields = (v: Obj, p: string, keys: string[]) => keys.forEach((k) => str(v[k], `${p}.${k}`))
const choice = (v: unknown, p: string, values: unknown[]) =>
  values.includes(v) || fail(p, `допустимо: ${values.join(', ')}`)
export function validAsset(v: unknown, p: string) {
  const s = str(v, p)
  if (/^https?:\/\//i.test(s)) {
    try {
      new URL(s)
      return
    } catch {
      fail(p, 'неверный URL')
    }
  }
  if (/^[a-z][a-z\d+.-]*:|^\/\/|\\|(^|\/)\.\.(\/|$)|[?#]/i.test(s))
    fail(p, 'нужен локальный путь без .. или HTTP(S) URL')
}
function reading(v: unknown, p: string) {
  arr(v, p).forEach((x, i) => {
    const r = obj(x, `${p}[${i}]`)
    str(r.citation, `${p}[${i}].citation`)
    if (r.url) http(r.url, `${p}[${i}].url`)
  })
}
function http(v: unknown, p: string) {
  const s = str(v, p)
  try {
    if (!['https:', 'http:'].includes(new URL(s).protocol)) fail(p, 'нужен HTTP(S) URL')
  } catch {
    fail(p, 'нужен HTTP(S) URL')
  }
}
function unique(v: any[], p: string) {
  if (new Set(v).size !== v.length) fail(p, 'повтор идентификатора')
}
function options(v: unknown, p: string) {
  const a = arr(v, p, 1)
  a.forEach((x, i) => fields(obj(x, p), `${p}[${i}]`, ['id', 'text']))
  unique(
    a.map((x) => x.id),
    p,
  )
  return a
}
function visual(value: unknown, p: string) {
  const v = obj(value, p)
  str(v.caption, p + '.caption')
  const limits: Record<string, Record<string, number>> = {
    cycle: { items: 8 },
    comparison: { columns: 6, rows: 8 },
    matrix: { columns: 6, rows: 8 },
    conceptMap: { items: 8 },
    states: { states: 8 },
    callouts: { items: 6 },
    codeParts: { parts: 8 },
    network: { edges: 12 },
  }
  for (const [key, max] of Object.entries(limits[v.type] || {}))
    if (Array.isArray(v[key]) && v[key].length > max)
      fail(p + '.' + key, 'не более ' + max + ' элементов')
  if (v.type === 'network' && v.edges?.some((e: Obj) => e.from === e.to))
    fail(p + '.edges', 'петлю опишите отдельным циклом')
  const itemText = () =>
    arr(v.items, p + '.items', 1).forEach((x, i) =>
      fields(obj(x, p), `${p}.items[${i}]`, ['title', 'text']),
    )
  const table = () => {
    texts(v.columns, p + '.columns', 1)
    arr(v.rows, p + '.rows', 1).forEach((r, i) => {
      texts(r, `${p}.rows[${i}]`)
      if (r.length !== v.columns.length)
        fail(`${p}.rows[${i}]`, 'число ячеек не совпадает с заголовками')
    })
  }
  switch (v.type) {
    case 'process':
    case 'timeline':
      itemText()
      if (v.items.length < 2 || v.items.length > 8) fail(p + '.items', 'нужно 2–8 шагов')
      break
    case 'cycle':
    case 'layers':
      itemText()
      if (v.items.length > 8) fail(p + '.items', 'не более восьми элементов')
      break
    case 'tree':
      str(v.root, p + '.root')
      arr(v.branches, p + '.branches', 1).forEach((x, i) => {
        str(x.title, `${p}.branches[${i}].title`)
        texts(x.items, `${p}.branches[${i}].items`, 1)
        if (x.items.length > 4) fail(p, 'не более четырёх листьев на ветвь')
      })
      if (v.branches.length > 6) fail(p, 'не более шести ветвей')
      break
    case 'network': {
      const nodes = arr(v.nodes, p + '.nodes', 1)
      nodes.forEach((n, i) => fields(obj(n, p), `${p}.nodes[${i}]`, ['id', 'title', 'text']))
      unique(
        nodes.map((n) => n.id),
        p + '.nodes',
      )
      if (nodes.length > 8) fail(p, 'не более восьми узлов')
      arr(v.edges, p + '.edges').forEach((e, i) => {
        fields(obj(e, p), `${p}.edges[${i}]`, ['from', 'to', 'label'])
        if (!nodes.some((n) => n.id === e.from) || !nodes.some((n) => n.id === e.to))
          fail(`${p}.edges[${i}]`, 'неизвестный узел')
      })
      break
    }
    case 'bars':
      num(v.max, p + '.max', Number.MIN_VALUE)
      str(v.unit, p + '.unit', true)
      arr(v.items, p + '.items', 1).forEach((x, i) => {
        str(x.label, `${p}.items[${i}].label`)
        num(x.value, `${p}.items[${i}].value`)
        if (x.value > v.max) fail(p, 'значение превышает шкалу')
      })
      if (v.items.length > 8) fail(p, 'не более восьми столбцов')
      if (v.threshold !== undefined) {
        num(v.threshold, p + '.threshold')
        if (v.threshold > v.max) fail(p + '.threshold', 'порог превышает шкалу')
      }
      break
    case 'decision':
      fields(v, p, ['question', 'yes', 'no', 'start'])
      break
    case 'comparison':
    case 'matrix':
      table()
      break
    case 'beforeAfter':
      for (const side of ['before', 'after']) {
        const x = obj(v[side], p + '.' + side)
        str(x.title, p + '.' + side + '.title')
        arr(x.fields, p + '.' + side + '.fields', 1).forEach((f) =>
          fields(obj(f, p), p, ['label', 'value']),
        )
      }
      texts(v.changes, p + '.changes', 1)
      break
    case 'conceptMap':
      str(v.center, p + '.center')
      arr(v.items, p + '.items', 1).forEach((x) =>
        fields(obj(x, p), p, ['title', 'example', 'relation']),
      )
      break
    case 'states':
      texts(v.states, p + '.states', 1)
      arr(v.cancelFrom, p + '.cancelFrom').forEach((x) => {
        num(x, p + '.cancelFrom')
        if (!Number.isInteger(x) || x >= v.states.length)
          fail(p + '.cancelFrom', 'неизвестное состояние')
      })
      break
    case 'cause':
      fields(v, p, ['cause', 'effect', 'solution'])
      break
    case 'callouts':
      validAsset(v.image, p + '.image')
      str(v.alt, p + '.alt')
      arr(v.items, p + '.items', 1).forEach((x, i) => {
        fields(obj(x, p), p, ['title', 'text'])
        for (const k of ['x', 'y']) {
          num(x[k], `${p}.items[${i}].${k}`)
          if (x[k] > 100) fail(p, 'координаты должны быть в пределах 0–100')
        }
      })
      break
    case 'codeParts':
      arr(v.parts, p + '.parts', 1).forEach((x) =>
        fields(obj(x, p), p, ['code', 'label', 'explanation']),
      )
      break
    case 'funnel':
      str(v.unit, p + '.unit', true)
      arr(v.stages, p + '.stages', 2).forEach((x, i) => {
        fields(obj(x, p), p, ['label', 'detail'])
        num(x.value, p + '.stages[' + i + '].value')
        if (i && x.value > v.stages[i - 1].value)
          fail(p + '.stages', 'значения воронки должны не возрастать')
      })
      if (v.stages.length > 8 || v.stages[0].value <= 0)
        fail(p + '.stages', 'нужно 2–8 этапов, первый больше нуля')
      break
    case 'swimlanes':
      arr(v.lanes, p + '.lanes', 1).forEach((x, i) => {
        str(x.title, p + '.lanes[' + i + '].title')
        arr(x.steps, p + '.lanes[' + i + '].steps', 1).forEach((s) =>
          fields(obj(s, p), p, ['title', 'text']),
        )
        if (x.steps.length > 5) fail(p + '.lanes', 'не более пяти шагов в дорожке')
      })
      if (v.lanes.length > 4) fail(p + '.lanes', 'не более четырёх дорожек')
      break
    default:
      fail(p + '.type', 'неизвестный вид инфографики')
  }
}
export function validateStructure(value: unknown): asserts value is Course {
  const c = obj(value, 'course')
  choice(c.schemaVersion, 'course.schemaVersion', [1])
  fields(c, 'course', [
    'id',
    'contentVersion',
    'code',
    'discipline',
    'year',
    'heroTitle',
    'heroAccent',
    'slogan',
    'mascotAlt',
  ])
  for (const k of ['logo', 'mascot', 'ornament', 'font']) validAsset(c[k], 'course.' + k)
  if (c.topicArrow) validAsset(c.topicArrow, 'course.topicArrow')
  str(c.materialsUrl, 'course.materialsUrl', true)
  if (c.materialsUrl) http(c.materialsUrl, 'course.materialsUrl')
  choice(c.demo, 'course.demo', [true, false])
  arr(c.semesters, 'course.semesters', 1).forEach((x) => {
    num(x, 'course.semesters', 1)
    if (!Number.isInteger(x)) fail('course.semesters', 'нужны целые числа')
  })
  unique(c.semesters, 'course.semesters')
  if (c.literature) {
    const r = obj(c.literature, 'course.literature')
    reading(r.primary, 'course.literature.primary')
    reading(r.additional, 'course.literature.additional')
  }
  if (c.assessment) {
    const a = obj(c.assessment, 'course.assessment')
    choice(a.mode, 'course.assessment.mode', ['autonomous'])
    validAsset(a.url, 'course.assessment.url')
  }
  const ids = new Set<string>()
  const add = (id: unknown, p: string) => {
    const s = str(id, p)
    if (['__proto__', 'prototype', 'constructor'].includes(s)) fail(p, 'зарезервированный ID')
    if (ids.has(s)) fail(p, 'повтор ID ' + s)
    ids.add(s)
  }
  arr(c.lectures, 'course.lectures', 1).forEach((raw, li) => {
    const l = obj(raw, `lectures[${li}]`)
    const p = `lectures[${li}] (${l.id || '?'})`
    add(l.id, p + '.id')
    fields(l, p, ['title', 'sourceTitle', 'question'])
    choice(l.semester, p + '.semester', c.semesters)
    arr(l.slides, p + '.slides', 1).forEach((raw, si) => {
      const s = obj(raw, p + '.slides')
      const q = `${p}.slides[${si}] (${s.id || '?'})`
      add(s.id, q + '.id')
      str(s.title, q + '.title')
      str(s.kicker, q + '.kicker', true)
      choice(s.kind, q + '.kind', [
        'title',
        'theory',
        'notebook',
        'process',
        'comparison',
        'example',
        'warning',
        'test',
        'summary',
        'literature',
        'materials',
        'section',
        'questions',
        'agenda',
      ])
      for (const k of ['body', 'notebook', 'source'])
        if (s[k] !== undefined) str(s[k], q + '.' + k, true)
      if (s.bullets) texts(s.bullets, q + '.bullets')
      if (s.visual) visual(s.visual, q + '.visual')
      if (s.references) reading(s.references, q + '.references')
      if (s.readingGroup) choice(s.readingGroup, q + '.readingGroup', ['primary', 'additional'])
      if (s.steps)
        arr(s.steps, q + '.steps', 1).forEach((x) =>
          fields(obj(x, q), q + '.steps', ['title', 'text']),
        )
      if (s.columns || s.rows) {
        texts(s.columns, q + '.columns', 1)
        arr(s.rows, q + '.rows', 1).forEach((r) => {
          texts(r, q + '.rows')
          if (r.length !== s.columns.length)
            fail(q + '.rows', 'число ячеек не совпадает с заголовками')
        })
      }
      if (s.kind === 'test' && !s.task) fail(q + '.task', 'у тестового слайда нет задания')
      if (s.task) {
        const t = obj(s.task, q + '.task')
        add(t.id, q + '.task.id')
        str(t.prompt, q + '.task.prompt')
        choice(t.type, q + '.task.type', ['single', 'multiple', 'short', 'matching'])
        if (t.type !== 'short') {
          const opts = options(t.options, q + '.task.options')
          if (opts.length !== (t.type === 'multiple' ? 5 : 4))
            fail(q + '.task.options', 'нужно ' + (t.type === 'multiple' ? 5 : 4) + ' варианта')
        }
        if (t.type === 'multiple') {
          num(t.choose, q + '.task.choose', 2)
          if (!Number.isInteger(t.choose) || t.choose > t.options.length)
            fail(q + '.task.choose', 'некорректное число ответов')
        }
        if (t.type === 'matching' && options(t.items, q + '.task.items').length !== 4)
          fail(q + '.task.items', 'нужно 4 пары')
      }
    })
  })
  const slides = c.lectures.flatMap((l: Obj) => l.slides)
  const slideIds = new Set(slides.map((s: Obj) => s.id))
  const taskIds = new Set(slides.flatMap((s: Obj) => (s.task ? [s.task.id] : [])))
  if (c.glossary)
    arr(c.glossary, 'course.glossary').forEach((g, i) => {
      fields(obj(g, 'glossary'), `glossary[${i}]`, ['term', 'definition'])
      texts(g.slideIds, `glossary[${i}].slideIds`)
      g.slideIds.forEach((id: string) => {
        if (!slideIds.has(id)) fail(`glossary[${i}].slideIds`, 'неизвестный слайд ' + id)
      })
    })
  if (c.curriculum)
    arr(c.curriculum, 'course.curriculum').forEach((r, i) => {
      fields(obj(r, 'curriculum'), `curriculum[${i}]`, ['topic', 'outcome', 'source'])
      texts(r.slideIds, `curriculum[${i}].slideIds`, 1)
      texts(r.taskIds, `curriculum[${i}].taskIds`)
      r.slideIds.forEach((id: string) => {
        if (!slideIds.has(id)) fail(`curriculum[${i}]`, 'неизвестный слайд ' + id)
      })
      r.taskIds.forEach((id: string) => {
        if (!taskIds.has(id)) fail(`curriculum[${i}]`, 'неизвестное задание ' + id)
      })
    })
  const walk = (v: unknown, p: string): void => {
    if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (
          [
            'keys',
            'answer',
            'correctAnswer',
            'correctIndexes',
            'script',
            'preparation',
            'notes',
            '__proto__',
            'constructor',
            'prototype',
          ].includes(k)
        )
          fail(p + '.' + k, 'поле не разрешено в публичном курсе')
        walk(x, p + '.' + k)
      }
  }
  walk(c, 'course')
}
export function validateBank(
  value: unknown,
  course: Course,
): asserts value is { courseId: string; contentVersion: string; keys: Record<string, Key> } {
  const b = obj(value, 'assessment')
  if (b.courseId !== course.id || b.contentVersion !== course.contentVersion)
    fail('assessment', 'курс или версия не совпадают')
  const keys = obj(b.keys, 'assessment.keys')
  const tasks = course.lectures.flatMap((l) => l.slides.flatMap((s) => (s.task ? [s.task] : [])))
  for (const t of tasks) {
    const p = 'assessment.keys.' + t.id
    const k = obj(keys[t.id], p)
    choice(k.type, p + '.type', [t.type])
    str(k.explanation, p + '.explanation')
    const optionIds = t.options?.map((o) => o.id) || []
    if (t.type === 'single' || t.type === 'multiple') {
      texts(k.correct, p + '.correct', 1)
      unique(k.correct, p + '.correct')
      if (k.correct.length !== (t.type === 'single' ? 1 : t.choose))
        fail(p + '.correct', 'неверное число ключей')
      k.correct.forEach((id: string) => choice(id, p + '.correct', optionIds))
    }
    if (t.type === 'short') {
      if (k.numeric) {
        const n = obj(k.numeric, p + '.numeric')
        if (typeof n.value !== 'number' || !Number.isFinite(n.value))
          fail(p + '.numeric.value', 'нужно конечное число')
        num(n.tolerance, p + '.numeric.tolerance')
      } else texts(k.accepted, p + '.accepted', 1)
    }
    if (t.type === 'matching') {
      const pairs = obj(k.pairs, p + '.pairs')
      for (const item of t.items!) choice(pairs[item.id], p + '.pairs.' + item.id, optionIds)
      for (const id of Object.keys(pairs))
        choice(
          id,
          p + '.pairs',
          t.items!.map((x) => x.id),
        )
    }
    if (k.optionExplanations)
      for (const [id, v] of Object.entries(obj(k.optionExplanations, p + '.optionExplanations'))) {
        choice(id, p + '.optionExplanations', optionIds)
        str(v, p + '.optionExplanations.' + id)
      }
  }
  for (const id of Object.keys(keys))
    if (!tasks.some((t) => t.id === id)) fail('assessment.keys.' + id, 'нет такого задания')
}
export function validateTeacherPack(
  value: unknown,
  course: Course,
  allowOld = false,
): asserts value is TeacherPack {
  const p = obj(value, 'teacherPack')
  choice(p.schemaVersion, 'teacherPack.schemaVersion', [1])
  if (p.courseId !== course.id) fail('teacherPack.courseId', 'другой курс')
  str(p.contentVersion, 'teacherPack.contentVersion')
  if (!allowOld && p.contentVersion !== course.contentVersion)
    fail('teacherPack.contentVersion', 'версия не совпадает')
  const notes = obj(p.notes, 'teacherPack.notes')
  for (const [id, value] of Object.entries(notes)) {
    const n = obj(value, 'notes.' + id)
    for (const k of ['script', 'preparation', 'notebook', 'questions', 'answer'])
      str(n[k], 'notes.' + id + '.' + k, true)
    num(n.estimatedSeconds, 'notes.' + id + '.estimatedSeconds')
  }
}
export function courseAssets(c: Course) {
  return [
    ...new Set(
      [
        c.logo,
        c.mascot,
        c.ornament,
        c.font,
        c.topicArrow,
        ...c.lectures.flatMap((l) =>
          l.slides.flatMap((s) => (s.visual?.type === 'callouts' ? [s.visual.image] : [])),
        ),
        c.assessment?.url,
      ].filter((x): x is string => Boolean(x)),
    ),
  ]
}
export function readiness(c: Course) {
  const issues: string[] = []
  if (c.demo) issues.push('Демонстрационный курс: соответствие РПД не подтверждено.')
  if (!c.materialsUrl) issues.push('Не указана ссылка на материалы.')
  for (const l of c.lectures) {
    for (const group of ['primary', 'additional'] as const)
      if (
        !c.literature?.[group]?.length &&
        !l.slides.some(
          (s) => s.kind === 'literature' && s.readingGroup === group && s.references?.length,
        )
      )
        issues.push(
          `${l.id}: не заполнена ${group === 'primary' ? 'основная' : 'дополнительная'} литература.`,
        )
    if (!l.slides.some((s) => s.task)) issues.push(`${l.id}: нет самопроверки.`)
    if (l.slides[0].kind !== 'title' || l.slides.at(-1)?.kind !== 'questions')
      issues.push(`${l.id}: проверьте титульный и заключительный слайды.`)
  }
  if (!c.curriculum?.length) issues.push('Не заполнена карта соответствия учебной программе.')
  return issues
}
