import type { ReactNode } from 'react'
import type { Visual } from './model'
import { assetUrl } from './model'
export const diagramColors = [
  '#BE123C',
  '#3154A4',
  '#237447',
  '#586579',
  '#79416B',
  '#256777',
  '#9B3D30',
  '#4E5489',
]
export function wrapText(text: string, width: number, size = 22) {
  const max = Math.max(4, Math.floor(width / (size * 0.59)))
  const rows: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const original of paragraph.split(/\s+/)) {
      const pieces = original.match(new RegExp(`.{1,${max}}`, 'gu')) || ['']
      for (const word of pieces) {
        if ((line + ' ' + word).trim().length > max && line) {
          rows.push(line)
          line = word
        } else line = (line + ' ' + word).trim()
      }
    }
    rows.push(line)
  }
  return rows
}
const height = (s: string, w: number, size = 22) => wrapText(s, w, size).length * size * 1.32
export function DiagramText({
  text,
  x,
  y,
  width,
  size = 22,
  bold = false,
  color = '#20242C',
  center = false,
}: {
  text: string
  x: number
  y: number
  width: number
  size?: number
  bold?: boolean
  color?: string
  center?: boolean
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={bold ? 700 : 450}
      fill={color}
      textAnchor={center ? 'middle' : 'start'}
    >
      {wrapText(text, width, size).map((line, i) => (
        <tspan x={x} dy={i ? size * 1.32 : 0} key={i}>
          {line}
        </tspan>
      ))}
    </text>
  )
}
function cardHeight(title: string, body: string, width: number) {
  return 42 + height(title, width - 44, 23) + (body ? 16 + height(body, width - 44, 20) : 0)
}
function Card({
  x,
  y,
  w,
  h,
  title,
  body = '',
  color = diagramColors[1],
  number,
}: {
  x: number
  y: number
  w: number
  h: number
  title: string
  body?: string
  color?: string
  number?: number
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={14}
        fill="#FAFBFD"
        stroke="#D9DFE9"
        strokeWidth={1.5}
      />
      <rect x={x} y={y + 16} width={4} height={h - 32} rx={2} fill={color} />
      {number !== undefined && (
        <text x={x + w - 18} y={y + 4} textAnchor="end" fontSize={14} fontWeight={750} fill={color}>
          {String(number).padStart(2, '0')}
        </text>
      )}
      <DiagramText text={title} x={x + 22} y={y + 35} width={w - 48} size={23} bold />
      <DiagramText
        text={body}
        x={x + 22}
        y={y + 51 + height(title, w - 44, 23)}
        width={w - 44}
        size={20}
        color="#505D70"
      />
    </g>
  )
}
function Arrow({
  path,
  marker,
  color = '#6B778B',
}: {
  path: string
  marker: string
  color?: string
}) {
  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      markerEnd={`url(#${marker})`}
      strokeLinejoin="round"
    />
  )
}
function gridCards(items: { title: string; text: string }[], marker: string, cycle = false) {
  const cols = items.length <= 3 ? items.length : Math.ceil(items.length / 2)
  const w = (992 - (cols - 1) * 28) / cols
  const rowHeights = Array.from({ length: Math.ceil(items.length / cols) }, (_, r) =>
    Math.max(...items.slice(r * cols, (r + 1) * cols).map((x) => cardHeight(x.title, x.text, w))),
  )
  const rowY = (r: number) => 30 + rowHeights.slice(0, r).reduce((a, b) => a + b + 55, 0)
  const H = rowY(rowHeights.length - 1) + rowHeights.at(-1)! + 40
  return {
    height: H,
    content: (
      <>
        {items.map((item, i) => {
          const r = Math.floor(i / cols)
          const col = r % 2 ? cols - 1 - (i % cols) : i % cols
          const x = 24 + col * (w + 28)
          const y = rowY(r)
          const h = rowHeights[r]
          const next = i + 1 < items.length
          return (
            <g key={i}>
              <Card
                x={x}
                y={y}
                w={w}
                h={h}
                title={item.title}
                body={item.text}
                color={diagramColors[i]}
                number={i + 1}
              />
              {next &&
                (i % cols === cols - 1 ? (
                  <Arrow marker={marker} path={`M${x + w / 2} ${y + h} V${y + h + 44}`} />
                ) : (
                  <Arrow
                    marker={marker}
                    path={r % 2 ? `M${x - 3} ${y + h / 2} h-19` : `M${x + w + 3} ${y + h / 2} h19`}
                  />
                ))}
            </g>
          )
        })}
        {cycle && (
          <DiagramText
            text="После последнего этапа вернитесь к первому →"
            x={24}
            y={H + 3}
            width={992}
            size={18}
            color={diagramColors[1]}
          />
        )}
      </>
    ),
  }
}
export function diagramLayout(
  v: Visual,
  marker: string,
  base: string,
): { height: number; content: ReactNode } {
  if (v.type === 'process' || v.type === 'timeline') return gridCards(v.items, marker)
  if (v.type === 'cause')
    return gridCards(
      [
        { title: 'Причина', text: v.cause },
        { title: 'Следствие', text: v.effect },
        { title: 'Решение', text: v.solution },
      ],
      marker,
    )
  if (v.type === 'cycle') {
    // A real closed loop for four steps; larger loops retain order with an explicit return.
    if (v.items.length !== 4) {
      const result = gridCards(v.items, marker, true)
      return { ...result, height: result.height + 32 }
    }
    const w = 418
    const h = Math.max(...v.items.map((x) => cardHeight(x.title, x.text, w)))
    const points = [
      { x: 24, y: 24 },
      { x: 598, y: 24 },
      { x: 598, y: h + 114 },
      { x: 24, y: h + 114 },
    ]
    return {
      height: h * 2 + 152,
      content: (
        <>
          {v.items.map((x, i) => (
            <Card
              key={i}
              {...points[i]}
              w={w}
              h={h}
              title={x.title}
              body={x.text}
              number={i + 1}
              color={diagramColors[i]}
            />
          ))}
          <Arrow marker={marker} path={`M446 ${24 + h / 2} H586`} />
          <Arrow marker={marker} path={`M807 ${h + 30} V${h + 102}`} />
          <Arrow marker={marker} path={`M592 ${h + 114 + h / 2} H454`} />
          <Arrow marker={marker} path={`M233 ${h + 108} V${h + 36}`} />
          <DiagramText
            text="ЦИКЛ"
            x={520}
            y={h + 76}
            width={130}
            size={18}
            bold
            center
            color="#68758A"
          />
        </>
      ),
    }
  }
  if (v.type === 'tree') {
    const cols = Math.min(3, v.branches.length)
    const w = (992 - (cols - 1) * 24) / cols
    const rows = Math.ceil(v.branches.length / cols)
    const hs = Array.from({ length: rows }, (_, r) =>
      Math.max(
        ...v.branches
          .slice(r * cols, (r + 1) * cols)
          .map((b) => cardHeight(b.title, b.items.map((x, i) => `${i + 1}. ${x}`).join('\n'), w)),
      ),
    )
    const rootH = height(v.root, 760, 27) + 38
    const y = (r: number) => rootH + 68 + hs.slice(0, r).reduce((a, b) => a + b + 30, 0)
    return {
      height: y(rows - 1) + hs.at(-1)! + 24,
      content: (
        <>
          <rect x={130} y={12} width={780} height={rootH} rx={14} fill="#20242C" />
          <DiagramText
            text={v.root}
            x={520}
            y={45}
            width={736}
            size={27}
            bold
            color="white"
            center
          />
          {v.branches.map((b, i) => {
            const row = Math.floor(i / cols),
              x = 24 + (i % cols) * (w + 24)
            return (
              <g key={i}>
                {row === 0 && (
                  <Arrow
                    marker={marker}
                    path={`M520 ${rootH + 13} V${rootH + 38} H${x + w / 2} V${y(row) - 10}`}
                  />
                )}
                <Card
                  x={x}
                  y={y(row)}
                  w={w}
                  h={hs[row]}
                  title={b.title}
                  body={b.items.map((x, i) => `${i + 1}. ${x}`).join('\n')}
                  color={diagramColors[i]}
                />
              </g>
            )
          })}
        </>
      ),
    }
  }
  if (v.type === 'network') {
    const n = v.nodes.length
    const w = n <= 4 ? (992 - 48 * (n - 1)) / n : n > 6 ? 212 : 246
    const h = Math.max(...v.nodes.map((x) => cardHeight(x.title, x.text, w)))
    const ry = Math.max(160, h * 1.25)
    const cy = ry + h / 2 + 24
    const nodes = v.nodes.map((_, i) =>
      n <= 4
        ? { x: 24 + w / 2 + i * (w + 48), y: 40 + h / 2 }
        : {
            x: 520 + 376 * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n),
            y: cy + ry * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n),
          },
    )
    const graphH = n <= 4 ? h + 88 : cy + ry + h / 2 + 22
    let legendY = graphH + 20
    const legend = v.edges.map((e, i) => {
      const text = `${i + 1}. ${v.nodes.find((n) => n.id === e.from)!.title} → ${v.nodes.find((n) => n.id === e.to)!.title}: ${e.label}`
      const y = legendY
      legendY += height(text, 976, 19) + 10
      return <DiagramText key={i} text={text} x={32} y={y} width={976} size={19} />
    })
    return {
      height: legendY + 10,
      content: (
        <>
          {v.edges.map((e, i) => {
            const a = nodes[v.nodes.findIndex((x) => x.id === e.from)],
              b = nodes[v.nodes.findIndex((x) => x.id === e.to)]
            const dx = b.x - a.x,
              dy = b.y - a.y
            const scale = Math.min(
              dx ? Math.abs((w / 2 + 5) / dx) : Infinity,
              dy ? Math.abs((h / 2 + 5) / dy) : Infinity,
            )
            const mx = (a.x + b.x) / 2,
              my = (a.y + b.y) / 2
            return (
              <g key={i}>
                <Arrow
                  marker={marker}
                  path={`M${a.x + dx * scale} ${a.y + dy * scale} L${b.x - dx * scale} ${b.y - dy * scale}`}
                />
                <circle cx={mx} cy={my} r={13} fill="white" stroke="#AEB8C8" />
                <text x={mx} y={my + 5} textAnchor="middle" fontSize={15} fill="#334155">
                  {i + 1}
                </text>
              </g>
            )
          })}
          {v.nodes.map((x, i) => (
            <Card
              key={x.id}
              x={nodes[i].x - w / 2}
              y={nodes[i].y - h / 2}
              w={w}
              h={h}
              title={x.title}
              body={x.text}
              color={diagramColors[i]}
            />
          ))}
          {legend}
        </>
      ),
    }
  }
  if (v.type === 'bars') {
    const left = 310,
      width = 620
    const rows = v.items.map((x) => Math.max(60, height(x.label, 266, 22) + 18))
    const y = (i: number) => 54 + rows.slice(0, i).reduce((a, b) => a + b, 0)
    const bottom = y(rows.length)
    return {
      height: bottom + 55,
      content: (
        <>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line
                x1={left + f * width}
                y1={40}
                x2={left + f * width}
                y2={bottom}
                stroke="#DEE4ED"
                strokeDasharray="4 5"
              />
              <text
                x={left + f * width}
                y={bottom + 30}
                fontSize={18}
                fill="#546174"
                textAnchor="middle"
              >
                {Number((v.max * f).toFixed(2))}
              </text>
            </g>
          ))}
          {v.items.map((x, i) => (
            <g key={i}>
              <DiagramText text={x.label} x={24} y={y(i) + 26} width={266} size={22} />
              <rect x={left} y={y(i) + 3} width={width} height={33} rx={5} fill="#EFF2F7" />
              <rect
                x={left}
                y={y(i) + 3}
                width={(x.value / v.max) * width}
                height={33}
                rx={5}
                fill={diagramColors[i]}
              />
              <text x={950} y={y(i) + 28} fontSize={21} fontWeight={700} fill="#263244">
                {x.value}
              </text>
            </g>
          ))}
          {v.threshold !== undefined && (
            <>
              <line
                x1={left + (v.threshold / v.max) * width}
                y1={35}
                x2={left + (v.threshold / v.max) * width}
                y2={bottom}
                stroke="#20242C"
                strokeWidth={2}
                strokeDasharray="7 5"
              />
              <DiagramText
                text={`Критерий: ${v.threshold} ${v.unit}`}
                x={24}
                y={24}
                width={900}
                size={18}
                bold
              />
            </>
          )}
          <text x={1014} y={bottom + 30} textAnchor="end" fontSize={18} fill="#546174">
            {v.unit}
          </text>
        </>
      ),
    }
  }
  if (v.type === 'comparison' || v.type === 'matrix') {
    const w = 992 / v.columns.length
    const headerH = Math.max(...v.columns.map((x) => height(x, w - 30, 21))) + 28
    const rowH = v.rows.map((r) => Math.max(...r.map((x) => height(x, w - 30, 20))) + 30)
    const y = (r: number) => 16 + headerH + rowH.slice(0, r).reduce((a, b) => a + b, 0)
    return {
      height: y(rowH.length) + 16,
      content: (
        <>
          {v.columns.map((x, i) => (
            <g key={i}>
              <rect x={24 + i * w} y={16} width={w} height={headerH} fill="#263244" />
              <DiagramText
                text={x}
                x={40 + i * w}
                y={45}
                width={w - 30}
                size={21}
                color="white"
                bold
              />
            </g>
          ))}
          {v.rows.map((r, j) =>
            r.map((x, i) => (
              <g key={i + '-' + j}>
                <rect
                  x={24 + i * w}
                  y={y(j)}
                  width={w}
                  height={rowH[j]}
                  fill={j % 2 ? '#F0F3F8' : '#FAFBFD'}
                  stroke="#DEE4ED"
                />
                <DiagramText
                  text={x}
                  x={40 + i * w}
                  y={y(j) + 29}
                  width={w - 30}
                  size={20}
                  bold={i === 0}
                />
              </g>
            )),
          )}
        </>
      ),
    }
  }
  if (v.type === 'decision') {
    const questionH = height(v.question, 380, 24) + 76
    const y = 120
    const resultY = y + questionH + 64
    const results = [
      { title: 'Нет', text: v.no },
      { title: 'Да', text: v.yes },
    ]
    const h = Math.max(...results.map((x) => cardHeight(x.title, x.text, 450)))
    return {
      height: resultY + h + 24,
      content: (
        <>
          <Card x={285} y={14} w={470} h={70} title={v.start} />
          <Arrow marker={marker} path={`M520 85 V${y - 12}`} />
          <path
            d={`M520 ${y} L800 ${y + questionH / 2} L520 ${y + questionH} L240 ${y + questionH / 2} Z`}
            fill="#FFF4F6"
            stroke="#BE123C"
            strokeWidth={2}
          />
          <DiagramText text={v.question} x={520} y={y + 48} width={380} size={24} bold center />
          {results.map((r, i) => (
            <g key={i}>
              <Arrow
                marker={marker}
                path={`M520 ${y + questionH} V${resultY - 28} H${249 + i * 542} V${resultY - 9}`}
              />
              <Card
                x={24 + i * 542}
                y={resultY}
                w={450}
                h={h}
                title={r.title}
                body={r.text}
                color={i ? diagramColors[2] : diagramColors[0]}
              />
            </g>
          ))}
        </>
      ),
    }
  }
  if (v.type === 'beforeAfter') {
    const items = [v.before, v.after].map((x) => ({
      title: x.title,
      text: x.fields.map((f) => `${f.label}: ${f.value}`).join('\n'),
    }))
    const h = Math.max(...items.map((x) => cardHeight(x.title, x.text, 468)))
    const text = v.changes.map((x) => '• ' + x).join('\n')
    return {
      height: h + height(text, 970, 21) + 75,
      content: (
        <>
          {items.map((x, i) => (
            <Card
              key={i}
              x={24 + i * 524}
              y={18}
              w={468}
              h={h}
              title={x.title}
              body={x.text}
              color={i ? diagramColors[2] : diagramColors[3]}
            />
          ))}
          <Arrow marker={marker} path={`M499 ${18 + h / 2} H536`} />
          <DiagramText text={text} x={32} y={h + 55} width={970} size={21} />
        </>
      ),
    }
  }
  if (v.type === 'conceptMap') {
    const items = v.items.map((x) => ({
      title: x.title,
      text: `${x.relation}\nПример: ${x.example}`,
    }))
    const w = 470
    const hs = Array.from({ length: Math.ceil(items.length / 2) }, (_, r) =>
      Math.max(...items.slice(r * 2, r * 2 + 2).map((x) => cardHeight(x.title, x.text, w))),
    )
    const y = (r: number) => 110 + hs.slice(0, r).reduce((a, b) => a + b + 22, 0)
    return {
      height: y(hs.length - 1) + hs.at(-1)! + 22,
      content: (
        <>
          <rect x={220} y={15} width={600} height={66} rx={15} fill="#263244" />
          <DiagramText
            text={v.center}
            x={520}
            y={53}
            width={556}
            size={26}
            bold
            color="white"
            center
          />
          {items.map((x, i) => (
            <g key={i}>
              <path
                d={`M520 81 V${y(Math.floor(i / 2)) + 20} H${i % 2 ? 546 : 494}`}
                fill="none"
                stroke={diagramColors[i]}
                strokeWidth={2}
              />
              <Card
                x={24 + (i % 2) * 524}
                y={y(Math.floor(i / 2))}
                w={w}
                h={hs[Math.floor(i / 2)]}
                title={x.title}
                body={x.text}
                color={diagramColors[i]}
              />
            </g>
          ))}
        </>
      ),
    }
  }
  if (v.type === 'states') {
    const result = gridCards(
      v.states.map((s, i) => ({
        title: s,
        text: v.cancelFrom.includes(i)
          ? 'Переход в «Отменён» разрешён'
          : 'Отмена из этого состояния не предусмотрена',
      })),
      marker,
    )
    return {
      ...result,
      height: result.height + 52,
      content: (
        <>
          {result.content}
          <DiagramText
            text={`Отменён ← ${v.cancelFrom.map((i) => v.states[i]).join(' / ') || 'переходов нет'}`}
            x={24}
            y={result.height + 22}
            width={970}
            size={20}
            color={diagramColors[0]}
          />
        </>
      ),
    }
  }
  if (v.type === 'callouts') {
    const hs = v.items.map((x) => cardHeight(x.title, x.text, 350))
    const y = (i: number) => 18 + hs.slice(0, i).reduce((a, b) => a + b + 14, 0)
    const h = Math.max(360, y(hs.length) + 10)
    return {
      height: h,
      content: (
        <>
          <rect x={20} y={18} width={620} height={h - 36} rx={14} fill="#F0F3F8" stroke="#D9DFE9" />
          <image
            href={assetUrl(v.image, base)}
            x={30}
            y={28}
            width={600}
            height={355}
            preserveAspectRatio="xMidYMid meet"
            aria-label={v.alt}
          />
          {v.items.map((x, i) => (
            <g key={i}>
              <circle
                cx={30 + (x.x / 100) * 600}
                cy={28 + (x.y / 100) * 355}
                r={17}
                fill={diagramColors[0]}
                stroke="white"
                strokeWidth={3}
              />
              <text
                x={30 + (x.x / 100) * 600}
                y={34 + (x.y / 100) * 355}
                textAnchor="middle"
                fontSize={18}
                fontWeight={700}
                fill="white"
              >
                {i + 1}
              </text>
              <Card
                x={670}
                y={y(i)}
                w={350}
                h={hs[i]}
                title={`${i + 1}. ${x.title}`}
                body={x.text}
                color={diagramColors[0]}
              />
            </g>
          ))}
        </>
      ),
    }
  }
  if (v.type === 'codeParts') {
    const hs = v.parts.map((x) =>
      Math.max(height(x.code, 530, 21) + 40, cardHeight(x.label, x.explanation, 400)),
    )
    const y = (i: number) => 18 + hs.slice(0, i).reduce((a, b) => a + b + 18, 0)
    return {
      height: y(hs.length),
      content: (
        <>
          {v.parts.map((x, i) => (
            <g key={i}>
              <rect x={24} y={y(i)} width={566} height={hs[i]} rx={12} fill="#202A3A" />
              <g fontFamily="Consolas,monospace">
                <DiagramText
                  text={x.code}
                  x={44}
                  y={y(i) + 32}
                  width={526}
                  size={21}
                  color="#F4F7FB"
                />
              </g>
              <Arrow marker={marker} path={`M599 ${y(i) + hs[i] / 2} H620`} />
              <Card
                x={630}
                y={y(i)}
                w={390}
                h={hs[i]}
                title={x.label}
                body={x.explanation}
                color={diagramColors[i]}
              />
            </g>
          ))}
        </>
      ),
    }
  }
  if (v.type === 'layers') {
    const hs = v.items.map((x) => cardHeight(x.title, x.text, 950))
    const y = (i: number) => 18 + hs.slice(0, i).reduce((a, b) => a + b + 28, 0)
    return {
      height: y(hs.length),
      content: (
        <>
          {v.items.map((x, i) => (
            <g key={i}>
              <Card
                x={44}
                y={y(i)}
                w={950}
                h={hs[i]}
                title={x.title}
                body={x.text}
                color={diagramColors[i]}
                number={i + 1}
              />
              {i < v.items.length - 1 && (
                <Arrow marker={marker} path={`M520 ${y(i) + hs[i] + 2} v18`} />
              )}
            </g>
          ))}
        </>
      ),
    }
  }
  if (v.type === 'funnel') {
    const hs = v.stages.map((x) => Math.max(100, cardHeight(x.label, x.detail, 480)))
    const y = (i: number) => 35 + hs.slice(0, i).reduce((a, b) => a + b + 15, 0)
    return {
      height: y(hs.length),
      content: (
        <>
          {v.stages.map((x, i) => {
            const top = (x.value / v.stages[0].value) * 450
            const next = v.stages[i + 1]
            const bottom = ((next?.value ?? x.value * 0.8) / v.stages[0].value) * 450
            return (
              <g key={i}>
                <path
                  d={`M${260 - top / 2} ${y(i)} H${260 + top / 2} L${260 + bottom / 2} ${y(i) + hs[i]} H${260 - bottom / 2} Z`}
                  fill={diagramColors[i]}
                />
                {top >= 90 && (
                  <text
                    x={260}
                    y={y(i) + hs[i] / 2 + 8}
                    fontSize={24}
                    fontWeight={750}
                    fill="white"
                    textAnchor="middle"
                  >
                    {x.value}
                  </text>
                )}
                <Card
                  x={535}
                  y={y(i)}
                  w={480}
                  h={hs[i]}
                  title={x.label}
                  body={x.detail + ' · ' + x.value + ' ' + v.unit}
                  color={diagramColors[i]}
                />
              </g>
            )
          })}
        </>
      ),
    }
  }
  if (v.type === 'swimlanes') {
    const columns = Math.max(...v.lanes.map((l) => l.steps.length))
    const w = 792 / columns
    const hs = v.lanes.map((l) =>
      Math.max(100, ...l.steps.map((x) => cardHeight(x.title, x.text, w - 16))),
    )
    const y = (i: number) => 20 + hs.slice(0, i).reduce((a, b) => a + b + 22, 0)
    return {
      height: y(hs.length),
      content: (
        <>
          {v.lanes.map((l, i) => (
            <g key={i}>
              <rect
                x={20}
                y={y(i)}
                width={1000}
                height={hs[i]}
                rx={12}
                fill={i % 2 ? '#EEF2F8' : '#F8FAFC'}
              />
              <DiagramText
                text={l.title}
                x={38}
                y={y(i) + 35}
                width={150}
                size={22}
                bold
                color={diagramColors[i]}
              />
              {l.steps.map((x, j) => (
                <g key={j}>
                  <Card
                    x={212 + j * w}
                    y={y(i) + 2}
                    w={w - 16}
                    h={hs[i] - 4}
                    title={x.title}
                    body={x.text}
                    color={diagramColors[i]}
                  />
                  {j < l.steps.length - 1 && (
                    <Arrow
                      marker={marker}
                      path={`M${212 + j * w + w - 13} ${y(i) + hs[i] / 2} h9`}
                    />
                  )}
                </g>
              ))}
            </g>
          ))}
        </>
      ),
    }
  }
  return {
    height: 300,
    content: <DiagramText text="Тип схемы не поддерживается" x={24} y={50} width={992} />,
  }
}
