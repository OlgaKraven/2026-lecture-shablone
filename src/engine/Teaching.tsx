import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FolderOpen,
  Maximize,
  MonitorPlay,
  MousePointer2,
  Pause,
  Play,
  Square,
  X,
} from 'lucide-react'
import type { Course, Lecture, Note, Profile, TeacherPack } from './model'
import { usePanelLayout } from './PanelLayout'
import { emptyNote } from './model'
import { validateTeacherPack } from './validation'
import { TimingPlan } from './TimingPlan'
import { slideText } from './CourseTools'
import { SlideView } from './SlideView'
import { createBus, newer } from './session'
import type { PublicState } from './session'
import { AssessmentProvider, AssessmentSync } from './Assessment'
import type { Attempt } from './Assessment'
import { downloadJson, read, save } from './storage'
type Props = {
  course: Course
  lecture: Lecture
  base: string
  profile: Profile
  mode: 'presenter' | 'audience'
  session: string
  initialSlide: string
  onExit: () => void
}
export default function Teaching(props: Props) {
  return props.mode === 'audience' ? (
    <Audience {...props} />
  ) : (
    <AssessmentProvider course={props.course} base={props.base}>
      <Presenter {...props} />
    </AssessmentProvider>
  )
}
function Audience({ course, lecture, base, session, profile }: Props) {
  const [state, setState] = useState<PublicState | null>(null)
  const current = useRef<PublicState | null>(null)
  const [full, setFull] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen)
        throw Error('unsupported')
      await document.documentElement.requestFullscreen()
      setFullscreenError('')
    } catch {
      setFullscreenError(
        'Браузер не разрешил полноэкранный показ. Откройте занятие в обычной вкладке Chrome или Edge и нажмите «На весь экран» в окне аудитории. В отдельном браузере также можно нажать F11.',
      )
    }
  }
  useEffect(() => {
    const listener = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', listener)
    return () => document.removeEventListener('fullscreenchange', listener)
  }, [])
  useEffect(() => {
    const bus = createBus(
      { course: course.id, lecture: lecture.id, version: course.contentVersion, base, session },
      (m) => {
        if (
          m.type === 'STATE' &&
          m.state &&
          lecture.slides.some((s) => s.id === m.state!.slideId)
        ) {
          if (newer(m.state, current.current)) {
            current.current = m.state
            setState(m.state)
          }
          bus.send({ type: 'ACK', epoch: m.state.epoch, sequence: m.state.sequence })
        }
        if (m.type === 'END') {
          setState((s) => (s ? { ...s, black: true } : s))
        }
      },
    )
    bus.send({ type: 'HELLO' })
    const timer = setInterval(() => bus.send({ type: 'HELLO' }), 2000)
    return () => {
      clearInterval(timer)
      bus.close()
    }
  }, [course.id, course.contentVersion, lecture, base, session])
  const i = state ? lecture.slides.findIndex((s) => s.id === state.slideId) : -1
  return (
    <main className={`audience-shell ${state?.animations ? 'motion-on' : ''}`}>
      {state && i >= 0 && !state.black ? (
        <div className="audience-slide" key={`${state.slideId}:${state.replay}`}>
          <AssessmentProvider course={course} base={base} readonly snapshot={state.assessment}>
            <SlideView
              course={course}
              lecture={lecture}
              slide={lecture.slides[i]}
              profile={state.profile || profile}
              base={base}
              number={i + 1}
              interactive
            />
          </AssessmentProvider>
          {state.pointer && (
            <span
              className="laser-pointer"
              style={{ left: `${state.pointer.x * 100}%`, top: `${state.pointer.y * 100}%` }}
            />
          )}
        </div>
      ) : (
        <div className="black-screen" />
      )}
      {!full && (
        <button className="audience-fullscreen button secondary" onClick={enterFullscreen}>
          <Maximize size={18} />
          На весь экран
        </button>
      )}
      {fullscreenError && !full && (
        <div className="audience-fullscreen-error" role="alert">
          {fullscreenError}
          <button className="button secondary" onClick={() => setFullscreenError('')}>
            Закрыть
          </button>
        </div>
      )}
    </main>
  )
}
function Presenter({ course, lecture, base, profile, session, initialSlide, onExit }: Props) {
  const storageKey = `lecture:${base}:${course.id}:private:${course.contentVersion}`
  const layout = usePanelLayout(`lecture:${base}:${course.id}:panel-layout`)
  const sessionKey = `lecture-session:${session}`
  const [pendingNotes, setPendingNotes] = useState<{
    notes: Record<string, Note>
    old: boolean
    skipped: number
  } | null>(null)
  const [notesSaved, setNotesSaved] = useState(true)
  const [notes, setNotes] = useState<Record<string, Note>>(() => read(storageKey, {}))
  const [shown, setShown] = useState(() =>
    read(sessionKey, { slideId: initialSlide, black: false }),
  )
  const [selected, setSelected] = useState(shown.slideId)
  const [black, setBlack] = useState(shown.black)
  const [replay, setReplay] = useState(0)
  const [pointerEnabled, setPointerEnabled] = useState(false)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [assessment, setAssessment] = useState<Record<string, Attempt>>({})
  const receiveAssessment = useCallback(
    (value: Record<string, Attempt>) => setAssessment(value),
    [],
  )
  const [status, setStatus] = useState('Ожидание окна аудитории')
  const [locked, setLocked] = useState(false)
  const [notice, setNotice] = useState('')
  const [fontSize, setFontSize] = useState(19)
  const [edit, setEdit] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'script' | 'preparation' | 'notebook' | 'questions' | 'answer'>(
    'script',
  )
  const [timing, setTiming] = useState<{ start: number; elapsed: number; paused: boolean }>(() =>
    read(`${sessionKey}:timer`, { start: Date.now(), elapsed: 0, paused: false }),
  )
  const [now, setNow] = useState(Date.now())
  const busRef = useRef<ReturnType<typeof createBus> | null>(null)
  const stateRef = useRef<PublicState>({
    slideId: shown.slideId,
    black,
    animations: true,
    replay,
    profile,
    epoch: Date.now(),
    sequence: 1,
  })
  const lastAck = useRef(0)
  const popup = useRef<Window | null>(
    (window as Window & { lectureAudience?: Window | null }).lectureAudience || null,
  )
  const importRef = useRef<HTMLInputElement>(null)
  const shownIndex = Math.max(
    0,
    lecture.slides.findIndex((s) => s.id === shown.slideId),
  )
  const selectedSlide = lecture.slides.find((s) => s.id === selected) || lecture.slides[shownIndex]
  const note = notes[selectedSlide.id] || emptyNote()
  const change = (id: string) => {
    setShown({ slideId: id, black })
    setSelected(id)
  }
  const move = (delta: number) =>
    change(lecture.slides[Math.max(0, Math.min(lecture.slides.length - 1, shownIndex + delta))].id)
  useEffect(() => {
    let release: () => void = () => {}
    let cancelled = false
    if (navigator.locks) {
      navigator.locks
        .request(`lecture-presenter:${base}:${session}`, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            setNotice(
              'Для этого сеанса уже открыта панель преподавателя. Вернитесь в неё или начните новое занятие.',
            )
            return
          }
          if (cancelled) return
          setLocked(true)
          await new Promise<void>((r) => {
            release = r
          })
        })
        .catch(() => setNotice('Не удалось закрепить управление сеансом. Перезапустите занятие.'))
    } else {
      setNotice(
        'Браузер не поддерживает защиту от двух ведущих. Откройте занятие в современном браузере.',
      )
    }
    return () => {
      cancelled = true
      release()
    }
  }, [base, session])
  useEffect(() => {
    if (!locked) return
    const bus = createBus(
      { course: course.id, lecture: lecture.id, version: course.contentVersion, base, session },
      (m) => {
        if (m.type === 'HELLO') bus.send({ type: 'STATE', state: stateRef.current })
        if (
          m.type === 'ACK' &&
          m.epoch === stateRef.current.epoch &&
          m.sequence === stateRef.current.sequence
        ) {
          lastAck.current = Date.now()
          setStatus('Синхронизировано')
        }
      },
    )
    busRef.current = bus
    bus.setPeer(popup.current)
    bus.send({ type: 'STATE', state: stateRef.current })
    const timer = setInterval(() => {
      if (popup.current?.closed) setStatus('Окно аудитории закрыто')
      else if (Date.now() - lastAck.current > 6000) setStatus('Ожидание окна аудитории')
      bus.send({ type: 'STATE', state: stateRef.current })
    }, 1800)
    return () => {
      clearInterval(timer)
      bus.close()
      busRef.current = null
    }
  }, [locked, course.id, course.contentVersion, lecture.id, base, session])
  useEffect(() => {
    stateRef.current = {
      ...stateRef.current,
      slideId: shown.slideId,
      black,
      replay,
      profile,
      assessment,
      pointer: pointerEnabled ? pointer : null,
      sequence: stateRef.current.sequence + 1,
    }
    save(sessionKey, { slideId: shown.slideId, black })
    setStatus('Синхронизация…')
    busRef.current?.send({ type: 'STATE', state: stateRef.current })
  }, [shown.slideId, black, replay, profile, sessionKey, assessment, pointer, pointerEnabled])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    save(`${sessionKey}:timer`, timing)
  }, [timing, sessionKey])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !locked ||
        (e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable]')
      )
        return
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault()
        move(1)
      }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        move(-1)
      }
      if (e.key === 'Home') change(lecture.slides[0].id)
      if (e.key === 'End') change(lecture.slides.at(-1)!.id)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [shownIndex, lecture, black, locked])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!notesSaved) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [notesSaved])
  const update = (value: Partial<Note>) => {
    const next = { ...notes, [selectedSlide.id]: { ...note, ...value } }
    setNotes(next)
    const ok = save(storageKey, next)
    setNotesSaved(ok)
    if (!ok) setNotice('Не удалось сохранить заметки в браузере. Скачайте файл заметок.')
  }
  const elapsed = timing.elapsed + (timing.paused ? 0 : now - timing.start)
  const toggleTimer = () =>
    setTiming((t) =>
      t.paused
        ? { ...t, start: Date.now(), paused: false }
        : { start: Date.now(), elapsed: t.elapsed + Date.now() - t.start, paused: true },
    )
  const reopen = () => {
    const u = new URL(location.href)
    u.search = new URLSearchParams({ mode: 'audience', lecture: lecture.id, session }).toString()
    popup.current = window.open(u, `audience-${session}`)
    busRef.current?.setPeer(popup.current)
    if (!popup.current)
      setNotice(
        'Браузер заблокировал окно. Разрешите всплывающие окна и нажмите «Открыть аудиторию» снова.',
      )
  }
  const copyAudience = async () => {
    const u = new URL(location.href)
    u.search = new URLSearchParams({ mode: 'audience', lecture: lecture.id, session }).toString()
    try {
      await navigator.clipboard.writeText(u.href)
      setNotice(
        'Ссылка аудитории скопирована. Откройте её в новой обычной вкладке этого же браузера.',
      )
    } catch {
      setNotice(`Ссылка аудитории: ${u.href}`)
    }
  }
  const importNotes = async (file: File) => {
    try {
      const pack = JSON.parse(await file.text()) as TeacherPack
      validateTeacherPack(pack, course, true)
      const allIds = new Set(course.lectures.flatMap((l) => l.slides.map((s) => s.id)))
      const entries = Object.entries(pack.notes)
      setPendingNotes({
        notes: Object.fromEntries(entries.filter(([id]) => allIds.has(id))),
        old: pack.contentVersion !== course.contentVersion,
        skipped: entries.filter(([id]) => !allIds.has(id)).length,
      })
    } catch (e) {
      setNotice(String(e))
    }
  }
  const end = () => {
    if (!notesSaved && !window.confirm('Заметки не сохранены. Завершить занятие?')) return
    busRef.current?.send({ type: 'END' })
    popup.current?.close()
    onExit()
  }
  const tabNames = {
    script: 'Сценарий',
    preparation: 'Подготовка',
    notebook: 'Запись',
    questions: 'Вопросы',
    answer: 'Ответы',
  }
  return (
    <main className="presenter-shell">
      <AssessmentSync task={lecture.slides[shownIndex].task} onChange={receiveAssessment} />
      <header className="presenter-header">
        <div>
          <p className="eyebrow">Панель преподавателя</p>
          <h1>{lecture.title}</h1>
        </div>
        <span
          className={`connection ${status === 'Синхронизировано' ? 'connected' : ''}`}
          role="status"
        >
          {status}
        </span>
        <button className="button ghost" onClick={end}>
          <X size={18} />
          Завершить
        </button>
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button className="text-button" onClick={() => setNotice('')}>
            Закрыть
          </button>
        </div>
      )}
      {pendingNotes && (
        <section className="import-preview">
          <h2>Импорт сценария</h2>
          <p>
            Будут добавлены или заменены заметки: {Object.keys(pendingNotes.notes).length}.
            Пропущены удалённые слайды: {pendingNotes.skipped}.
          </p>
          {pendingNotes.old && (
            <p>
              Сценарий другой версии. Совпадение ID не гарантирует совпадения содержания: после
              переноса проверьте каждую заметку.
            </p>
          )}
          <button
            className="button primary"
            onClick={() => {
              const next = { ...notes, ...pendingNotes.notes }
              if (!save(storageKey, next)) {
                setNotice('Не удалось сохранить заметки')
                return
              }
              setNotes(next)
              setNotesSaved(true)
              setPendingNotes(null)
              setNotice('Заметки импортированы.')
            }}
          >
            Применить заметки
          </button>
          <button className="button ghost" onClick={() => setPendingNotes(null)}>
            Отмена
          </button>
        </section>
      )}
      <div className="presenter-layout-help">
        <span>
          Перетащите границы между панелями, чтобы изменить ширину. Аудиторию можно вынести из
          вкладки на второй монитор.
        </span>
        <button className="text-button" onClick={layout.reset}>
          Сбросить размеры
        </button>
      </div>
      <div className="presenter-grid" ref={layout.grid} style={layout.style}>
        <section className="presenter-preview">
          <div className="preview-label">
            <strong>Сейчас у аудитории</strong>
            <span>
              {shownIndex + 1} / {lecture.slides.length}
              {black ? ' · чёрный экран' : ''}
            </span>
          </div>
          <div
            className={`mini-stage ${black ? 'preview-black' : ''}`}
            onPointerMove={(e) => {
              if (pointerEnabled) {
                const r = e.currentTarget.getBoundingClientRect()
                setPointer({
                  x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
                  y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
                })
              }
            }}
            onPointerLeave={() => setPointer(null)}
          >
            <SlideView
              course={course}
              lecture={lecture}
              slide={lecture.slides[shownIndex]}
              profile={profile}
              base={base}
              number={shownIndex + 1}
              interactive
            />
            {pointerEnabled && pointer && (
              <span
                className="laser-pointer"
                style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}
              />
            )}
          </div>
          <div className="presenter-controls">
            <button
              className="button secondary"
              disabled={!locked || shownIndex === 0}
              onClick={() => move(-1)}
            >
              <ArrowLeft size={17} />
              Назад
            </button>
            <button
              className="button primary"
              disabled={!locked || shownIndex === lecture.slides.length - 1}
              onClick={() => move(1)}
            >
              Вперёд
              <ArrowRight size={17} />
            </button>
            <button
              className="button secondary"
              aria-pressed={black}
              disabled={!locked}
              onClick={() => setBlack(!black)}
            >
              <Square size={16} />
              {black ? 'Вернуть слайд' : 'Чёрный экран'}
            </button>
          </div>
          <div className="preview-label">
            <strong>Далее</strong>
            <span>{lecture.slides[shownIndex + 1]?.title || 'Последний слайд'}</span>
          </div>
          {lecture.slides[shownIndex + 1] && (
            <div className="mini-stage next-stage">
              <SlideView
                course={course}
                lecture={lecture}
                slide={lecture.slides[shownIndex + 1]}
                profile={profile}
                base={base}
                number={shownIndex + 2}
              />
            </div>
          )}
          <div className="session-tools">
            <button
              className="button ghost"
              aria-pressed={pointerEnabled}
              onClick={() => {
                setPointerEnabled(!pointerEnabled)
                setPointer(null)
              }}
            >
              <MousePointer2 size={17} />
              Указка
            </button>
            <button className="button ghost" disabled={!locked} onClick={reopen}>
              <MonitorPlay size={17} />
              Открыть аудиторию
            </button>
            <button
              className="button ghost"
              disabled={!locked}
              onClick={() => setReplay(replay + 1)}
            >
              Повтор анимации
            </button>
            <button className="button ghost" onClick={copyAudience}>
              Скопировать ссылку аудитории
            </button>
          </div>
          <div className="timer">
            <strong>
              {String(Math.floor(elapsed / 60000)).padStart(2, '0')}:
              {String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}
            </strong>
            <button
              className="icon-button"
              aria-label={timing.paused ? 'Продолжить таймер' : 'Приостановить таймер'}
              onClick={toggleTimer}
            >
              {timing.paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <span>
              Ориентир для выбранного слайда: {Math.round((note.estimatedSeconds / 60) * 10) / 10}{' '}
              мин
            </span>
          </div>
          <TimingPlan
            lecture={lecture}
            notes={notes}
            index={shownIndex}
            elapsed={elapsed}
            sessionKey={sessionKey}
            onPause={() => {
              if (!timing.paused) toggleTimer()
            }}
          />
        </section>
        {layout.separator(0)}
        <section className="presenter-notes">
          <div className="notes-heading">
            <div>
              <p className="eyebrow">
                {selected !== shown.slideId ? 'Подготовительный просмотр' : 'Текущий слайд'}
              </p>
              <h2>{selectedSlide.title}</h2>
            </div>
            <button className="button ghost" onClick={() => setEdit(!edit)}>
              {edit ? 'Читать' : 'Редактировать'}
            </button>
          </div>
          {selected !== shown.slideId && (
            <button className="button primary" disabled={!locked} onClick={() => change(selected)}>
              Показать аудитории
            </button>
          )}
          <div className="note-tabs" role="tablist" aria-label="Разделы заметок">
            {Object.entries(tabNames).map(([k, v]) => (
              <button
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? 'active' : ''}
                key={k}
                onClick={() => setTab(k as typeof tab)}
              >
                {v}
              </button>
            ))}
          </div>
          <label className="note-font">
            Размер текста
            <input
              type="range"
              min="16"
              max="30"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </label>
          {edit ? (
            <textarea
              className="note-editor"
              aria-label={`Редактировать: ${tabNames[tab]}`}
              style={{ fontSize }}
              value={note[tab]}
              onChange={(e) => update({ [tab]: e.target.value })}
              placeholder="Добавьте текст для этого слайда"
            />
          ) : (
            <div className="note-reader" role="tabpanel" style={{ fontSize }}>
              {note[tab] || (
                <div className="notes-empty">
                  <h3>Заметки ещё не добавлены</h3>
                  <p>
                    Загрузите файл сценария или нажмите «Редактировать». Текст сохраняется на этом
                    устройстве и не передаётся в окно аудитории.
                  </p>
                </div>
              )}
            </div>
          )}
          <div className="notes-files">
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importNotes(f)
                e.target.value = ''
              }}
            />
            <button className="button ghost" onClick={() => importRef.current?.click()}>
              <FolderOpen size={17} />
              Загрузить заметки
            </button>
            <button
              className="button ghost"
              onClick={() =>
                downloadJson(`${course.id}-teacher-notes.json`, {
                  schemaVersion: 1,
                  courseId: course.id,
                  contentVersion: course.contentVersion,
                  notes,
                })
              }
            >
              <Download size={17} />
              Сохранить заметки
            </button>
          </div>
          <label className="notes-duration">
            Расчётное время, секунд
            <input
              type="number"
              min="0"
              value={note.estimatedSeconds}
              onChange={(e) => update({ estimatedSeconds: Math.max(0, Number(e.target.value)) })}
            />
          </label>
        </section>
        {layout.separator(1)}
        <aside className="presenter-outline">
          <label className="search-field">
            <input
              placeholder="Найти слайд"
              aria-label="Найти слайд"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <ol className="toc-list">
            {lecture.slides
              .map((s, i) => ({ s, i }))
              .filter(({ s }) => slideText(s).includes(search.toLowerCase()))
              .map(({ s, i }) => (
                <li key={s.id}>
                  <button
                    aria-current={s.id === selected ? 'step' : undefined}
                    onClick={() => setSelected(s.id)}
                  >
                    <b>{String(i + 1).padStart(2, '0')}</b>
                    {s.title}
                  </button>
                </li>
              ))}
          </ol>
        </aside>
      </div>
    </main>
  )
}
