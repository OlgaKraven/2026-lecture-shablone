import { useId, useState } from 'react'
import type { Visual } from './model'
import { diagramLayout } from './diagram-layout'
import { InfographicMobile } from './InfographicMobile'
import { Modal } from './Modal'
export function Infographic({ visual, base = '/' }: { visual: Visual; base?: string }) {
  const id = useId().replace(/:/g, '')
  const [expanded, setExpanded] = useState(false)
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
          Подробное текстовое представление схемы доступно в раскрывающемся разделе.
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
        <button className="text-button" onClick={() => setExpanded(true)}>
          Рассмотреть схему
        </button>
        <details>
          <summary>Текстовое представление</summary>
          <InfographicMobile visual={visual} base={base} />
        </details>
      </div>
      {expanded && (
        <Modal title="Подробная схема" wide onClose={() => setExpanded(false)}>
          <div className="diagram-expanded">{canvas('-expanded')}</div>
          <p>{visual.caption}</p>
          <details>
            <summary>Текстовое представление</summary>
            <InfographicMobile visual={visual} base={base} />
          </details>
        </Modal>
      )}
    </figure>
  )
}
