import { useEffect, useState } from 'react'
import type { Course, Slide, Task } from './model'
import { assetUrl, validateCourse } from './model'
import { validateBank } from './validation'
import type { Key } from './scoring'
import { downloadJson, read, save } from './storage'
import { SlideView } from './SlideView'

type Draft = { course: Course; keys: Record<string, Key> }
type History = { past: Draft[]; present: Draft; future: Draft[] }
const freshId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`
export default function CourseEditor({
  course,
  base,
  onClose,
}: {
  course: Course
  base: string
  onClose: () => void
}) {
  const storageKey = `lecture:${base}:${course.id}:editor:${course.contentVersion}`
  const [history, setHistory] = useState<History>(() => {
    const h = read<History | null>(storageKey, null)
    try {
      if (h) {
        if (
          h.present.course.id !== course.id ||
          !Array.isArray(h.past) ||
          !Array.isArray(h.future) ||
          !h.present.keys ||
          !h.present.course.lectures?.length ||
          h.present.course.lectures.some((l) => !l.slides?.length)
        )
          throw Error('Повреждённый черновик')
        return h
      }
    } catch {
      /* invalid local draft */
    }
    return { past: [], present: { course: structuredClone(course), keys: {} }, future: [] }
  })
  const d = history.present
  const [li, setLi] = useState(0)
  const [si, setSi] = useState(0)
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState(true)
  const [pending, setPending] = useState<Draft | null>(null)
  const [advanced, setAdvanced] = useState('')
  const [preview, setPreview] = useState(false)
  const l = d.course.lectures[Math.min(li, d.course.lectures.length - 1)]
  const slide = l.slides[Math.min(si, l.slides.length - 1)]
  const commit = (next: Draft) => {
    setPreview(false)
    setSaved(false)
    setHistory((h) => ({ past: [...h.past, h.present].slice(-30), present: next, future: [] }))
  }
  const updateCourse = (patch: Partial<Course>) =>
    commit({ ...d, course: { ...d.course, ...patch } })
  const updateSlide = (patch: Partial<Slide>) =>
    updateCourse({
      lectures: d.course.lectures.map((x) =>
        x.id === l.id
          ? { ...x, slides: x.slides.map((s) => (s.id === slide.id ? { ...s, ...patch } : s)) }
          : x,
      ),
    })
  const updateLecture = (patch: Partial<typeof l>) =>
    updateCourse({
      lectures: d.course.lectures.map((x) => (x.id === l.id ? { ...x, ...patch } : x)),
    })
  useEffect(() => {
    const timer = setTimeout(() => {
      const ok = save(storageKey, history)
      setSaved(ok)
      if (!ok) setNotice('Автосохранение недоступно. Скачайте черновик перед закрытием.')
    }, 400)
    return () => clearTimeout(timer)
  }, [history, storageKey])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!saved) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saved])
  useEffect(() => {
    if (!course.assessment || Object.keys(history.present.keys).length) return
    let active = true
    fetch(assetUrl(course.assessment.url, base))
      .then((r) => {
        if (!r.ok) throw Error('Банк ответов не загрузился')
        return r.json()
      })
      .then((bank) => {
        validateBank(bank, course)
        if (active)
          setHistory((h) => ({
            ...h,
            present: { ...h.present, keys: { ...bank.keys, ...h.present.keys } },
          }))
      })
      .catch((e) => active && setNotice(String(e)))
    return () => {
      active = false
    }
  }, [base, course])
  const check = () => {
    validateCourse(d.course)
    if (d.course.assessment)
      validateBank(
        { courseId: d.course.id, contentVersion: d.course.contentVersion, keys: d.keys },
        d.course,
      )
  }
  const act = (f: () => void) => {
    try {
      f()
    } catch (e) {
      setNotice(String(e))
    }
  }
  const addTask = (type: Task['type']) => {
    const id = freshId('task')
    const opts = Array.from({ length: type === 'multiple' ? 5 : 4 }, (_, i) => ({
      id: `o${i + 1}`,
      text: `Вариант ${i + 1}`,
    }))
    const task: Task = {
      id,
      type,
      prompt: 'Введите вопрос',
      ...(type === 'short' ? {} : { options: opts }),
      ...(type === 'multiple' ? { choose: 2 } : {}),
      ...(type === 'matching'
        ? { items: opts.slice(0, 4).map((_, i) => ({ id: `i${i + 1}`, text: `Элемент ${i + 1}` })) }
        : {}),
    }
    const key: Key = {
      type,
      explanation: 'Добавьте объяснение',
      ...(type === 'single'
        ? { correct: ['o1'] }
        : type === 'multiple'
          ? { correct: ['o1', 'o2'] }
          : type === 'short'
            ? { accepted: ['Ответ'] }
            : { pairs: { i1: 'o1', i2: 'o2', i3: 'o3', i4: 'o4' } }),
    }
    const keys = { ...d.keys }
    if (slide.task) delete keys[slide.task.id]
    keys[id] = key
    commit({
      course: {
        ...d.course,
        assessment: d.course.assessment || { mode: 'autonomous', url: 'assessment.json' },
        lectures: d.course.lectures.map((x) =>
          x.id === l.id
            ? {
                ...x,
                slides: x.slides.map((s) => (s.id === slide.id ? { ...s, kind: 'test', task } : s)),
              }
            : x,
        ),
      },
      keys,
    })
  }
  const key = slide.task ? d.keys[slide.task.id] : undefined
  return (
    <main className="editor-shell">
      <header className="editor-header">
        <h1>Редактор курса</h1>
        <span role="status">
          {saved ? 'Черновик сохранён на устройстве' : 'Есть несохранённые изменения'}
        </span>
        <button
          className="button ghost"
          onClick={() => {
            if (saved || window.confirm('Есть несохранённые изменения. Закрыть редактор?'))
              onClose()
          }}
        >
          Закрыть редактор
        </button>
      </header>
      <p>
        Редактируется локальный черновик. Для публикации скачайте курс и банк самопроверки и
        замените соответствующие файлы проекта.
      </p>
      <div className="tools-tabs">
        <button
          className="button ghost"
          disabled={!history.past.length}
          onClick={() => {
            setSaved(false)
            setHistory((h) => ({
              past: h.past.slice(0, -1),
              present: h.past.at(-1)!,
              future: [h.present, ...h.future],
            }))
            setPreview(false)
          }}
        >
          Отменить
        </button>
        <button
          className="button ghost"
          disabled={!history.future.length}
          onClick={() => {
            setSaved(false)
            setHistory((h) => ({
              past: [...h.past, h.present],
              present: h.future[0],
              future: h.future.slice(1),
            }))
            setPreview(false)
          }}
        >
          Повторить
        </button>
        <button
          className="button ghost"
          onClick={() => downloadJson(`${course.id}-draft.json`, { kind: 'lecture-draft', ...d })}
        >
          Скачать черновик
        </button>
        <button
          className="button primary"
          onClick={() =>
            act(() => {
              check()
              downloadJson('course.json', d.course)
              setNotice('Курс проверен и скачан. Скачайте также банк самопроверки.')
            })
          }
        >
          Проверить и скачать курс
        </button>
        <button
          className="button ghost"
          onClick={() =>
            act(() => {
              check()
              downloadJson('assessment.json', {
                courseId: d.course.id,
                contentVersion: d.course.contentVersion,
                keys: d.keys,
              })
            })
          }
        >
          Скачать банк самопроверки
        </button>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <label className="file-control">
        Импорт банка самопроверки
        <input
          type="file"
          accept=".json"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const bank = JSON.parse(await f.text())
              validateBank(bank, d.course)
              setPending({ ...d, keys: bank.keys })
            } catch (error) {
              setNotice(String(error))
            }
          }}
        />
      </label>
      <label className="file-control">
        Импорт курса или черновика
        <input
          type="file"
          accept=".json"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const x = JSON.parse(await f.text())
              const next: Draft =
                x.kind === 'lecture-draft'
                  ? { course: x.course, keys: x.keys }
                  : { course: x, keys: {} }
              validateCourse(next.course)
              if (next.course.id !== course.id)
                throw Error('Откройте другой курс в отдельном проекте')
              if (x.kind === 'lecture-draft' && next.course.assessment)
                validateBank(
                  {
                    courseId: next.course.id,
                    contentVersion: next.course.contentVersion,
                    keys: next.keys,
                  },
                  next.course,
                )
              setPending(next)
            } catch (error) {
              setNotice(String(error))
            }
          }}
        />
      </label>
      {pending && (
        <section className="import-preview">
          <h2>Проверка импорта</h2>
          <p>
            {d.course.lectures.length} → {pending.course.lectures.length} лекций;{' '}
            {d.course.lectures.reduce((n, l) => n + l.slides.length, 0)} →{' '}
            {pending.course.lectures.reduce((n, l) => n + l.slides.length, 0)} слайдов. Версия:{' '}
            {d.course.contentVersion} → {pending.course.contentVersion}. Предыдущий черновик
            останется в истории.
          </p>
          <button
            className="button primary"
            onClick={() => {
              commit(pending)
              setPending(null)
              setLi(0)
              setSi(0)
            }}
          >
            Применить импорт
          </button>
          <button className="button ghost" onClick={() => setPending(null)}>
            Отмена
          </button>
        </section>
      )}
      <details>
        <summary>Настройки и учебные материалы курса</summary>
        <div className="settings-form">
          {(
            [
              'code',
              'discipline',
              'year',
              'heroTitle',
              'heroAccent',
              'slogan',
              'materialsUrl',
              'contentVersion',
            ] as const
          ).map((k) => (
            <label key={k}>
              {
                {
                  code: 'Код',
                  discipline: 'Дисциплина',
                  year: 'Учебный год',
                  heroTitle: 'Заголовок',
                  heroAccent: 'Акцент заголовка',
                  slogan: 'Описание',
                  materialsUrl: 'Ссылка на материалы',
                  contentVersion: 'Версия содержания',
                }[k]
              }
              <input value={d.course[k]} onChange={(e) => updateCourse({ [k]: e.target.value })} />
            </label>
          ))}
          <label>
            Демонстрационный курс
            <input
              type="checkbox"
              checked={d.course.demo}
              onChange={(e) => updateCourse({ demo: e.target.checked })}
            />
          </label>
          <h3>Литература</h3>
          {(['primary', 'additional'] as const).map((group) => (
            <section key={group}>
              <h4>{group === 'primary' ? 'Основная' : 'Дополнительная'}</h4>
              {d.course.literature?.[group]?.map((r, i) => (
                <div key={i}>
                  <label>
                    Библиографическая запись
                    <input
                      value={r.citation}
                      onChange={(e) =>
                        updateCourse({
                          literature: {
                            primary: [],
                            additional: [],
                            ...d.course.literature,
                            [group]: d.course.literature![group].map((x, j) =>
                              j === i ? { ...x, citation: e.target.value } : x,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Ссылка
                    <input
                      value={r.url || ''}
                      onChange={(e) =>
                        updateCourse({
                          literature: {
                            primary: [],
                            additional: [],
                            ...d.course.literature,
                            [group]: d.course.literature![group].map((x, j) =>
                              j === i ? { ...x, url: e.target.value } : x,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              <button
                className="button ghost"
                onClick={() =>
                  updateCourse({
                    literature: {
                      primary: [],
                      additional: [],
                      ...d.course.literature,
                      [group]: [
                        ...(d.course.literature?.[group] || []),
                        { citation: 'Новый источник' },
                      ],
                    },
                  })
                }
              >
                Добавить источник
              </button>
            </section>
          ))}
          <h3>Глоссарий</h3>
          {d.course.glossary?.map((g, i) => (
            <fieldset key={i}>
              <legend>Термин {i + 1}</legend>
              {(['term', 'definition', 'slideIds'] as const).map((k) => (
                <label key={k}>
                  {k === 'term'
                    ? 'Термин'
                    : k === 'definition'
                      ? 'Определение'
                      : 'ID слайдов через запятую'}
                  <input
                    value={Array.isArray(g[k]) ? g[k].join(', ') : g[k]}
                    onChange={(e) =>
                      updateCourse({
                        glossary: d.course.glossary!.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                [k]:
                                  k === 'slideIds'
                                    ? e.target.value
                                        .split(',')
                                        .map((x) => x.trim())
                                        .filter(Boolean)
                                    : e.target.value,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <button
            className="button ghost"
            onClick={() =>
              updateCourse({
                glossary: [
                  ...(d.course.glossary || []),
                  { term: 'Новый термин', definition: 'Определение', slideIds: [slide.id] },
                ],
              })
            }
          >
            Добавить термин
          </button>
          <h3>Карта учебной программы</h3>
          {d.course.curriculum?.map((r, i) => (
            <fieldset key={i}>
              <legend>Тема {i + 1}</legend>
              {(['topic', 'outcome', 'source', 'slideIds', 'taskIds'] as const).map((k) => (
                <label key={k}>
                  {
                    {
                      topic: 'Тема программы',
                      outcome: 'Результат обучения',
                      source: 'Источник и страница',
                      slideIds: 'ID слайдов через запятую',
                      taskIds: 'ID заданий через запятую',
                    }[k]
                  }
                  <input
                    value={Array.isArray(r[k]) ? r[k].join(', ') : r[k]}
                    onChange={(e) =>
                      updateCourse({
                        curriculum: d.course.curriculum!.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                [k]: k.endsWith('Ids')
                                  ? e.target.value
                                      .split(',')
                                      .map((x) => x.trim())
                                      .filter(Boolean)
                                  : e.target.value,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <button
            className="button ghost"
            onClick={() =>
              updateCourse({
                curriculum: [
                  ...(d.course.curriculum || []),
                  {
                    topic: 'Тема программы',
                    outcome: 'Заполните по РПД',
                    source: 'Укажите документ и страницу',
                    slideIds: [slide.id],
                    taskIds: [],
                  },
                ],
              })
            }
          >
            Добавить тему программы
          </button>
        </div>
      </details>
      <div className="editor-grid">
        <aside>
          <label>
            Лекция
            <select
              value={l.id}
              onChange={(e) => {
                setLi(d.course.lectures.findIndex((l) => l.id === e.target.value))
                setSi(0)
                setPreview(false)
              }}
            >
              {d.course.lectures.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button ghost"
            onClick={() => {
              const newLecture = {
                id: freshId('lecture'),
                title: 'Новая лекция',
                sourceTitle: 'Тема программы',
                semester: d.course.semesters[0],
                question: 'Учебный вопрос',
                slides: [
                  {
                    id: freshId('slide'),
                    kind: 'title' as const,
                    title: 'Новая лекция',
                    kicker: '',
                  },
                ],
              }
              updateCourse({ lectures: [...d.course.lectures, newLecture] })
              setLi(d.course.lectures.length)
              setSi(0)
            }}
          >
            Добавить лекцию
          </button>
          <ol className="toc-list">
            {l.slides.map((s, i) => (
              <li key={s.id}>
                <button
                  aria-current={s.id === slide.id ? 'step' : undefined}
                  onClick={() => {
                    setSi(i)
                    setPreview(false)
                  }}
                >
                  {i + 1}. {s.title}
                </button>
              </li>
            ))}
          </ol>
          <button
            className="button ghost"
            onClick={() => {
              updateLecture({
                slides: [
                  ...l.slides,
                  {
                    id: freshId('slide'),
                    kind: 'theory',
                    title: 'Новый слайд',
                    kicker: '',
                    body: 'Добавьте объяснение',
                  },
                ],
              })
              setSi(l.slides.length)
            }}
          >
            Добавить слайд
          </button>
        </aside>
        <section className="settings-form">
          <label>
            Название лекции
            <input value={l.title} onChange={(e) => updateLecture({ title: e.target.value })} />
          </label>
          <label>
            Тема программы
            <input
              value={l.sourceTitle}
              onChange={(e) => updateLecture({ sourceTitle: e.target.value })}
            />
          </label>
          <label>
            Учебный вопрос
            <input
              value={l.question}
              onChange={(e) => updateLecture({ question: e.target.value })}
            />
          </label>
          <label>
            Семестр
            <select
              value={l.semester}
              onChange={(e) => updateLecture({ semester: Number(e.target.value) })}
            >
              {d.course.semesters.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <p>ID слайда: {slide.id}</p>
          <label>
            Тип слайда
            <select
              value={slide.kind}
              onChange={(e) => updateSlide({ kind: e.target.value as Slide['kind'] })}
            >
              {[
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
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Заголовок слайда
            <input value={slide.title} onChange={(e) => updateSlide({ title: e.target.value })} />
          </label>
          <label>
            Надзаголовок
            <input value={slide.kicker} onChange={(e) => updateSlide({ kicker: e.target.value })} />
          </label>
          <label>
            Объяснение
            <textarea
              value={slide.body || ''}
              onChange={(e) => updateSlide({ body: e.target.value })}
            />
          </label>
          <label>
            Тезисы, каждый с новой строки
            <textarea
              value={slide.bullets?.join('\n') || ''}
              onChange={(e) => updateSlide({ bullets: e.target.value.split('\n').filter(Boolean) })}
            />
          </label>
          <label>
            Запись в тетрадь
            <textarea
              value={slide.notebook || ''}
              onChange={(e) => updateSlide({ notebook: e.target.value })}
            />
          </label>
          <div className="tools-tabs">
            <button
              className="button ghost"
              disabled={l.slides.indexOf(slide) === 0}
              onClick={() => {
                const i = l.slides.indexOf(slide)
                const list = [...l.slides]
                ;[list[i - 1], list[i]] = [list[i], list[i - 1]]
                updateLecture({ slides: list })
                setSi(i - 1)
              }}
            >
              Слайд выше
            </button>
            <button
              className="button ghost"
              disabled={l.slides.indexOf(slide) === l.slides.length - 1}
              onClick={() => {
                const i = l.slides.indexOf(slide)
                const list = [...l.slides]
                ;[list[i + 1], list[i]] = [list[i], list[i + 1]]
                updateLecture({ slides: list })
                setSi(i + 1)
              }}
            >
              Слайд ниже
            </button>
            <button
              className="button ghost"
              disabled={l.slides.length === 1}
              onClick={() => {
                const keys = { ...d.keys }
                if (slide.task) delete keys[slide.task.id]
                commit({
                  keys,
                  course: {
                    ...d.course,
                    lectures: d.course.lectures.map((x) =>
                      x.id === l.id
                        ? { ...x, slides: x.slides.filter((s) => s.id !== slide.id) }
                        : x,
                    ),
                  },
                })
                setSi(Math.max(0, si - 1))
              }}
            >
              Удалить слайд
            </button>
          </div>
          <label>
            Инфографика из образцов
            <select
              value=""
              onChange={(e) => {
                const sample = course.lectures
                  .flatMap((l) => l.slides)
                  .find((s) => s.id === e.target.value)
                if (sample?.visual) updateSlide({ visual: structuredClone(sample.visual) })
              }}
            >
              <option value="">Выберите образец, затем измените параметры ниже</option>
              {course.lectures.flatMap((l) =>
                l.slides
                  .filter((s) => s.visual)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.visual!.type}: {s.title}
                    </option>
                  )),
              )}
            </select>
          </label>
          <label>
            Добавить или заменить задание
            <select
              value=""
              onChange={(e) => e.target.value && addTask(e.target.value as Task['type'])}
            >
              <option value="">Выберите тип</option>
              <option value="single">Один ответ</option>
              <option value="multiple">Несколько ответов</option>
              <option value="short">Краткий ответ</option>
              <option value="matching">Соответствия</option>
            </select>
          </label>
          {slide.task && (
            <fieldset>
              <legend>Задание {slide.task.id}</legend>
              <label>
                Вопрос
                <textarea
                  value={slide.task.prompt}
                  onChange={(e) =>
                    updateSlide({ task: { ...slide.task!, prompt: e.target.value } })
                  }
                />
              </label>
              {slide.task.options?.map((o, i) => (
                <label key={o.id}>
                  Вариант {o.id}
                  <input
                    value={o.text}
                    onChange={(e) =>
                      updateSlide({
                        task: {
                          ...slide.task!,
                          options: slide.task!.options!.map((x, j) =>
                            i === j ? { ...x, text: e.target.value } : x,
                          ),
                        },
                      })
                    }
                  />
                </label>
              ))}
              {slide.task.items?.map((o, i) => (
                <label key={o.id}>
                  Элемент {o.id}
                  <input
                    value={o.text}
                    onChange={(e) =>
                      updateSlide({
                        task: {
                          ...slide.task!,
                          items: slide.task!.items!.map((x, j) =>
                            i === j ? { ...x, text: e.target.value } : x,
                          ),
                        },
                      })
                    }
                  />
                </label>
              ))}
              {slide.task.type === 'multiple' && (
                <label>
                  Число верных вариантов
                  <input
                    type="number"
                    min="2"
                    max="5"
                    value={slide.task.choose}
                    onChange={(e) =>
                      updateSlide({ task: { ...slide.task!, choose: Number(e.target.value) } })
                    }
                  />
                </label>
              )}
              {key && (
                <>
                  <label>
                    Объяснение ответа
                    <textarea
                      value={key.explanation}
                      onChange={(e) =>
                        commit({
                          ...d,
                          keys: {
                            ...d.keys,
                            [slide.task!.id]: { ...key, explanation: e.target.value },
                          },
                        })
                      }
                    />
                  </label>
                  {key.correct && (
                    <label>
                      ID верных вариантов через запятую
                      <input
                        value={key.correct.join(',')}
                        onChange={(e) =>
                          commit({
                            ...d,
                            keys: {
                              ...d.keys,
                              [slide.task!.id]: {
                                ...key,
                                correct: e.target.value
                                  .split(',')
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              },
                            },
                          })
                        }
                      />
                    </label>
                  )}
                  {key.accepted && (
                    <label>
                      Допустимые ответы через точку с запятой
                      <input
                        value={key.accepted.join(';')}
                        onChange={(e) =>
                          commit({
                            ...d,
                            keys: {
                              ...d.keys,
                              [slide.task!.id]: {
                                ...key,
                                accepted: e.target.value
                                  .split(';')
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              },
                            },
                          })
                        }
                      />
                    </label>
                  )}
                  {key.numeric && (
                    <>
                      <label>
                        Числовой ответ
                        <input
                          type="number"
                          value={key.numeric.value}
                          onChange={(e) =>
                            commit({
                              ...d,
                              keys: {
                                ...d.keys,
                                [slide.task!.id]: {
                                  ...key,
                                  numeric: { ...key.numeric!, value: Number(e.target.value) },
                                },
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Допуск
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={key.numeric.tolerance}
                          onChange={(e) =>
                            commit({
                              ...d,
                              keys: {
                                ...d.keys,
                                [slide.task!.id]: {
                                  ...key,
                                  numeric: { ...key.numeric!, tolerance: Number(e.target.value) },
                                },
                              },
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  {key.pairs &&
                    Object.entries(key.pairs).map(([id, value]) => (
                      <label key={id}>
                        Соответствие {id}
                        <select
                          value={value}
                          onChange={(e) =>
                            commit({
                              ...d,
                              keys: {
                                ...d.keys,
                                [slide.task!.id]: {
                                  ...key,
                                  pairs: { ...key.pairs, [id]: e.target.value },
                                },
                              },
                            })
                          }
                        >
                          {slide.task!.options!.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.text}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                </>
              )}
            </fieldset>
          )}
          <details>
            <summary>Расширенные параметры слайда и инфографики</summary>
            <button
              className="button ghost"
              onClick={() => setAdvanced(JSON.stringify(slide, null, 2))}
            >
              Загрузить параметры
            </button>
            <textarea
              aria-label="Параметры слайда JSON"
              rows={14}
              value={advanced}
              onChange={(e) => setAdvanced(e.target.value)}
            />
            <button
              className="button ghost"
              onClick={() =>
                act(() => {
                  const s = JSON.parse(advanced)
                  if (s.id !== slide.id) throw Error('Сохраните ID слайда')
                  const c = {
                    ...d.course,
                    lectures: d.course.lectures.map((x) =>
                      x.id === l.id
                        ? { ...x, slides: x.slides.map((x) => (x.id === slide.id ? s : x)) }
                        : x,
                    ),
                  }
                  validateCourse(c)
                  updateCourse(c)
                })
              }
            >
              Применить параметры
            </button>
          </details>
          <button
            className="button primary"
            onClick={() =>
              act(() => {
                validateCourse(d.course)
                setPreview(true)
                setNotice('Предпросмотр обновлён')
              })
            }
          >
            Предпросмотр слайда
          </button>
          {preview && (
            <div className="editor-preview">
              <SlideView
                course={d.course}
                lecture={l}
                slide={slide}
                number={l.slides.indexOf(slide) + 1}
                base={base}
                profile={{ fullName: '', position: '', department: '' }}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
