import type { Course } from './model'
export type Backup = {
  schemaVersion: 1
  kind: 'lecture-backup'
  courseId: string
  contentVersion: string
  createdAt: string
  entries: Record<string, unknown>
  slides: Record<string, string>
  tasks: Record<string, string>
}
const suffixes = ['theme', 'profile', 'materials', 'animation', 'study']
const slideMap = (c: Course) =>
  Object.fromEntries(c.lectures.flatMap((l) => l.slides.map((s) => [s.id, JSON.stringify(s)])))
const taskMap = (c: Course) =>
  Object.fromEntries(
    c.lectures.flatMap((l) =>
      l.slides.flatMap((s) => (s.task ? [[s.task.id, JSON.stringify(s.task)]] : [])),
    ),
  )
export function exportBackup(c: Course, base: string, storage: Storage): Backup {
  const prefix = `lecture:${base}:${c.id}:`
  const entries: Record<string, unknown> = {}
  for (const suffix of [
    ...suffixes,
    `${c.contentVersion}:attempts`,
    ...c.lectures.map((l) => `${c.contentVersion}:${l.id}:progress`),
  ]) {
    const raw = storage.getItem(prefix + suffix)
    if (raw !== null) entries[suffix] = JSON.parse(raw)
  }
  return {
    schemaVersion: 1,
    kind: 'lecture-backup',
    courseId: c.id,
    contentVersion: c.contentVersion,
    createdAt: new Date().toISOString(),
    entries,
    slides: slideMap(c),
    tasks: taskMap(c),
  }
}
export function prepareBackup(value: unknown, c: Course) {
  const b = value as Backup
  if (
    !b ||
    b.schemaVersion !== 1 ||
    b.kind !== 'lecture-backup' ||
    b.courseId !== c.id ||
    typeof b.contentVersion !== 'string' ||
    !b.entries ||
    typeof b.entries !== 'object' ||
    Array.isArray(b.entries) ||
    !b.slides ||
    !b.tasks
  )
    throw Error('Некорректная копия или другой курс')
  const entries: Record<string, unknown> = {}
  let skipped = 0
  const same = b.contentVersion === c.contentVersion
  const slides = slideMap(c)
  for (const [key, v] of Object.entries(b.entries)) {
    if (key === 'theme') {
      if (v !== 'light' && v !== 'dark') throw Error('Неверная тема')
      entries[key] = v
    } else if (key === 'animation') {
      if (typeof v !== 'boolean') throw Error('Неверная настройка анимации')
      entries[key] = v
    } else if (key === 'profile') {
      const p = v as Record<string, unknown>
      if (!p || !['fullName', 'position', 'department'].every((k) => typeof p[k] === 'string'))
        throw Error('Неверный профиль')
      entries[key] = { fullName: p.fullName, position: p.position, department: p.department }
    } else if (key === 'materials') {
      if (typeof v !== 'string' || (v && !/^https?:\/\//i.test(v))) throw Error('Неверная ссылка')
      entries[key] = v
    } else if (key === 'study') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Неверные отметки')
      entries[key] = Object.fromEntries(
        Object.entries(v)
          .filter(([id, x]) => id in slides && x && typeof x === 'object')
          .map(([id, x]) => [
            id,
            { done: Boolean(x.done), review: Boolean(x.review), bookmark: Boolean(x.bookmark) },
          ]),
      )
    } else if (key === `${b.contentVersion}:attempts`) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Неверные попытки')
      // A changed answer bank can invalidate a score even when the task text is unchanged.
      if (!same) {
        skipped += Object.keys(v).length
        continue
      }
      const allowed = taskMap(c)
      const attempts: Record<string, unknown> = {}
      for (const [id, a] of Object.entries(v)) {
        if (!(id in allowed)) {
          skipped++
          continue
        }
        if (
          !a ||
          typeof a !== 'object' ||
          !Number.isFinite(a.seed) ||
          !Number.isInteger(a.attempts) ||
          a.attempts < 0
        )
          throw Error('Неверная попытка ' + id)
        const draft = a.draft
        if (!(
          typeof draft === 'string' ||
          (Array.isArray(draft) && draft.every((x) => typeof x === 'string')) ||
          (draft &&
            typeof draft === 'object' &&
            !Array.isArray(draft) &&
            Object.values(draft).every((x) => typeof x === 'string'))
        ))
          throw Error('Неверный ответ ' + id)
        if (
          a.result &&
          (!['correct', 'incorrect', 'unanswered'].includes(a.result.status) ||
            !Number.isFinite(a.result.score) ||
            a.result.score < 0 ||
            a.result.score > 1 ||
            typeof a.result.explanation !== 'string' ||
            typeof a.result.solution !== 'string' ||
            a.submitted === undefined)
        )
          throw Error('Неверный результат ' + id)
        attempts[id] = {
          draft,
          submitted: a.submitted,
          result: a.result,
          seed: a.seed,
          attempts: a.attempts,
          reveal: false,
        }
      }
      entries[`${c.contentVersion}:attempts`] = attempts
    } else {
      const l = c.lectures.find((l) => key === `${b.contentVersion}:${l.id}:progress`)
      if (!l) throw Error('Недопустимое поле копии: ' + key)
      if (
        typeof v === 'string' &&
        l.slides.some((s) => s.id === v) &&
        (same || b.slides[v] === slides[v])
      )
        entries[`${c.contentVersion}:${l.id}:progress`] = v
      else skipped++
    }
  }
  return { entries, skipped, oldVersion: !same }
}
export function applyBackup(
  entries: Record<string, unknown>,
  c: Course,
  base: string,
  storage: Storage,
) {
  const prefix = `lecture:${base}:${c.id}:`
  const before = new Map<string, string | null>()
  try {
    for (const [key, v] of Object.entries(entries)) {
      before.set(prefix + key, storage.getItem(prefix + key))
      storage.setItem(prefix + key, JSON.stringify(v))
    }
  } catch (e) {
    for (const [key, v] of before) {
      try {
        if (v === null) storage.removeItem(key)
        else storage.setItem(key, v)
      } catch {
        /* best effort rollback */
      }
    }
    throw e
  }
}
