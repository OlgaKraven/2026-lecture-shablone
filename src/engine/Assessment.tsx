import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Course, Lecture, Task } from './model'
import { assetUrl } from './model'
import { validateBank } from './validation'
import { read, save } from './storage'
import { evaluate } from './scoring'
import type { Answer, Key, Result } from './scoring'
import { Modal } from './Modal'
import { useMobile } from './responsive'
export type Attempt = {
  draft: Answer
  submitted?: Answer
  result?: Result
  seed: number
  attempts: number
  reveal?: boolean
}
type Context = {
  readonly?: boolean
  reveal: (t: Task, value: boolean) => void
  attempts: Record<string, Attempt>
  change: (t: Task, a: Answer) => void
  submit: (t: Task) => Promise<void>
  retry: (t: Task) => void
  busy: string
  error: string
  keys: Record<string, Key>
  reset: () => void
}
const AssessmentContext = createContext<Context | null>(null)
const fresh = (t: Task): Attempt => ({
  draft: t.type === 'matching' ? {} : t.type === 'short' ? '' : [],
  seed: crypto.getRandomValues(new Uint32Array(1))[0],
  attempts: 0,
})
export function AssessmentProvider({
  course,
  base,
  children,
  snapshot,
  readonly = false,
}: {
  course: Course
  base: string
  children: ReactNode
  snapshot?: Record<string, Attempt>
  readonly?: boolean
}) {
  const storageKey = `lecture:${base}:${course.id}:${course.contentVersion}:attempts`
  const [attempts, setAttempts] = useState<Record<string, Attempt>>(() =>
    readonly ? {} : read(storageKey, {}),
  )
  const [keys, setKeys] = useState<Record<string, Key>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const request = useRef<Promise<Record<string, Key>> | null>(null)
  const put = (id: string, value: Attempt) =>
    setAttempts((old) => {
      const next = { ...old, [id]: value }
      if (!save(storageKey, next)) setError('Не удалось сохранить попытку на устройстве.')
      return next
    })
  const load = async () => {
    if (!course.assessment) throw Error('Банк самопроверки не подключён')
    if (!request.current)
      request.current = fetch(assetUrl(course.assessment.url, base))
        .then((r) => {
          if (!r.ok) throw Error('Не удалось загрузить банк ответов')
          return r.json()
        })
        .then((data) => {
          validateBank(data, course)
          setKeys(data.keys)
          return data.keys
        })
        .catch((e) => {
          request.current = null
          throw e
        })
    return request.current
  }
  const submit = async (t: Task) => {
    const a = attempts[t.id] || fresh(t)
    const draft = a.draft
    if (
      (typeof draft === 'string' && !draft.trim()) ||
      (Array.isArray(draft) && !draft.length) ||
      (typeof draft === 'object' && !Array.isArray(draft) && !Object.values(draft).some(Boolean))
    ) {
      setError('Сначала введите ответ. Пустое поле не считается попыткой.')
      return
    }
    setError('')
    setBusy(t.id)
    try {
      const bank = await load()
      if (!bank[t.id]) throw Error('Не найден ключ задания')
      const result = evaluate(t, bank[t.id], draft)
      put(t.id, { ...a, submitted: structuredClone(draft), result, attempts: a.attempts + 1 })
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy('')
    }
  }
  return (
    <AssessmentContext.Provider
      value={{
        attempts: readonly ? snapshot || {} : attempts,
        readonly,
        reveal: (t, value) => {
          const a = attempts[t.id]
          if (a?.result) put(t.id, { ...a, reveal: value })
        },
        change: (t, a) => {
          setError('')
          put(t.id, { ...(attempts[t.id] || fresh(t)), draft: a })
        },
        submit,
        retry: (t) => {
          setError('')
          const a = attempts[t.id] || fresh(t)
          put(t.id, { ...fresh(t), attempts: a.attempts })
        },
        busy,
        error,
        keys,
        reset: () => {
          setAttempts({})
          save(storageKey, {})
          setError('')
        },
      }}
    >
      {children}
    </AssessmentContext.Provider>
  )
}
export function TaskView({ task: t }: { task: Task }) {
  const mobile = useMobile()
  const ctx = useContext(AssessmentContext)!
  const a = ctx.attempts[t.id]
  const options = t.options || []
  const done = Boolean(a?.result)
  const show = Boolean(a?.reveal)
  const disabled = done || ctx.readonly
  const choice = (id: string) => {
    if (t.type === 'single') ctx.change(t, [id])
    else {
      const list = Array.isArray(a?.draft) ? a.draft : []
      ctx.change(t, list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
    }
  }
  return (
    <section className="interactive-task">
      <p className="task-prompt">{t.prompt}</p>
      {(t.type === 'single' || t.type === 'multiple') && (
        <div className="choice-grid">
          {options.map((o, i) => (
            <label key={o.id}>
              <input
                type={t.type === 'single' ? 'radio' : 'checkbox'}
                name={t.id}
                checked={Array.isArray(a?.draft) && a.draft.includes(o.id)}
                disabled={disabled}
                onChange={() => choice(o.id)}
              />
              <b>{String.fromCharCode(1040 + i)}</b>
              <span>{o.text}</span>
            </label>
          ))}
        </div>
      )}
      {t.type === 'short' && (
        <label className="short-field">
          Ваш ответ
          <input
            aria-label="Краткий ответ"
            value={typeof a?.draft === 'string' ? a.draft : ''}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => ctx.change(t, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void ctx.submit(t)
              }
            }}
          />
        </label>
      )}
      {t.type === 'matching' && (
        <div className="matching-fields">
          {t.items?.map((item) => (
            <label key={item.id}>
              <span>{item.text}</span>
              <select
                aria-label={`Соответствие: ${item.text}`}
                disabled={disabled}
                value={
                  a?.draft && typeof a.draft === 'object' && !Array.isArray(a.draft)
                    ? a.draft[item.id] || ''
                    : ''
                }
                onChange={(e) =>
                  ctx.change(t, {
                    ...(typeof a?.draft === 'object' && !Array.isArray(a.draft) ? a.draft : {}),
                    [item.id]: e.target.value,
                  })
                }
              >
                <option value="">Выберите соответствие</option>
                {options.map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.text}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <div className="task-actions">
        {ctx.readonly ? (
          <>
            {done && (
              <span className={`task-status ${a!.result!.status}`}>
                {a!.result!.status === 'correct' ? 'Правильно' : 'Есть ошибка'} ·{' '}
                {a!.result!.score.toLocaleString('ru-RU')} / 1
              </span>
            )}
          </>
        ) : !done ? (
          <button
            className="button primary"
            disabled={ctx.busy === t.id}
            onClick={() => void ctx.submit(t)}
          >
            {ctx.busy === t.id ? 'Проверяем…' : 'Проверить'}
          </button>
        ) : (
          <>
            <span className={`task-status ${a!.result!.status}`} role="status">
              {a!.result!.status === 'correct' ? 'Правильно' : 'Есть ошибка'} ·{' '}
              {a!.result!.score.toLocaleString('ru-RU')} / 1
            </span>
            {!mobile && (
              <button className="button ghost" onClick={() => ctx.reveal(t, true)}>
                Разбор ответа
              </button>
            )}
            <button className="button ghost" onClick={() => ctx.retry(t)}>
              Ещё попытка
            </button>
          </>
        )}
        {ctx.error && (
          <span role="alert" className="task-error">
            {ctx.error}
          </span>
        )}
      </div>
      {!mobile && show && a?.result && ctx.readonly && (
        <aside className="audience-answer">
          <strong>Разбор ответа</strong>
          <p>{a.result.solution}</p>
          <p>{a.result.explanation}</p>
        </aside>
      )}
      {!mobile && show && a?.result && !ctx.readonly && (
        <Modal title="Разбор ответа" onClose={() => ctx.reveal(t, false)}>
          <p>{a.result.explanation}</p>
          <h3>Правильный ответ</h3>
          <p className="preserve-lines">{a.result.solution}</p>
          {ctx.keys[t.id]?.optionExplanations && (
            <ul>
              {Object.entries(ctx.keys[t.id].optionExplanations!).map(([id, text]) => (
                <li key={id}>
                  <strong>{t.options?.find((o) => o.id === id)?.text}:</strong> {text}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </section>
  )
}
export function AssessmentResults({
  lecture,
  onGo,
}: {
  lecture: Lecture
  onGo: (index: number) => void
}) {
  const mobile = useMobile()
  const ctx = useContext(AssessmentContext)!
  const [confirm, setConfirm] = useState(false)
  const tasks = lecture.slides.map((s, index) => ({ task: s.task, index })).filter((x) => x.task)
  const correct = tasks.filter((x) => ctx.attempts[x.task!.id]?.result?.status === 'correct').length
  const wrong = tasks.filter((x) => ctx.attempts[x.task!.id]?.result?.status === 'incorrect').length
  const score = tasks.reduce((sum, x) => sum + (ctx.attempts[x.task!.id]?.result?.score || 0), 0)
  return (
    <>
      <div className="result-summary">
        <div>
          <b>{correct}</b>
          <span>Правильно</span>
        </div>
        <div>
          <b>{wrong}</b>
          <span>С ошибкой</span>
        </div>
        <div>
          <b>{tasks.length - correct - wrong}</b>
          <span>Без проверки</span>
        </div>
      </div>
      <p>
        <strong>
          Баллы: {score.toLocaleString('ru-RU')} из {tasks.length}.
        </strong>{' '}
        Четыре задания одного вопроса — максимум 4 балла. Каждая пара соответствия — 0,25 балла.
      </p>
      <ol className="result-list">
        {tasks.map(({ task: t, index }) => {
          const a = ctx.attempts[t!.id]
          return (
            <li key={t!.id}>
              <button className="text-button" onClick={() => onGo(index)}>
                {t!.prompt}
              </button>
              <p className={a?.result?.status || ''}>
                {!a?.result
                  ? 'Ответ ещё не проверен'
                  : a.result.status === 'correct'
                    ? 'Правильно'
                    : 'Есть ошибка'}
              </p>
              {!mobile && a?.result && (
                <details>
                  <summary>Ответ и объяснение</summary>
                  <p>
                    <strong>Ваш ответ:</strong> {formatAnswer(t!, a.submitted!)}
                  </p>
                  <p>
                    <strong>Правильный ответ:</strong>
                  </p>
                  <p className="preserve-lines">{a.result.solution}</p>
                  <p>{a.result.explanation}</p>
                </details>
              )}
            </li>
          )
        })}
      </ol>
      {confirm ? (
        <div className="dialog-actions">
          <span>Сбросить все попытки курса на этом устройстве?</span>
          <button
            className="button primary"
            onClick={() => {
              ctx.reset()
              setConfirm(false)
            }}
          >
            Сбросить
          </button>
          <button className="button ghost" onClick={() => setConfirm(false)}>
            Отмена
          </button>
        </div>
      ) : (
        <button className="button ghost" onClick={() => setConfirm(true)}>
          Начать самопроверку заново
        </button>
      )}
    </>
  )
}
function formatAnswer(t: Task, a: Answer) {
  if (typeof a === 'string') return a
  if (Array.isArray(a))
    return a.map((id) => t.options?.find((o) => o.id === id)?.text || id).join('; ')
  return Object.entries(a)
    .map(
      ([id, x]) =>
        `${t.items?.find((o) => o.id === id)?.text}: ${t.options?.find((o) => o.id === x)?.text || '—'}`,
    )
    .join('; ')
}

export function AssessmentSync({
  task,
  onChange,
}: {
  task?: Task
  onChange: (value: Record<string, Attempt>) => void
}) {
  const ctx = useContext(AssessmentContext)!
  const attempt = task ? ctx.attempts[task.id] : undefined
  useEffect(() => {
    onChange(task && attempt ? { [task.id]: attempt } : {})
  }, [task?.id, attempt, onChange])
  return null
}
