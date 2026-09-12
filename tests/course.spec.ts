import { test, expect, type Page } from '@playwright/test'
import { pbkdf2Sync } from 'node:crypto'
import { PNG } from 'pngjs'
import { readFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve, extname, sep } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)))
  page.on('console', (m) => m.type() === 'error' && console.log('BROWSER', m.text()))
  page.on('requestfailed', (r) => console.log('FAILED', r.url(), r.failure()))
})
const course = JSON.parse(readFileSync('public/course.json', 'utf8'))
const first = course.lectures[0]
const taskSlide = first.slides.find((s: any) => s.task?.type === 'single')
const testLogin = { username: 'test-editor', password: 'fixture-only-editor-password' }
async function openEditor(page: Page) {
  await page.route('**/editor-access.json', (route) =>
    route.fulfill({
      json: {
        username: testLogin.username,
        salt: Buffer.from('editor-test-salt').toString('base64'),
        iterations: 210000,
        verifier: pbkdf2Sync(testLogin.password, 'editor-test-salt', 210000, 32, 'sha256').toString(
          'base64',
        ),
      },
    }),
  )
  await page.getByRole('button', { name: 'Вход', exact: true }).click()
  await page.getByRole('textbox', { name: 'Логин', exact: true }).fill(testLogin.username)
  await page.getByLabel('Пароль', { exact: true }).fill(testLogin.password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Редактор курса', exact: true })).toBeVisible()
}
test('search finds slide body and direct link restores slide', async ({ page }) => {
  await page.goto('./')
  const s = first.slides.find((s: any) => s.body && s.body.length > 30)
  const term = s.body.slice(0, 25)
  await page.getByRole('textbox', { name: 'Поиск по всему курсу' }).fill(term)
  await page.getByRole('button', { name: s.title, exact: true }).first().click()
  await expect(page).toHaveURL(new RegExp('slide=' + s.id))
  await page.reload()
  await expect(page.locator('.active-slide')).toContainText(s.title)
})
test('study marks survive reload and open from tools', async ({ page }) => {
  await page.goto(`./?lecture=${first.id}&slide=${first.slides[0].id}`)
  await page.getByRole('button', { name: 'Закладка', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Закладка', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Инструменты', exact: true }).click()
  await page.getByRole('button', { name: 'Моё обучение', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(first.title)
})
test('assessment handles wrong answer, retry, correct answer and reload', async ({ page }) => {
  await page.goto(`./?lecture=${first.id}&slide=${taskSlide.id}`)
  await page.getByRole('button', { name: 'Проверить', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Сначала')
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Проверить', exact: true }).click()
  await expect(page.locator('.task-status')).toContainText('Есть ошибка')
  await page.getByRole('button', { name: 'Ещё попытка' }).click()
  await page.getByRole('radio').nth(1).check()
  await page.getByRole('button', { name: 'Проверить', exact: true }).click()
  await expect(page.locator('.task-status')).toContainText('Правильно')
  await page.reload()
  await expect(page.locator('.task-status')).toContainText('Правильно')
})
test('editor autosaves, undo restores and preview renders', async ({ page }) => {
  await page.goto('./')
  await openEditor(page)
  const title = page.getByRole('textbox', { name: 'Заголовок слайда', exact: true })
  const before = await title.inputValue()
  await title.fill('Новый проверочный заголовок')
  await expect(page.getByRole('status').first()).toContainText('Черновик сохранён')
  await page.getByRole('button', { name: 'Предпросмотр слайда', exact: true }).click()
  await expect(page.locator('.editor-preview')).toContainText('Новый проверочный заголовок')
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(title).toHaveValue(before)
  await title.fill('Восстановленный черновик')
  await expect(page.getByRole('status').first()).toContainText('Черновик сохранён')
  await page.reload()
  await openEditor(page)
  await expect(page.getByRole('textbox', { name: 'Заголовок слайда', exact: true })).toHaveValue(
    'Восстановленный черновик',
  )
})
test('editor login rejects wrong credentials and closing requires login again', async ({
  page,
}) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Редактор курса', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Вход', exact: true }).click()
  await page.getByRole('textbox', { name: 'Логин', exact: true }).fill('wrong-user')
  await page.getByLabel('Пароль', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Неверный логин или пароль')
  await expect(page.locator('.editor-shell')).toHaveCount(0)
  await page.getByRole('button', { name: 'Закрыть окно' }).click()
  await openEditor(page)
  await page.getByRole('button', { name: 'Закрыть редактор' }).click()
  await page.getByRole('button', { name: 'Вход', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Вход в редактор' })).toBeVisible()
  await expect(page.locator('.editor-shell')).toHaveCount(0)
})

test('presentation deletion confirms, persists and undo restores slides and references', async ({
  page,
}) => {
  await page.goto('./')
  await openEditor(page)
  const lectures = page.getByRole('combobox', { name: 'Лекция', exact: true })
  const count = await lectures.locator('option').count()
  const initial = await lectures.inputValue()
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: 'Удалить презентацию', exact: true }).click()
  await expect(lectures.locator('option')).toHaveCount(count)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Удалить презентацию', exact: true }).click()
  await expect(lectures.locator('option')).toHaveCount(count - 1)
  const draftKey = `lecture:/2026-lecture-shablone/:${course.id}:editor:${course.contentVersion}`
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).present.course.lectures.length,
        draftKey,
      ),
    )
    .toBe(count - 1)
  const draft = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).present,
    draftKey,
  )
  const removedIds = first.slides.map((s: any) => s.id)
  expect(
    draft.course.glossary
      ?.flatMap((x: any) => x.slideIds)
      .some((id: string) => removedIds.includes(id)),
  ).toBeFalsy()
  await page.reload()
  await openEditor(page)
  await expect(lectures.locator('option')).toHaveCount(count - 1)
  const exported = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Проверить и скачать курс', exact: true }).click()
  const deletedCourse = JSON.parse(readFileSync((await (await exported).path())!, 'utf8'))
  expect(deletedCourse.lectures.some((l: any) => l.id === initial)).toBe(false)
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(lectures.locator('option')).toHaveCount(count)
  await expect(lectures).toHaveValue(initial)
})

test('editor uploads and pastes images, persists them and supports removal and undo', async ({
  page,
}) => {
  await page.goto('./')
  await openEditor(page)
  const raster = new PNG({ width: 120, height: 80 })
  raster.data.fill(180)
  const png = PNG.sync.write(raster)
  await page
    .getByLabel('Загрузить изображение', { exact: true })
    .setInputFiles({ name: 'screenshot.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('.image-editor-preview')).toBeVisible()
  await page.getByLabel('Описание изображения', { exact: true }).fill('Проверочный скриншот')
  await page.getByLabel('Подпись к изображению', { exact: true }).fill('Подпись скриншота')
  await page.getByRole('button', { name: 'Предпросмотр слайда', exact: true }).click()
  await expect(page.locator('.editor-preview').getByAltText('Проверочный скриншот')).toBeVisible()
  await expect(page.locator('.editor-preview figcaption')).toHaveText('Подпись скриншота')
  await expect(page.getByRole('status').first()).toContainText('Черновик сохранён')
  await page.reload()
  await openEditor(page)
  await expect(page.locator('.image-editor-preview')).toHaveAttribute('alt', 'Проверочный скриншот')
  const exported = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Проверить и скачать курс', exact: true }).click()
  const imageCourse = JSON.parse(readFileSync((await (await exported).path())!, 'utf8'))
  expect(imageCourse.lectures[0].slides[0].image.src).toMatch(/^data:image\/(webp|png);base64,/)
  await page.getByRole('button', { name: 'Удалить изображение', exact: true }).click()
  await expect(page.locator('.image-editor-preview')).toHaveCount(0)
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(page.locator('.image-editor-preview')).toBeVisible()
  await page.getByRole('button', { name: 'Удалить изображение', exact: true }).click()
  await page.locator('.image-paste').evaluate(
    (element, bytes) => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], 'clipboard.png', { type: 'image/png' }))
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      )
    },
    [...png],
  )
  await expect(page.locator('.image-editor-preview')).toBeVisible()
  await page
    .getByLabel('Загрузить изображение', { exact: true })
    .setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.getByRole('alert')).toContainText('Выберите PNG, JPEG или WebP')
  await expect(page.locator('.image-editor-preview')).toBeVisible()
})

test('course fetch failure has retry', async ({ page }) => {
  let fail = true
  await page.route('**/course.json', (route) =>
    fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue(),
  )
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Курс не загрузился' })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Повторить загрузку' }).click()
  await expect(page.getByRole('button', { name: 'Вход', exact: true })).toBeVisible()
})
test('backup export and restore preview excludes teacher notes', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(
    ({ id, version }) => {
      localStorage.setItem(
        `lecture:/2026-lecture-shablone/:${id}:private:${version}`,
        JSON.stringify({ script: 'PRIVATE_QA_MARKER_9374' }),
      )
    },
    { id: course.id, version: course.contentVersion },
  )
  await page.getByRole('button', { name: 'Инструменты курса', exact: true }).click()
  await page.getByRole('button', { name: 'Резервная копия', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать резервную копию' }).click()
  const path = await (await download).path()
  const text = readFileSync(path!, 'utf8')
  expect(text).not.toContain('PRIVATE_QA_MARKER_9374')
  await page
    .getByLabel('Выбрать резервную копию')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await expect(page.getByRole('heading', { name: 'Предварительный просмотр' })).toBeVisible()
})
test('two windows sync, restore audience and keep notes private', async ({ page, context }) => {
  await page.goto(`./?lecture=${first.id}&slide=${first.slides[0].id}`)
  const popup = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Начать занятие в двух окнах', exact: true }).click()
  const audience = await popup
  await expect(page.locator('.connection')).toHaveText('Синхронизировано')
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Редактировать: Сценарий' })
    .fill('PRIVATE_QA_MARKER_9374')
  await page.getByRole('button', { name: 'Вперёд', exact: true }).click()
  await expect(audience.locator('.audience-slide')).toContainText(first.slides[1].title)
  await audience.reload()
  await expect(audience.locator('.audience-slide')).toContainText(first.slides[1].title)
  await expect(audience.locator('body')).not.toContainText('PRIVATE_QA_MARKER_9374')
  await page.getByRole('button', { name: 'Чёрный экран', exact: true }).click()
  await expect(audience.locator('.black-screen')).toBeVisible()
  await page.getByRole('button', { name: 'Вернуть слайд', exact: true }).click()
  await expect(audience.locator('.audience-slide')).toBeVisible()
  await audience.close()
  await page.getByRole('button', { name: 'Открыть аудиторию', exact: true }).click()
  await expect.poll(() => context.pages().length).toBe(2)
})
test('offline course reloads and lazy teaching module opens without network', async ({ page }) => {
  // Shut down the actual origin: Playwright's WebKit offline emulation fails before SW dispatch.
  const root = resolve('dist')
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
  }
  const server = createServer((request, response) => {
    try {
      const path = new URL(request.url!, 'http://localhost').pathname.replace(
        /^\/2026-lecture-shablone\//,
        '',
      )
      const file = resolve(root, path || 'index.html')
      if (!file.startsWith(root + sep)) throw Error('invalid path')
      response.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
      })
      response.end(readFileSync(file))
    } catch {
      response.writeHead(404)
      response.end()
    }
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address() as { port: number }
  const origin = `http://127.0.0.1:${address.port}/2026-lecture-shablone/`
  try {
    await page.goto(origin)
    await page.getByRole('button', { name: 'Инструменты курса', exact: true }).click()
    await page.getByRole('button', { name: 'Скачать курс для офлайн', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Курс доступен без интернета', {
      timeout: 30000,
    })
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true)
    await new Promise<void>((done) => {
      server.close(() => done())
      server.closeAllConnections()
    })
    await expect(fetch(origin)).rejects.toThrow()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Вход', exact: true })).toBeVisible()
    await page.goto(`${origin}?lecture=${first.id}&slide=${first.slides[0].id}`)
    await page.getByRole('button', { name: 'Начать занятие в двух окнах', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: first.title, exact: true, level: 1 }),
    ).toBeVisible()
  } finally {
    server.closeAllConnections()
    server.close()
  }
})
test('mobile tools fit viewport and dialog Escape returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const tools = page.getByRole('button', { name: 'Инструменты курса', exact: true })
  await tools.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.keyboard.press('Escape')
  await expect(tools).toBeFocused()
})
test('print renders every slide without private content or interactive controls', async ({
  page,
}) => {
  await page.goto('./?mode=print&scope=all')
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.print-page')).toHaveCount(
    course.lectures.reduce((n: number, l: any) => n + l.slides.length, 0),
  )
  await expect(page.getByRole('button', { name: 'Проверить', exact: true })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('PRIVATE_QA_MARKER_9374')
})
test('all assessment types produce correct scores', async ({ page }) => {
  for (const type of ['multiple', 'short', 'matching']) {
    const s = first.slides.find((s: any) => s.task?.type === type)
    await page.goto(`./?lecture=${first.id}&slide=${s.id}`)
    if (type === 'multiple') {
      await page.getByRole('checkbox').nth(0).check()
      await page.getByRole('checkbox').nth(2).check()
    } else if (type === 'short')
      await page.getByRole('textbox', { name: 'Краткий ответ' }).fill('Критерий')
    else {
      const values = ['c', 'd', 'b', 'a']
      for (let i = 0; i < 4; i++) await page.getByRole('combobox').nth(i).selectOption(values[i])
    }
    await page.getByRole('button', { name: 'Проверить', exact: true }).click()
    await expect(page.locator('.task-status')).toContainText('Правильно')
  }
})
test('catalog, tools and editor have no serious accessibility violations', async ({ page }) => {
  await page.goto('./')
  for (const view of ['catalog', 'tools', 'editor']) {
    if (view === 'tools')
      await page.getByRole('button', { name: 'Инструменты курса', exact: true }).click()
    if (view === 'editor') {
      await page.keyboard.press('Escape')
      await openEditor(page)
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      JSON.stringify(results.violations, null, 2),
    ).toEqual([])
  }
})
test('invalid unfinished editor text survives reload', async ({ page }) => {
  await page.goto('./')
  await openEditor(page)
  await page.getByRole('textbox', { name: 'Заголовок слайда', exact: true }).fill('')
  await expect(page.getByRole('status').first()).toContainText('Черновик сохранён')
  await page.reload()
  await openEditor(page)
  await expect(page.getByRole('textbox', { name: 'Заголовок слайда', exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Проверить и скачать курс', exact: true }).click()
  await expect(page.getByRole('status').last()).toContainText('title')
})
test('teacher pack previews migration and break pauses timer', async ({ page }) => {
  await page.goto(
    `./?mode=presenter&lecture=${first.id}&slide=${first.slides[0].id}&session=notes-test`,
  )
  const pack = {
    schemaVersion: 1,
    courseId: course.id,
    contentVersion: 'old-version',
    notes: {
      [first.slides[0].id]: {
        script: 'PRIVATE_QA_MARKER_9374',
        preparation: '',
        notebook: '',
        questions: '',
        answer: '',
        estimatedSeconds: 90,
      },
    },
  }
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pack)),
  })
  await expect(page.getByRole('heading', { name: 'Импорт сценария' })).toBeVisible()
  await expect(page.locator('.import-preview')).toContainText('другой версии')
  await page.getByRole('button', { name: 'Применить заметки' }).click()
  await expect(page.locator('.note-reader')).toContainText('PRIVATE_QA_MARKER_9374')
  await page.getByRole('button', { name: 'Начать перерыв' }).click()
  await expect(page.getByRole('button', { name: 'Продолжить таймер', exact: true })).toBeVisible()
  await expect(page.locator('.timing-plan')).toContainText('До конца перерыва')
})
test('mobile hides answers, results and retries after submit, resize and reload', async ({
  page,
}) => {
  await page.goto(`./?lecture=${first.id}&slide=${taskSlide.id}`)
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Проверить', exact: true }).click()
  await page.getByRole('button', { name: 'Разбор ответа', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Правильный ответ' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Правильный ответ' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Разбор ответа', exact: true })).toHaveCount(0)
  await expect(page.locator('.task-status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ещё попытка' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Результаты самопроверки' })).toHaveCount(0)
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.getByRole('button', { name: 'Закрыть окно' }).click()
  await page.getByRole('button', { name: 'Результаты самопроверки' }).click()
  await expect(page.locator('.result-summary')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.task-status, .result-summary')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Ещё попытка|Начать самопроверку заново/ }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Разбор ответа', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Инструменты', exact: true }).click()
  await page.getByRole('button', { name: 'Моё обучение', exact: true }).click()
  await expect(page.locator('option[value="errors"]')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Повторить объяснение перед заданием' }),
  ).toHaveCount(0)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Проверить', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Ответ сохранён')
  await expect(page.locator('.task-status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ещё попытка' })).toHaveCount(0)
  await expect(page.getByRole('radio').first()).toBeDisabled()
})
test('all diagrams fit SVG bounds and mobile reading stays within viewport', async ({
  page,
  browserName,
}) => {
  test.setTimeout(90000)
  const gallery = course.lectures.find((l: any) => l.id === 'VISUALS')
  mkdirSync('output/playwright', { recursive: true })
  for (const s of gallery.slides.filter((s: any) => s.visual)) {
    await page.setViewportSize({ width: 1366, height: 900 })
    await page.goto(`./?lecture=VISUALS&slide=${s.id}`)
    await page.evaluate(() => document.fonts.ready)
    const overflow = await page
      .locator('.infographic-canvas svg')
      .evaluate((svg: SVGSVGElement) => {
        const v = svg.viewBox.baseVal
        return Array.from(svg.querySelectorAll('text'))
          .filter((t) => {
            const b = t.getBBox()
            return (
              b.x < -0.5 ||
              b.y < -0.5 ||
              b.x + b.width > v.width + 0.5 ||
              b.y + b.height > v.height + 0.5
            )
          })
          .map((t) => t.textContent)
      })
    expect(overflow, s.visual.type).toEqual([])
    if (browserName === 'chromium' && ['network', 'process', 'funnel'].includes(s.visual.type))
      await page
        .locator('.active-slide')
        .screenshot({ path: `output/playwright/${s.visual.type}-desktop.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.infographic-mobile')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      s.visual.type,
    ).toBeTruthy()
    if (browserName === 'chromium' && s.visual.type === 'process')
      await page.screenshot({ path: 'output/playwright/process-mobile.png', fullPage: true })
  }
})
