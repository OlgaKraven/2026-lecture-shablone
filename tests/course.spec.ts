import { test, expect } from '@playwright/test'
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
  await page.getByRole('button', { name: 'Редактор курса', exact: true }).click()
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
  await page.getByRole('button', { name: 'Редактор курса', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Заголовок слайда', exact: true })).toHaveValue(
    'Восстановленный черновик',
  )
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
  await expect(page.getByRole('button', { name: 'Редактор курса' })).toBeVisible()
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
    await expect(page.getByRole('button', { name: 'Редактор курса' })).toBeVisible()
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
      await page.getByRole('button', { name: 'Редактор курса', exact: true }).click()
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
  await page.getByRole('button', { name: 'Редактор курса', exact: true }).click()
  await page.getByRole('textbox', { name: 'Заголовок слайда', exact: true }).fill('')
  await expect(page.getByRole('status').first()).toContainText('Черновик сохранён')
  await page.reload()
  await page.getByRole('button', { name: 'Редактор курса', exact: true }).click()
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
test('mobile never renders answer breakdown, including after desktop resize', async ({ page }) => {
  await page.goto(`./?lecture=${first.id}&slide=${taskSlide.id}`)
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Проверить', exact: true }).click()
  await page.getByRole('button', { name: 'Разбор ответа', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Правильный ответ' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Правильный ответ' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Разбор ответа', exact: true })).toHaveCount(0)
  await expect(page.locator('.task-status')).toContainText('Есть ошибка')
  await page.getByRole('button', { name: 'Результаты самопроверки' }).click()
  await expect(page.getByRole('dialog')).not.toContainText('Правильный ответ')
  await expect(page.getByRole('dialog').locator('details')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Разбор ответа', exact: true })).toHaveCount(0)
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
