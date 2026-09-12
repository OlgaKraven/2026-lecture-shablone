import { useState } from 'react'
import type { Course, Slide } from './model'
import { assetUrl } from './model'
import { courseAssets, readiness, validateBank, validateTeacherPack } from './validation'
import { Modal } from './Modal'
import { downloadJson, read, save } from './storage'
import { applyBackup, exportBackup, prepareBackup } from './backup'
import { offlineCommand } from './offline'
import { useMobile } from './responsive'

export function slideText(s: Slide) {
  const collect = (x: unknown): string =>
    typeof x === 'string'
      ? x
      : Array.isArray(x)
        ? x.map(collect).join(' ')
        : x && typeof x === 'object'
          ? Object.entries(x)
              .filter(([key]) => key !== 'src')
              .map(([, value]) => collect(value))
              .join(' ')
          : ''
  return collect(s).toLocaleLowerCase('ru')
}
export function StudyButtons({
  course,
  base,
  slide,
}: {
  course: Course
  base: string
  slide: Slide
}) {
  const key = `lecture:${base}:${course.id}:study`
  const [marks, setMarks] = useState<
    Record<string, { done?: boolean; review?: boolean; bookmark?: boolean }>
  >(() => read(key, {}))
  const [error, setError] = useState('')
  return (
    <div className="study-actions" aria-label="Мои отметки">
      {(['done', 'review', 'bookmark'] as const).map((k, i) => (
        <button
          key={k}
          className="button ghost"
          aria-pressed={Boolean(marks[slide.id]?.[k])}
          onClick={() => {
            const next = {
              ...marks,
              [slide.id]: { ...marks[slide.id], [k]: !marks[slide.id]?.[k] },
            }
            setMarks(next)
            if (!save(key, next)) setError('Отметки не сохранились. Сделайте резервную копию.')
          }}
        >
          {['Изучено', 'Повторить', 'Закладка'][i]}
        </button>
      ))}
      {error && <span role="alert">{error}</span>}
    </div>
  )
}
export function CourseTools({
  course,
  base,
  onClose,
  onGo,
}: {
  course: Course
  base: string
  onClose: () => void
  onGo: (lecture: string, slide: string) => void
}) {
  const [tab, setTab] = useState('ready')
  const mobile = useMobile()
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState<string[]>([])
  const [pending, setPending] = useState<ReturnType<typeof prepareBackup> | null>(null)
  const [filter, setFilter] = useState('')
  const [offline, setOffline] = useState<boolean | null>(null)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setNotice('')
    try {
      await action()
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  const check = async () => {
    const results: string[] = []
    const assets = courseAssets(course)
    for (const path of assets) {
      try {
        const response = await fetch(assetUrl(path, base), { signal: AbortSignal.timeout(10000) })
        if (!response.ok) throw Error(String(response.status))
        if (path === course.assessment?.url) validateBank(await response.json(), course)
        else await response.arrayBuffer()
        results.push(`✓ ${path}`)
      } catch (e) {
        results.push(`Ошибка: ${path} — ${String(e)}`)
      }
    }
    try {
      const status = await offlineCommand(base, 'STATUS')
      setOffline(status.ready)
      results.push(status.ready ? '✓ Курс сохранён офлайн' : 'Курс пока не сохранён офлайн')
    } catch {
      results.push('Офлайн недоступен: используйте опубликованную или собранную версию сайта.')
    }
    results.push(
      document.fullscreenEnabled
        ? '✓ Полноэкранный режим поддерживается'
        : 'Полноэкранный режим недоступен',
    )
    results.push(
      navigator.locks ? '✓ Защита от двух ведущих доступна' : 'Защита от двух ведущих недоступна',
    )
    setChecks(results)
  }
  const jump = (id: string) => {
    const l = course.lectures.find((l) => l.slides.some((s) => s.id === id))
    if (l) {
      onGo(l.id, id)
      onClose()
    }
  }
  const marks = read<Record<string, { done?: boolean; review?: boolean; bookmark?: boolean }>>(
    `lecture:${base}:${course.id}:study`,
    {},
  )
  const attempts = read<Record<string, { result?: { status: string } }>>(
    `lecture:${base}:${course.id}:${course.contentVersion}:attempts`,
    {},
  )
  return (
    <Modal title="Инструменты курса" onClose={onClose}>
      <nav className="tools-tabs" aria-label="Раздел инструментов">
        {Object.entries({
          ready: 'Готовность',
          backup: 'Резервная копия',
          study: 'Моё обучение',
          glossary: 'Глоссарий',
          map: 'Карта курса',
        }).map(([id, label]) => (
          <button
            className="button ghost"
            aria-pressed={tab === id}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice && <p role="status">{notice}</p>}
      {tab === 'ready' && (
        <section>
          <h3>Готовность к публикации</h3>
          {readiness(course).length ? (
            <ul>
              {readiness(course).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p>Обязательные разделы заполнены. Методическую проверку выполняет автор курса.</p>
          )}
          <h3>Проверка перед занятием</h3>
          <button className="button primary" disabled={busy} onClick={() => void run(check)}>
            {busy ? 'Проверяем…' : 'Проверить файлы и возможности'}
          </button>
          <button
            className="button ghost"
            onClick={() => {
              const popup = window.open('about:blank', 'lecture-preflight', 'width=480,height=240')
              if (popup) {
                popup.close()
                setNotice(
                  'Второе окно открывается. Перенос на проектор проверьте перед началом занятия.',
                )
              } else
                setNotice('Второе окно заблокировано. Разрешите всплывающие окна для этого сайта.')
            }}
          >
            Проверить второе окно
          </button>
          <ul>
            {checks.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <label className="file-control">
            Проверить файл сценария
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f)
                  void run(async () => {
                    const pack = JSON.parse(await f.text())
                    validateTeacherPack(pack, course)
                    const missing = course.lectures.flatMap((l) =>
                      l.slides.filter((s) => !pack.notes[s.id]?.script?.trim()).map((s) => s.id),
                    )
                    setNotice(
                      missing.length
                        ? `Нет сценария: ${missing.join(', ')}`
                        : 'Сценарий соответствует версии, все слайды заполнены.',
                    )
                  })
                e.target.value = ''
              }}
            />
          </label>
          <h3>Без интернета</h3>
          <p>
            {offline === true
              ? 'Курс доступен офлайн.'
              : offline === false
                ? 'Курс ещё не подготовлен.'
                : 'Проверьте или скачайте курс для офлайн-занятия.'}{' '}
            Внешние сайты и папки материалов требуют подключения.
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await offlineCommand(base, 'PREPARE')
                setOffline(result.ready)
                setNotice(`Сохранено файлов: ${result.count}. Курс доступен без интернета.`)
              })
            }
          >
            Скачать курс для офлайн
          </button>
          <button
            className="button ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await offlineCommand(base, 'REMOVE')
                setOffline(false)
                setNotice('Офлайн-копия удалена.')
              })
            }
          >
            Удалить офлайн-копию
          </button>
        </section>
      )}
      {tab === 'backup' && (
        <section>
          <p>
            Копия содержит настройки, отметки и результаты этого курса. Сценарии преподавателя
            сохраняются отдельно в панели занятия.
          </p>
          <button
            className="button primary"
            onClick={() => {
              try {
                downloadJson(`${course.id}-backup.json`, exportBackup(course, base, localStorage))
              } catch (e) {
                setNotice(String(e))
              }
            }}
          >
            Скачать резервную копию
          </button>
          <label className="file-control">
            Выбрать резервную копию
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f)
                  void run(async () =>
                    setPending(prepareBackup(JSON.parse(await f.text()), course)),
                  )
                e.target.value = ''
              }}
            />
          </label>
          {pending && (
            <section className="import-preview">
              <h3>Предварительный просмотр</h3>
              <p>
                Будут заменены разделы: {Object.keys(pending.entries).join(', ') || 'нет'}.
                Пропущено записей: {pending.skipped}.
              </p>
              {pending.oldVersion && (
                <p>
                  Другая версия курса: результаты самопроверки не переносятся, поскольку могли
                  измениться правильные ответы. Позиция чтения переносится для неизменённых слайдов.
                </p>
              )}
              <button
                className="button primary"
                onClick={() => {
                  try {
                    applyBackup(pending.entries, course, base, localStorage)
                    location.reload()
                  } catch (e) {
                    setNotice('Не удалось восстановить копию: ' + String(e))
                  }
                }}
              >
                Восстановить выбранные данные
              </button>
              <button className="button ghost" onClick={() => setPending(null)}>
                Отмена
              </button>
            </section>
          )}
        </section>
      )}
      {tab === 'study' && (
        <section>
          <label>
            Показать
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">{mobile ? 'Все отметки' : 'Все отметки и ошибки'}</option>
              <option value="bookmark">Закладки</option>
              <option value="review">Повторить</option>
              <option value="done">Изучено</option>
              {!mobile && <option value="errors">Ошибки самопроверки</option>}
            </select>
          </label>
          <ul className="result-list">
            {course.lectures.flatMap((l) =>
              l.slides
                .filter((s) => {
                  const m = marks[s.id]
                  const wrong =
                    !mobile && s.task && attempts[s.task.id]?.result?.status === 'incorrect'
                  return filter === 'errors'
                    ? wrong
                    : filter
                      ? m?.[filter as keyof typeof m]
                      : m?.done || m?.review || m?.bookmark || wrong
                })
                .map((s) => (
                  <li key={s.id}>
                    <button className="text-button" onClick={() => jump(s.id)}>
                      {l.title} · {s.title}
                    </button>
                    {!mobile && s.task && attempts[s.task.id]?.result?.status === 'incorrect' && (
                      <button
                        className="button ghost"
                        onClick={() => {
                          const before = l.slides
                            .slice(0, l.slides.indexOf(s))
                            .reverse()
                            .find((x) => !['test', 'section', 'title'].includes(x.kind))
                          jump(before?.id || s.id)
                        }}
                      >
                        Повторить объяснение перед заданием
                      </button>
                    )}
                  </li>
                )),
            )}
          </ul>
          <p>
            Отметки ставятся под слайдом.{!mobile && ' Результаты сохраняются на этом устройстве.'}
          </p>
        </section>
      )}
      {tab === 'glossary' && (
        <section>
          <label>
            Найти термин
            <input value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          {!course.glossary?.length && (
            <p>Автор пока не добавил термины. Глоссарий можно заполнить в редакторе курса.</p>
          )}
          <dl>
            {course.glossary
              ?.filter((g) =>
                (g.term + ' ' + g.definition).toLowerCase().includes(filter.toLowerCase()),
              )
              .map((g) => (
                <div key={g.term}>
                  <dt>
                    <strong>{g.term}</strong>
                  </dt>
                  <dd>
                    {g.definition}
                    <div>
                      {g.slideIds.map((id) => (
                        <button key={id} className="text-button" onClick={() => jump(id)}>
                          Слайд {id}
                        </button>
                      ))}
                    </div>
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      )}
      {tab === 'map' && (
        <section>
          <p>
            Связь учебной программы, объяснений и заданий. Официальные результаты и источники
            заполняет автор по РПД.
          </p>
          {!course.curriculum?.length && (
            <p>Карта пока не заполнена. Добавьте её в редакторе курса.</p>
          )}
          {course.curriculum?.map((r, i) => (
            <article key={i}>
              <h3>{r.topic}</h3>
              <p>{r.outcome}</p>
              <p>Источник: {r.source}</p>
              <div>
                {r.slideIds.map((id) => (
                  <button className="text-button" key={id} onClick={() => jump(id)}>
                    Слайд {id}
                  </button>
                ))}
                {r.taskIds.map((id) => {
                  const s = course.lectures.flatMap((l) => l.slides).find((s) => s.task?.id === id)
                  return (
                    <button className="text-button" key={id} onClick={() => s && jump(s.id)}>
                      Задание {id}
                    </button>
                  )
                })}
              </div>
            </article>
          ))}
        </section>
      )}
    </Modal>
  )
}
