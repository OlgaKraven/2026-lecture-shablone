import { createRoot } from 'react-dom/client'
import { LectureSite, validateCourse } from './engine'
import { Recovery } from './engine/Recovery'
const root = createRoot(document.getElementById('root')!)
async function load() {
  root.render(<p role="status">Загружаем курс…</p>)
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}course.json`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw Error('Не удалось загрузить курс: ' + response.status)
    const course = await response.json()
    validateCourse(course)
    document.title = `${course.code} · ${course.discipline}`
    root.render(
      <Recovery>
        <LectureSite course={course} base={import.meta.env.BASE_URL} />
      </Recovery>,
    )
  } catch (error) {
    root.render(
      <main className="error-screen">
        <h1>Курс не загрузился</h1>
        <p role="alert">{String(error)}</p>
        <p>
          Проверьте подключение. Для занятий без сети заранее сохраните курс через «Инструменты
          курса».
        </p>
        <button onClick={() => void load()}>Повторить загрузку</button>
      </main>,
    )
  }
}
void load()
