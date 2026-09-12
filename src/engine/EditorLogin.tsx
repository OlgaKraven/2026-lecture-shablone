import { useState } from 'react'
import { Modal } from './Modal'
import { assetUrl } from './model'

export function EditorLogin({
  base,
  onClose,
  onLogin,
}: {
  base: string
  onClose: () => void
  onLogin: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Modal title="Вход в редактор" onClose={onClose}>
      <form
        className="editor-login"
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          try {
            const response = await fetch(assetUrl('editor-access.json', base))
            if (!response.ok)
              throw Error('Не удалось загрузить настройки входа. Попробуйте ещё раз.')
            const config = await response.json()
            const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
            const key = await crypto.subtle.importKey(
              'raw',
              new TextEncoder().encode(password),
              'PBKDF2',
              false,
              ['deriveBits'],
            )
            const bits = await crypto.subtle.deriveBits(
              {
                name: 'PBKDF2',
                salt: decode(config.salt),
                iterations: config.iterations,
                hash: 'SHA-256',
              },
              key,
              256,
            )
            const verifier = btoa(String.fromCharCode(...new Uint8Array(bits)))
            if (username !== config.username || verifier !== config.verifier) {
              setError('Неверный логин или пароль')
              setPassword('')
              return
            }
            setPassword('')
            onLogin()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось выполнить вход')
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="short-field">
          Логин
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="short-field">
          Пароль
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </Modal>
  )
}
