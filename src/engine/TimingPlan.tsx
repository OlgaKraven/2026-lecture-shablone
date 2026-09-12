import { useEffect, useState } from 'react'
import type { Lecture, Note } from './model'
import { emptyNote } from './model'
import { read, save } from './storage'
export function TimingPlan({
  lecture,
  notes,
  index,
  elapsed,
  sessionKey,
  onPause,
}: {
  lecture: Lecture
  notes: Record<string, Note>
  index: number
  elapsed: number
  sessionKey: string
  onPause: () => void
}) {
  const [minutes, setMinutes] = useState(5)
  const [end, setEnd] = useState<number | null>(() => read(`${sessionKey}:break`, null))
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    save(`${sessionKey}:break`, end)
  }, [sessionKey, end])
  const duration = (id: string) => notes[id]?.estimatedSeconds ?? emptyNote().estimatedSeconds
  const sections: { title: string; start: number; seconds: number }[] = []
  lecture.slides.forEach((s, i) => {
    if (!sections.length || s.kind === 'section')
      sections.push({ title: s.title, start: i, seconds: 0 })
    sections.at(-1)!.seconds += duration(s.id)
  })
  const total = sections.reduce((n, s) => n + s.seconds, 0)
  const plannedThrough = lecture.slides.slice(0, index + 1).reduce((n, s) => n + duration(s.id), 0)
  const late = Math.max(0, Math.floor(elapsed / 1000 - plannedThrough))
  const remaining = end ? Math.max(0, Math.ceil((end - now) / 1000)) : 0
  return (
    <section className="timing-plan">
      <h3>План занятия</h3>
      <p>
        План: {Math.round(total / 60)} мин · прошло: {Math.floor(elapsed / 60000)} мин
      </p>
      {late > 60 && <p role="status">Отставание от плана: {Math.ceil(late / 60)} мин</p>}
      <details>
        <summary>Время по разделам</summary>
        <ul>
          {sections.map((s) => (
            <li key={s.start}>
              {s.title}: {Math.round((s.seconds / 60) * 10) / 10} мин
            </li>
          ))}
        </ul>
      </details>
      <label>
        Перерыв, минут
        <input
          type="number"
          min="1"
          max="120"
          value={minutes}
          onChange={(e) => setMinutes(Math.min(120, Math.max(1, Number(e.target.value))))}
        />
      </label>
      <button
        className="button ghost"
        onClick={() => {
          onPause()
          setEnd(Date.now() + minutes * 60000)
        }}
      >
        Начать перерыв
      </button>
      {end !== null && (
        <>
          <p role="status">
            {remaining
              ? `До конца перерыва: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
              : 'Перерыв закончился. Продолжите таймер занятия.'}
          </p>
          <button className="button ghost" onClick={() => setEnd(null)}>
            Завершить перерыв
          </button>
        </>
      )}
    </section>
  )
}
