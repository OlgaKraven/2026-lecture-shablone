export async function offlineWorker(base: string) {
  if (!('serviceWorker' in navigator)) throw Error('Офлайн недоступен в этом браузере')
  const registration = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base })
  const worker = registration.active || registration.installing || registration.waiting
  if (!worker) throw Error('Не удалось запустить офлайн-хранилище')
  if (worker.state !== 'activated')
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Офлайн-хранилище не запустилось')), 15000)
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') {
          clearTimeout(timeout)
          resolve()
        } else if (worker.state === 'redundant') {
          clearTimeout(timeout)
          reject(Error('Не удалось установить офлайн-режим'))
        }
      })
    })
  return worker
}
export async function offlineCommand(
  base: string,
  type: 'PREPARE' | 'STATUS' | 'REMOVE',
): Promise<{ ready: boolean; count: number }> {
  const worker = await offlineWorker(base)
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = setTimeout(() => {
      channel.port1.close()
      reject(Error('Операция не завершилась. Проверьте подключение и повторите.'))
    }, 120000)
    channel.port1.onmessage = (e) => {
      clearTimeout(timeout)
      channel.port1.close()
      if (e.data.error) reject(Error(e.data.error))
      else resolve(e.data)
    }
    worker.postMessage({ type }, [channel.port2])
  })
}
