import { useId, useState } from 'react'
import type { Visual } from './model'
import { diagramLayout } from './diagram-layout'
import { InfographicMobile } from './InfographicMobile'
import { Modal } from './Modal'
export function Infographic({ visual, base = '/' }: { visual: Visual; base?: string }) {
  const id = useId().replace(/:/g, '')
  const [view, setView] = useState<'diagram' | 'text' | null>(null)
  const layout = diagramLayout(visual, id, base)
  const canvas = (suffix: string) => {
    const marker = id + suffix
    const l = suffix ? diagramLayout(visual, marker, base) : layout
    return (
      <svg
        role="img"
        aria-labelledby={`${marker}-title ${marker}-desc`}
        viewBox={`0 0 1040 ${l.height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id={`${marker}-title`}>{visual.caption}</title>
        <desc id={`${marker}-desc`}>
          Подробное текстовое представление доступно по кнопке «Текстовое представление».
        </desc>
        <defs>
          <marker
            id={marker}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L8 4 L0 8" fill="#6B778B" />
          </marker>
        </defs>
        {l.content}
      </svg>
    )
  }
  return (
    <figure className={`infographic infographic-${visual.type}`}>
      <div className="infographic-canvas">{canvas('')}</div>
      <div className="infographic-mobile">
        <InfographicMobile visual={visual} base={base} />
      </div>
      <figcaption>{visual.caption}</figcaption>
      <div className="infographic-actions">
        <button className="text-button" aria-haspopup="dialog" onClick={() => setView('diagram')}>
          Рассмотреть схему
        </button>
        <button
          className="text-button infographic-text-toggle"
          aria-haspopup="dialog"
          onClick={() => setView('text')}
        >
          Текстовое представление
        </button>
      </div>
      {view && (
        <Modal
          title={view === 'text' ? 'Текстовое представление' : 'Подробная схема'}
          wide
          onClose={() => setView(null)}
        >
          <div
            className="diagram-dialog-content"
            tabIndex={0}
            role="region"
            aria-label={view === 'text' ? 'Текст схемы' : 'Изображение схемы'}
          >
            {view === 'text' ? (
              <InfographicMobile visual={visual} base={base} />
            ) : (
              <div className="diagram-expanded">{canvas('-expanded')}</div>
            )}
            <p>{visual.caption}</p>
          </div>
          <div className="diagram-dialog-actions">
            <button
              className="button ghost"
              onClick={() => setView(view === 'text' ? 'diagram' : 'text')}
            >
              {view === 'text' ? 'Показать схему' : 'Текстовое представление'}
            </button>
            <button className="button primary" onClick={() => setView(null)}>
              Закрыть
            </button>
          </div>
        </Modal>
      )}
    </figure>
  )
}
