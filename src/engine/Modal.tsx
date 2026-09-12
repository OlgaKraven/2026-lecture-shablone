import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const origin = document.activeElement as HTMLElement
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      requestAnimationFrame(() => {
        if (origin?.isConnected) origin.focus()
      })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`template-dialog ${wide ? 'dialog-wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Закрыть окно" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
