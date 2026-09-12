import { useEffect, useRef, useState } from 'react'
import type { Slide } from './model'

export function ImageEditor({
  image,
  onChange,
}: {
  image: Slide['image']
  onChange: (image: Slide['image']) => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const load = async (file: Blob) => {
    setError('')
    setBusy(true)
    let url = ''
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
        throw Error('Выберите PNG, JPEG или WebP.')
      if (file.size > 20 * 1024 * 1024) throw Error('Файл слишком большой. Максимум — 20 МБ.')
      url = URL.createObjectURL(file)
      const bitmap = new Image()
      bitmap.src = url
      try {
        await bitmap.decode()
      } catch {
        throw Error('Не удалось прочитать картинку. Выберите исправный PNG, JPEG или WebP.')
      }
      if (!active.current) return
      const scale = Math.min(1, 1920 / Math.max(bitmap.naturalWidth, bitmap.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(bitmap.naturalHeight * scale))
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const src = canvas.toDataURL('image/webp', 0.9)
      if (src.length > 1500000)
        throw Error('Изображение слишком детальное. Уменьшите его и попробуйте ещё раз.')
      onChange({ src, alt: image?.alt || 'Изображение к слайду', caption: image?.caption || '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать изображение')
    } finally {
      if (url) URL.revokeObjectURL(url)
      setBusy(false)
    }
  }
  return (
    <fieldset className="image-editor" disabled={busy}>
      <legend>Изображение или скриншот</legend>
      <label>
        Загрузить изображение
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void load(f)
          }}
        />
      </label>
      <div
        className="image-paste"
        tabIndex={0}
        role="group"
        aria-label="Вставка скриншота"
        onPaste={(e) => {
          const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
          if (file) {
            e.preventDefault()
            void load(file)
          } else setError('В буфере нет изображения. Скопируйте скриншот и нажмите Ctrl+V.')
        }}
      >
        Нажмите здесь и вставьте скриншот: Ctrl+V (на Mac — ⌘V).
      </div>
      <button
        type="button"
        className="button ghost"
        onClick={async () => {
          try {
            const items = await navigator.clipboard.read()
            for (const item of items) {
              const type = item.types.find((t) =>
                ['image/png', 'image/jpeg', 'image/webp'].includes(t),
              )
              if (type) {
                await load(await item.getType(type))
                return
              }
            }
            setError('В буфере нет изображения.')
          } catch {
            setError('Вставьте скриншот через Ctrl+V в поле выше или выберите файл.')
          }
        }}
      >
        Вставить из буфера
      </button>
      {busy && <p role="status">Подготавливаем изображение…</p>}
      {error && <p role="alert">{error}</p>}
      {image && (
        <>
          <img className="image-editor-preview" src={image.src} alt={image.alt} />
          <label>
            Описание изображения
            <input
              value={image.alt}
              onChange={(e) => onChange({ ...image, alt: e.target.value })}
            />
          </label>
          <label>
            Подпись к изображению
            <input
              value={image.caption || ''}
              onChange={(e) => onChange({ ...image, caption: e.target.value })}
            />
          </label>
          <button type="button" className="button ghost" onClick={() => onChange(undefined)}>
            Удалить изображение
          </button>
        </>
      )}
      <p>
        Картинка сохраняется внутри черновика и файла курса. Большие изображения уменьшаются до 1920
        пикселей.
      </p>
    </fieldset>
  )
}
