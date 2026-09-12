import type { Visual } from './model'
import { assetUrl } from './model'
export function InfographicMobile({ visual: v, base }: { visual: Visual; base: string }) {
  const cards = (items: { title: string; text: string }[], ordered = true) =>
    ordered ? (
      <ol className="diagram-cards">
        {items.map((x, i) => (
          <li key={i}>
            <strong>{x.title}</strong>
            <p>{x.text}</p>
          </li>
        ))}
      </ol>
    ) : (
      <ul className="diagram-cards">
        {items.map((x, i) => (
          <li key={i}>
            <strong>{x.title}</strong>
            <p>{x.text}</p>
          </li>
        ))}
      </ul>
    )
  if (v.type === 'process' || v.type === 'timeline' || v.type === 'cycle')
    return (
      <>
        {cards(v.items)}
        {v.type === 'cycle' && (
          <p className="diagram-loop">↻ После последнего этапа — снова первый.</p>
        )}
      </>
    )
  if (v.type === 'tree')
    return (
      <>
        <h3>{v.root}</h3>
        <ul className="diagram-cards">
          {v.branches.map((b, i) => (
            <li key={i}>
              <strong>{b.title}</strong>
              <ul>
                {b.items.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </>
    )
  if (v.type === 'network')
    return (
      <>
        {cards(v.nodes, false)}
        <h3>Связи</h3>
        <ul className="diagram-links">
          {v.edges.map((e, i) => (
            <li key={i}>
              <strong>
                {v.nodes.find((n) => n.id === e.from)?.title} →{' '}
                {v.nodes.find((n) => n.id === e.to)?.title}
              </strong>
              <p>{e.label}</p>
            </li>
          ))}
        </ul>
      </>
    )
  if (v.type === 'bars')
    return (
      <>
        <p className="diagram-scale">
          Шкала: 0–{v.max} {v.unit}
          {v.threshold !== undefined ? ` · Критерий: ${v.threshold} ${v.unit}` : ''}
        </p>
        <ul className="diagram-bars">
          {v.items.map((x, i) => (
            <li key={i}>
              <div>
                <strong>{x.label}</strong>
                <span>
                  {x.value} {v.unit}
                </span>
              </div>
              <div className="diagram-bar-track">
                <span style={{ width: `${(x.value / v.max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </>
    )
  if (v.type === 'comparison' || v.type === 'matrix')
    return (
      <div
        className="diagram-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Таблица, прокрутка по горизонтали"
      >
        <table>
          <thead>
            <tr>
              {v.columns.map((x, i) => (
                <th key={i} scope="col">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r, i) => (
              <tr key={i}>
                {r.map((x, j) =>
                  j === 0 ? (
                    <th scope="row" key={j}>
                      {x}
                    </th>
                  ) : (
                    <td key={j}>{x}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  if (v.type === 'decision')
    return (
      <>
        <p className="diagram-start">{v.start}</p>
        <h3>{v.question}</h3>
        {cards(
          [
            { title: 'Нет', text: v.no },
            { title: 'Да', text: v.yes },
          ],
          false,
        )}
      </>
    )
  if (v.type === 'beforeAfter')
    return (
      <>
        {cards(
          [v.before, v.after].map((x) => ({
            title: x.title,
            text: x.fields.map((f) => `${f.label}: ${f.value}`).join('\n'),
          })),
          false,
        )}
        <h3>Что изменилось</h3>
        <ul>
          {v.changes.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </>
    )
  if (v.type === 'conceptMap')
    return (
      <>
        <h3>{v.center}</h3>
        {cards(
          v.items.map((x) => ({ title: x.title, text: `${x.relation}\nПример: ${x.example}` })),
          false,
        )}
      </>
    )
  if (v.type === 'states')
    return cards(
      v.states.map((x, i) => ({
        title: x,
        text: v.cancelFrom.includes(i)
          ? 'Можно перейти в состояние «Отменён».'
          : 'Отмена не предусмотрена.',
      })),
    )
  if (v.type === 'cause')
    return cards([
      { title: 'Причина', text: v.cause },
      { title: 'Следствие', text: v.effect },
      { title: 'Решение', text: v.solution },
    ])
  if (v.type === 'callouts')
    return (
      <>
        <img className="diagram-source" src={assetUrl(v.image, base)} alt={v.alt} />
        {cards(v.items.map((x) => ({ title: x.title, text: x.text })))}
      </>
    )
  if (v.type === 'codeParts')
    return (
      <ol className="diagram-cards">
        {v.parts.map((x, i) => (
          <li key={i}>
            <strong>{x.label}</strong>
            <pre>
              <code>{x.code}</code>
            </pre>
            <p>{x.explanation}</p>
          </li>
        ))}
      </ol>
    )
  if (v.type === 'layers') return cards(v.items)
  if (v.type === 'funnel')
    return cards(
      v.stages.map((x) => ({ title: x.label, text: x.value + ' ' + v.unit + ' — ' + x.detail })),
    )
  if (v.type === 'swimlanes')
    return (
      <>
        {v.lanes.map((l, i) => (
          <section key={i}>
            <h3>{l.title}</h3>
            {cards(l.steps)}
          </section>
        ))}
      </>
    )
  return null
}
