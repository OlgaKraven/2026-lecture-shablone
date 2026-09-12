// Store each embedded image once even when many undo states reference it.
export function packEditorHistory<T extends object>(history: T) {
  const images: string[] = []
  const stored = JSON.parse(
    JSON.stringify(history, (key, value) => {
      if (key !== 'src' || typeof value !== 'string' || !value.startsWith('data:image/'))
        return value
      let index = images.indexOf(value)
      if (index < 0) index = images.push(value) - 1
      return `editor-image:${index}`
    }),
  )
  return { ...stored, imageStore: images }
}

export function unpackEditorHistory<T>(stored: T): T {
  const images = (stored as { imageStore?: string[] } | null)?.imageStore
  if (!Array.isArray(images)) return stored
  return JSON.parse(
    JSON.stringify(stored, (key, value) => {
      if (key === 'imageStore') return undefined
      if (key !== 'src' || typeof value !== 'string' || !value.startsWith('editor-image:'))
        return value
      const image = images[Number(value.slice('editor-image:'.length))]
      if (typeof image !== 'string' || !image.startsWith('data:image/'))
        throw Error('Повреждённое изображение в черновике')
      return image
    }),
  ) as T
}
