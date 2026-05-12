import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { fetchSectorIndices } from '../../lib/api'
import type { SectorData, SectorIndexMeta } from '../../lib/api'
import type { StockInfo } from '../../types/stock'
import type { Period } from '../../types/filter'

interface Props {
  stocks: StockInfo[]
  matrix: number[][]
  minCorr: number
  sectors?: SectorData[]
  period: Period
  onStockSelect: (stock: StockInfo) => void
}

interface XY {
  x: number
  y: number
}

interface GraphEdge {
  i: number
  j: number
  corr: number
}

interface LayoutOptions {
  minDistanceScale?: number
  centerPull?: number
  spreadScale?: number
  maxTargetScale?: number
}

interface DragState {
  layoutKey: number
  index: number
  pointerId: number
  offsetX: number
  offsetY: number
  moved: boolean
}

interface SuppressClickState {
  layoutKey: number
  index: number
}

const EMPTY_NODE_OVERRIDES: Record<number, XY> = {}

const SECTOR_LAYOUT_ORDER = [
  '電気機器',
  '半導体関連',
  '情報・通信業',
  '医薬品',
  '食料品',
  '小売業',
  '電気・ガス業',
  '建設業',
  '不動産業',
  '銀行業',
  '保険業',
  '証券業',
  '卸売業（総合商社）',
  '海運業',
  '陸運業',
  '輸送用機器',
  '機械',
  '化学',
]

const MAX_SECTOR_EDGES = 40
const SECTOR_OVERVIEW_MIN_CORR = 0.46
const MAX_SECTOR_OVERVIEW_EDGES = 26

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function corrColor(value: number): string {
  return value >= 0 ? 'var(--color-pos)' : 'var(--color-neg)'
}

function corrDirection(value: number): string {
  return value >= 0 ? '正相関' : '逆相関'
}

function strengthLabel(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 0.75) return 'とても強い'
  if (abs >= 0.55) return '強い'
  if (abs >= 0.35) return '中くらい'
  return '弱い'
}

function edgeStrokeWidth(value: number): number {
  const abs = Math.abs(value)
  return clamp(1 + Math.pow(abs, 2.2) * 14, 1.3, 11)
}

function edgeStrokeOpacity(value: number, active: boolean): number {
  if (active) return 0.98
  return clamp(0.12 + Math.pow(Math.abs(value), 1.65) * 0.86, 0.2, 0.9)
}

function sectorFocusStrokeOpacity(value: number): number {
  return clamp(0.16 + Math.pow(Math.abs(value), 1.55) * 0.84, 0.22, 0.94)
}

function sectorFocusStrokeWidth(value: number): number {
  const abs = Math.abs(value)
  return clamp(0.9 + Math.pow(abs, 2.15) * 14, 1.2, 11)
}

function sectorOrderRank(name: string): number {
  const index = SECTOR_LAYOUT_ORDER.indexOf(name)
  return index >= 0 ? index : SECTOR_LAYOUT_ORDER.length
}

function stableUnit(key: string): number {
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function organicNetworkLayout(
  count: number,
  size: { w: number; h: number },
  hitR: number,
  edges: GraphEdge[],
  yOffset = 0,
  rankAt?: (index: number) => number,
  options: LayoutOptions = {},
): XY[] {
  if (!count || !size.w || !size.h) return []

  const minDistanceScale = options.minDistanceScale ?? 1.45
  const centerPull = options.centerPull ?? 0.006
  const spreadScale = options.spreadScale ?? 1
  const maxTargetScale = options.maxTargetScale ?? 2.25
  const margin = Math.max(hitR + 18, 66)
  const center = {
    x: size.w / 2,
    y: size.h * (0.48 + yOffset),
  }

  if (count === 1) return [center]
  if (count === 2) {
    const spread = Math.min(size.w * 0.24, 180)
    return [
      { x: center.x - spread, y: center.y - Math.min(30, size.h * 0.06) },
      { x: center.x + spread, y: center.y + Math.min(30, size.h * 0.06) },
    ]
  }

  const rx = Math.max(110, Math.min(size.w * 0.39 * spreadScale, size.w / 2 - margin))
  const ry = Math.max(92, Math.min(size.h * 0.36 * spreadScale, size.h / 2 - margin - 28))
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const ordered = Array.from({ length: count }, (_, index) => index)
    .sort((a, b) => (rankAt?.(a) ?? a) - (rankAt?.(b) ?? b) || a - b)
  const points: XY[] = Array(count)

  ordered.forEach((index, slot) => {
    const progress = (slot + 0.5) / count
    const radius = Math.sqrt(progress) * (0.68 + stableUnit(`r:${count}:${index}`) * 0.24)
    const angle = -Math.PI / 2 + slot * goldenAngle + (stableUnit(`a:${count}:${index}`) - 0.5) * 0.55
    points[index] = {
      x: clamp(center.x + rx * radius * Math.cos(angle), margin, size.w - margin),
      y: clamp(center.y + ry * radius * Math.sin(angle), margin, size.h - margin - 34),
    }
  })

  const layoutEdges = edges
    .slice()
    .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))
    .slice(0, Math.max(10, count * 3))
  const minDistance = Math.max(hitR * minDistanceScale, 42)
  const iterations = clamp(Math.round(54 + count * 0.7), 60, 110)

  for (let step = 0; step < iterations; step++) {
    const cooling = 1 - step / iterations

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = points[i]
        const b = points[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 0.001) {
          dx = stableUnit(`dx:${i}:${j}`) - 0.5
          dy = stableUnit(`dy:${i}:${j}`) - 0.5
          dist = Math.sqrt(dx * dx + dy * dy)
        }
        const nx = dx / dist
        const ny = dy / dist
        const overlap = minDistance - dist
        const softRepel = Math.min(24, (minDistance * minDistance) / (dist * dist)) * 0.24 * cooling
        const force = overlap > 0 ? overlap * 0.22 * cooling + softRepel : softRepel
        a.x -= nx * force
        a.y -= ny * force
        b.x += nx * force
        b.y += ny * force
      }
    }

    for (const edge of layoutEdges) {
      const a = points[edge.i]
      const b = points[edge.j]
      if (!a || !b) continue
      const abs = Math.abs(edge.corr)
      const target = clamp(Math.min(size.w, size.h) * (0.33 - abs * 0.12), minDistance * 1.08, minDistance * maxTargetScale)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy))
      const pull = (dist - target) * (0.012 + abs * 0.02) * cooling
      const nx = dx / dist
      const ny = dy / dist
      a.x += nx * pull
      a.y += ny * pull
      b.x -= nx * pull
      b.y -= ny * pull
    }

    for (let i = 0; i < count; i++) {
      const point = points[i]
      point.x += (center.x - point.x) * centerPull * cooling
      point.y += (center.y - point.y) * centerPull * cooling
      point.x = clamp(point.x, margin, size.w - margin)
      point.y = clamp(point.y, margin, size.h - margin - 34)
    }
  }

  for (let pass = 0; pass < 24; pass++) {
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = points[i]
        const b = points[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 0.001) {
          dx = stableUnit(`final-dx:${i}:${j}`) - 0.5
          dy = stableUnit(`final-dy:${i}:${j}`) - 0.5
          dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy))
        }
        const overlap = minDistance - dist
        if (overlap <= 0) continue
        const nx = dx / dist
        const ny = dy / dist
        const push = overlap * 0.5
        a.x -= nx * push
        a.y -= ny * push
        b.x += nx * push
        b.y += ny * push
      }
    }
    for (const point of points) {
      point.x += (center.x - point.x) * centerPull * 0.35
      point.y += (center.y - point.y) * centerPull * 0.35
      point.x = clamp(point.x, margin, size.w - margin)
      point.y = clamp(point.y, margin, size.h - margin - 34)
    }
  }

  return points
}

function connectionSummary(
  edges: GraphEdge[],
  nodeIndex: number,
  nameAt: (index: number) => string,
): { name: string; corr: number }[] {
  return edges
    .filter(edge => edge.i === nodeIndex || edge.j === nodeIndex)
    .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))
    .slice(0, 3)
    .map(edge => {
      const other = edge.i === nodeIndex ? edge.j : edge.i
      return { name: nameAt(other), corr: edge.corr }
    })
}

function ensureConnectedEdges(edges: GraphEdge[], matrix: number[][], count: number): GraphEdge[] {
  const byKey = new Map(edges.map(edge => [edgeKey(edge.i, edge.j), edge]))

  for (let node = 0; node < count; node++) {
    const hasConnection = [...byKey.values()].some(edge => edge.i === node || edge.j === node)
    if (hasConnection) continue

    let strongest: GraphEdge | null = null
    for (let other = 0; other < count; other++) {
      if (other === node) continue
      const i = Math.min(node, other)
      const j = Math.max(node, other)
      const corr = matrix[i]?.[j] ?? matrix[j]?.[i] ?? 0
      const candidate = { i, j, corr }
      if (!strongest || Math.abs(candidate.corr) > Math.abs(strongest.corr)) {
        strongest = candidate
      }
    }

    if (strongest) byKey.set(edgeKey(strongest.i, strongest.j), strongest)
  }

  return [...byKey.values()]
}

function splitLabel(name: string): [string, string?] {
  if (name.length <= 5) return [name]
  const dot = name.indexOf('・')
  if (dot > 0 && dot < name.length - 1) return [name.slice(0, dot), name.slice(dot + 1)]
  const mid = Math.ceil(name.length / 2)
  return [name.slice(0, mid), name.slice(mid)]
}

function useElementSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, size }
}

function pointerPosition(event: PointerEvent, size: { w: number; h: number }): XY {
  const target = event.currentTarget as SVGElement
  const svg = target instanceof SVGSVGElement ? target : target.ownerSVGElement
  const rect = (svg ?? target).getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (size.w / Math.max(rect.width, 1)),
    y: (event.clientY - rect.top) * (size.h / Math.max(rect.height, 1)),
  }
}

function useDraggableNodes(baseNodes: XY[], size: { w: number; h: number }, hitR: number) {
  const layoutKey = baseNodes.length
  const [overridesByKey, setOverridesByKey] = useState<Record<number, Record<number, XY>>>({})
  const [drag, setDrag] = useState<DragState | null>(null)
  const [suppressClick, setSuppressClick] = useState<SuppressClickState | null>(null)
  const overrides = overridesByKey[layoutKey] ?? EMPTY_NODE_OVERRIDES
  const activeDrag = drag?.layoutKey === layoutKey ? drag : null

  const margin = Math.max(hitR + 8, 58)
  const nodes = useMemo(
    () => baseNodes.map((node, index) => {
      const saved = overrides[index]
      if (!saved || !size.w || !size.h) return node
      return {
        x: clamp(saved.x * size.w, margin, size.w - margin),
        y: clamp(saved.y * size.h, margin, size.h - margin - 34),
      }
    }),
    [baseNodes, overrides, size, margin],
  )

  const beginDrag = (index: number, event: PointerEvent<SVGGElement>) => {
    if (!nodes[index] || !size.w || !size.h) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointerPosition(event, size)
    setDrag({
      layoutKey,
      index,
      pointerId: event.pointerId,
      offsetX: point.x - nodes[index].x,
      offsetY: point.y - nodes[index].y,
      moved: false,
    })
  }

  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId || !size.w || !size.h) return
    event.preventDefault()
    const point = pointerPosition(event, size)
    const x = clamp(point.x - activeDrag.offsetX, margin, size.w - margin)
    const y = clamp(point.y - activeDrag.offsetY, margin, size.h - margin - 34)
    const previous = nodes[activeDrag.index] ?? { x, y }
    const moved = activeDrag.moved || Math.hypot(previous.x - x, previous.y - y) > 3
    setOverridesByKey(prev => ({
      ...prev,
      [layoutKey]: {
        ...(prev[layoutKey] ?? {}),
        [activeDrag.index]: { x: x / size.w, y: y / size.h },
      },
    }))
    if (moved !== activeDrag.moved) setDrag({ ...activeDrag, moved })
  }

  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
    if (activeDrag.moved) setSuppressClick({ layoutKey, index: activeDrag.index })
    setDrag(null)
  }

  const shouldSuppressClick = (index: number): boolean => {
    if (suppressClick?.layoutKey !== layoutKey || suppressClick.index !== index) return false
    setSuppressClick(null)
    return true
  }

  return {
    nodes,
    draggingIndex: activeDrag?.index ?? null,
    beginDrag,
    moveDrag,
    endDrag,
    shouldSuppressClick,
  }
}

function sectorSubmatrix(
  sectorStocks: StockInfo[],
  allStocks: StockInfo[],
  fullMatrix: number[][],
): number[][] {
  const idx = sectorStocks.map(s => allStocks.findIndex(a => a.code === s.code))
  return idx.map((i, row) => idx.map((j, col) =>
    i >= 0 && j >= 0 ? fullMatrix[i][j] : (row === col ? 1 : 0)
  ))
}

function buildFallbackSectorMatrix(sectors: SectorData[], stocks: StockInfo[], matrix: number[][]): number[][] {
  return sectors.map((sectorA, i) =>
    sectors.map((sectorB, j) => {
      if (i === j) return 1
      const idxA = sectorA.stocks.map(s => stocks.findIndex(a => a.code === s.code)).filter(n => n >= 0)
      const idxB = sectorB.stocks.map(s => stocks.findIndex(a => a.code === s.code)).filter(n => n >= 0)
      let sum = 0
      let count = 0
      for (const a of idxA) {
        for (const b of idxB) {
          sum += matrix[a][b]
          count++
        }
      }
      return count ? sum / count : 0
    })
  )
}

function edgeKey(i: number, j: number): string {
  return `${i}-${j}`
}

function parseEdgeKey(key: string | null): { i: number; j: number } | null {
  if (!key) return null
  const [i, j] = key.split('-').map(Number)
  return Number.isFinite(i) && Number.isFinite(j) ? { i, j } : null
}

function SectorNetwork({
  sectors,
  sectorMatrix,
  minCorr,
  onSelect,
}: {
  sectors: SectorIndexMeta[]
  sectorMatrix: number[][]
  minCorr: number
  onSelect: (name: string) => void
}) {
  const { ref, size } = useElementSize()
  const [hoveredNode, setHoveredNode] = useState<number | null>(null)
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null)
  const { isDark } = useTheme()
  const N = sectors.length
  const nodeR = clamp(Math.min(size.w, size.h) * 0.058, 28, 46)
  const hitR = nodeR + 12

  const edges = useMemo(() => {
    const result: GraphEdge[] = []
    const threshold = Math.max(minCorr, SECTOR_OVERVIEW_MIN_CORR)
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const c = sectorMatrix[i]?.[j] ?? 0
        if (Math.abs(c) >= threshold) result.push({ i, j, corr: c })
      }
    }
    const strongest = result
      .sort((a, b) => Math.abs(a.corr) - Math.abs(b.corr))
      .slice(-MAX_SECTOR_OVERVIEW_EDGES)
    return ensureConnectedEdges(strongest, sectorMatrix, N)
      .sort((a, b) => Math.abs(a.corr) - Math.abs(b.corr))
  }, [N, sectorMatrix, minCorr])

  const layoutEdges = useMemo(
    () => edges.slice().sort((a, b) => Math.abs(a.corr) - Math.abs(b.corr)).slice(-MAX_SECTOR_EDGES),
    [edges],
  )

  const baseNodes = useMemo<XY[]>(() => {
    if (!size.w || !size.h) return []
    return organicNetworkLayout(
      N,
      size,
      hitR,
      layoutEdges,
      -0.01,
      index => sectorOrderRank(sectors[index]?.name ?? ''),
      {
        minDistanceScale: 2.08,
        centerPull: 0.012,
        spreadScale: 0.92,
        maxTargetScale: 1.75,
      },
    )
  }, [size, sectors, N, hitR, layoutEdges])
  const {
    nodes,
    draggingIndex,
    beginDrag,
    moveDrag,
    endDrag,
    shouldSuppressClick,
  } = useDraggableNodes(baseNodes, size, hitR)

  const focusEdges = useMemo<GraphEdge[]>(() => {
    if (hoveredNode === null) return []
    return sectors
      .map((_, other) => {
        if (other === hoveredNode) return null
        const i = Math.min(hoveredNode, other)
        const j = Math.max(hoveredNode, other)
        return { i, j, corr: sectorMatrix[i]?.[j] ?? sectorMatrix[j]?.[i] ?? 0 }
      })
      .filter((edge): edge is GraphEdge => edge !== null)
      .sort((a, b) => Math.abs(a.corr) - Math.abs(b.corr))
  }, [hoveredNode, sectors, sectorMatrix])

  const hoveredEdge = parseEdgeKey(hoveredEdgeKey)
  const edgeCorr = hoveredEdge ? sectorMatrix[hoveredEdge.i]?.[hoveredEdge.j] ?? 0 : null
  const hoveredLinks = hoveredNode !== null
    ? connectionSummary(focusEdges, hoveredNode, index => sectors[index]?.name ?? '')
    : []
  const nodeShadow = isDark
    ? 'drop-shadow(0 3px 8px rgba(0,0,0,0.46))'
    : 'drop-shadow(0 3px 8px rgba(0,0,0,0.14))'

  return (
    <div ref={ref} className="w-full h-full relative overflow-hidden">
      {size.w > 0 && (
        <svg
          width={size.w}
          height={size.h}
          style={{ display: 'block', touchAction: 'none' }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
        >
          {edges.map(({ i, j, corr }) => {
            if (!nodes[i] || !nodes[j]) return null
            const key = edgeKey(i, j)
            const dimmedByFocus = hoveredNode !== null && hoveredNode !== i && hoveredNode !== j
            const active = !dimmedByFocus && (hoveredNode === i || hoveredNode === j || hoveredEdgeKey === key)
            return (
              <g key={key}>
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke="var(--color-paper)"
                  strokeWidth={edgeStrokeWidth(corr) + 4}
                  strokeOpacity={dimmedByFocus ? 0.14 : active ? 0.72 : 0.34}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke={corrColor(corr)}
                  strokeWidth={edgeStrokeWidth(corr)}
                  strokeOpacity={dimmedByFocus ? 0.08 : edgeStrokeOpacity(corr, active)}
                  strokeDasharray={corr < 0 ? '7 6' : undefined}
                  strokeLinecap="round"
                  pointerEvents="none"
                  style={{ transition: 'stroke-opacity 0.12s ease' }}
                />
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke="transparent"
                  strokeWidth={18}
                  pointerEvents="stroke"
                  onMouseEnter={() => setHoveredEdgeKey(key)}
                  onMouseLeave={() => setHoveredEdgeKey(null)}
                />
              </g>
            )
          })}

          {focusEdges.map(({ i, j, corr }) => {
            if (!nodes[i] || !nodes[j]) return null
            const key = `focus-${edgeKey(i, j)}`
            return (
              <g key={key} pointerEvents="none">
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke="var(--color-paper)"
                  strokeWidth={sectorFocusStrokeWidth(corr) + 5}
                  strokeOpacity={0.72}
                  strokeLinecap="round"
                />
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke={corrColor(corr)}
                  strokeWidth={sectorFocusStrokeWidth(corr)}
                  strokeOpacity={sectorFocusStrokeOpacity(corr)}
                  strokeDasharray={corr < 0 ? '7 6' : undefined}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-opacity 0.12s ease, stroke-width 0.12s ease' }}
                />
              </g>
            )
          })}

          {sectors.map((sector, i) => {
            if (!nodes[i]) return null
            const active = hoveredNode === i
            const [line1, line2] = splitLabel(sector.name)
            const labelSize = line2 ? 13 : sector.name.length > 4 ? 14 : 16
            return (
              <g
                key={sector.name}
                transform={`translate(${nodes[i].x},${nodes[i].y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => {
                  setHoveredNode(i)
                  setHoveredEdgeKey(null)
                }}
                onMouseLeave={() => setHoveredNode(null)}
                onPointerDown={(event) => beginDrag(i, event)}
                onClick={() => {
                  if (shouldSuppressClick(i)) return
                  onSelect(sector.name)
                }}
              >
                <circle r={hitR} fill="transparent" pointerEvents="all" />
                <circle
                  r={active ? nodeR + 3 : nodeR}
                  fill="var(--color-paper)"
                  stroke={sector.color}
                  strokeWidth={active ? 3.2 : 2.2}
                  pointerEvents="none"
                  style={{
                    filter: nodeShadow,
                    transition: draggingIndex === i ? 'none' : 'r 0.12s ease, stroke-width 0.12s ease',
                  }}
                />
                {line2 ? (
                  <>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} fontWeight={700} fill={sector.color} fontFamily="DM Sans, sans-serif" y={-11} pointerEvents="none">{line1}</text>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} fontWeight={700} fill={sector.color} fontFamily="DM Sans, sans-serif" y={4} pointerEvents="none">{line2}</text>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="var(--color-muted)" fontFamily="DM Mono, monospace" y={21} pointerEvents="none">{sector.stockCount} 銘柄</text>
                  </>
                ) : (
                  <>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} fontWeight={700} fill={sector.color} fontFamily="DM Sans, sans-serif" y={-6} pointerEvents="none">{line1}</text>
                    <text textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="var(--color-muted)" fontFamily="DM Mono, monospace" y={13} pointerEvents="none">{sector.stockCount} 銘柄</text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      )}

      <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none">
        {hoveredEdge && edgeCorr !== null ? (
          <CorrelationPanel
            left={sectors[hoveredEdge.i]?.name ?? ''}
            right={sectors[hoveredEdge.j]?.name ?? ''}
            corr={edgeCorr}
          />
        ) : hoveredNode !== null ? (
          <NodePanel
            title={sectors[hoveredNode]?.name ?? ''}
            subtitle="セクター"
            links={hoveredLinks}
          />
        ) : (
          <p className="text-[12px] text-muted font-mono">
            セクターをクリックすると銘柄ネットワークに移動します
          </p>
        )}
      </div>
      <Legend />
    </div>
  )
}

function StockNetwork({
  stocks,
  matrix,
  minCorr,
  sector,
  onBack,
  onStockSelect,
}: {
  stocks: StockInfo[]
  matrix: number[][]
  minCorr: number
  sector?: SectorData
  onBack?: () => void
  onStockSelect: (stock: StockInfo) => void
}) {
  const { ref, size } = useElementSize()
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<number | null>(null)
  const { isDark } = useTheme()
  const N = stocks.length
  const nodeR = clamp(
    Math.min(size.w, size.h) * 0.052 / Math.max(1, Math.sqrt(N / 10)),
    13,
    38,
  )
  const hitR = nodeR + 10

  const edges = useMemo(() => {
    const result: GraphEdge[] = []
    const threshold = Math.max(minCorr, 0)
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const c = matrix[i]?.[j] ?? 0
        if (Math.abs(c) >= threshold) result.push({ i, j, corr: c })
      }
    }
    return result.sort((a, b) => Math.abs(a.corr) - Math.abs(b.corr))
  }, [N, matrix, minCorr])

  const baseNodes = useMemo<XY[]>(() => {
    if (!size.w || !size.h) return []
    return organicNetworkLayout(N, size, hitR, edges, 0.01, undefined, {
      spreadScale: Math.max(1, 1 + (N - 12) * 0.038),
      minDistanceScale: Math.max(1.45, 1.45 + (N - 14) * 0.03),
      maxTargetScale: 2.6,
    })
  }, [size, N, hitR, edges])
  const {
    nodes,
    draggingIndex,
    beginDrag,
    moveDrag,
    endDrag,
    shouldSuppressClick,
  } = useDraggableNodes(baseNodes, size, hitR)

  const hoveredEdge = parseEdgeKey(hoveredEdgeKey)
  const hoveredCorr = hoveredEdge ? matrix[hoveredEdge.i]?.[hoveredEdge.j] ?? 0 : null
  const hoveredStock = hoveredNode !== null ? stocks[hoveredNode] : null
  const hoveredLinks = hoveredNode !== null
    ? connectionSummary(edges, hoveredNode, index => stocks[index]?.label ?? '')
    : []
  const nodeShadow = isDark
    ? 'drop-shadow(0 2px 7px rgba(0,0,0,0.48))'
    : 'drop-shadow(0 2px 6px rgba(0,0,0,0.12))'

  return (
    <div ref={ref} className="w-full h-full relative overflow-hidden">
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 sm:gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-muted hover:text-ink transition-colors text-[13px] bg-paper/85 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-sm border border-border cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            セクター一覧
          </button>
        )}
        {sector && (
          <div className="flex items-center gap-2 bg-paper/85 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-sm border border-border">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sector.color }} />
            <span className="text-[13px] font-semibold text-ink">{sector.name}</span>
            <span className="text-[11px] text-muted font-mono">{stocks.length} 銘柄</span>
          </div>
        )}
      </div>

      {size.w > 0 && (
        <svg
          width={size.w}
          height={size.h}
          style={{ display: 'block', touchAction: 'none' }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
        >
          {edges.map(({ i, j, corr }) => {
            if (!nodes[i] || !nodes[j]) return null
            const key = edgeKey(i, j)
            const active = hoveredEdgeKey === key || hoveredNode === i || hoveredNode === j
            return (
              <g key={key}>
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke="var(--color-paper)"
                  strokeWidth={edgeStrokeWidth(corr) + 4}
                  strokeOpacity={active ? 0.72 : 0.38}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke={corrColor(corr)}
                  strokeWidth={edgeStrokeWidth(corr)}
                  strokeOpacity={edgeStrokeOpacity(corr, active)}
                  strokeDasharray={corr < 0 ? '7 6' : undefined}
                  strokeLinecap="round"
                  pointerEvents="none"
                  style={{ transition: 'stroke-opacity 0.12s ease' }}
                />
                <line
                  x1={nodes[i].x}
                  y1={nodes[i].y}
                  x2={nodes[j].x}
                  y2={nodes[j].y}
                  stroke="transparent"
                  strokeWidth={18}
                  pointerEvents="stroke"
                  onMouseEnter={() => setHoveredEdgeKey(key)}
                  onMouseLeave={() => setHoveredEdgeKey(null)}
                />
              </g>
            )
          })}

          {stocks.map((stock, i) => {
            if (!nodes[i]) return null
            const active = hoveredNode === i
            return (
              <g
                key={stock.code}
                transform={`translate(${nodes[i].x},${nodes[i].y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => {
                  setHoveredNode(i)
                  setHoveredEdgeKey(null)
                }}
                onMouseLeave={() => setHoveredNode(null)}
                onPointerDown={(event) => beginDrag(i, event)}
                onClick={() => {
                  if (shouldSuppressClick(i)) return
                  onStockSelect(stock)
                }}
              >
                <circle r={hitR} fill="transparent" pointerEvents="all" />
                <circle
                  r={active ? nodeR + 2 : nodeR}
                  fill="var(--color-paper)"
                  stroke={sector?.color ?? 'var(--color-border)'}
                  strokeWidth={active ? 2.8 : 1.9}
                  pointerEvents="none"
                  style={{
                    filter: nodeShadow,
                    transition: draggingIndex === i ? 'none' : 'r 0.12s ease, stroke-width 0.12s ease',
                  }}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={N > 20 ? (stock.label.length > 4 ? 7 : 8) : stock.label.length > 5 ? 9 : 11}
                  fill="var(--color-ink)"
                  fontFamily="DM Sans, sans-serif"
                  fontWeight={700}
                  pointerEvents="none"
                  style={{ userSelect: 'none' }}
                >
                  {stock.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}

      {edges.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-[12px] text-muted font-mono">フィルターの相関係数下限を下げるとエッジが表示されます</p>
        </div>
      )}

      <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none">
        {hoveredEdge && hoveredCorr !== null ? (
          <CorrelationPanel
            left={stocks[hoveredEdge.i].name}
            right={stocks[hoveredEdge.j].name}
            corr={hoveredCorr}
          />
        ) : hoveredStock ? (
          <NodePanel
            title={hoveredStock.label}
            subtitle={hoveredStock.name}
            links={hoveredLinks}
          />
        ) : (
          <p className="text-[12px] text-muted font-mono">ノードをホバーすると接続を強調、エッジをホバーすると相関値を表示</p>
        )}
      </div>
      <Legend />
    </div>
  )
}

function StrengthMeter({ value }: { value: number }) {
  const abs = Math.abs(value)
  return (
    <div className="h-2 w-28 rounded-full bg-subtle overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{
          width: `${clamp(abs * 100, 6, 100)}%`,
          backgroundColor: corrColor(value),
        }}
      />
    </div>
  )
}

function CorrelationPanel({ left, right, corr }: { left: string; right: string; corr: number }) {
  return (
    <div className="bg-paper/90 backdrop-blur-sm rounded-xl px-4 py-3 shadow-sm border border-border/50 min-w-[280px]">
      <div className="flex items-center gap-2 text-[12px] font-mono min-w-0">
        <span className="font-medium text-ink truncate">{left}</span>
        <span className="text-muted shrink-0">x</span>
        <span className="font-medium text-ink truncate">{right}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold" style={{ color: corrColor(corr) }}>
            {strengthLabel(corr)}
          </span>
          <span className="text-[11px] text-muted">
            {corrDirection(corr)}
          </span>
        </div>
        <StrengthMeter value={corr} />
      </div>
    </div>
  )
}

function NodePanel({
  title,
  subtitle,
  links,
}: {
  title: string
  subtitle: string
  links: { name: string; corr: number }[]
}) {
  return (
    <div className="bg-paper/90 backdrop-blur-sm rounded-xl px-4 py-3 shadow-sm border border-border/50 min-w-[260px] max-w-[360px]">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-[13px] font-semibold text-ink truncate">{title}</span>
        <span className="text-[11px] text-muted truncate">{subtitle}</span>
      </div>
      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {links.map(link => (
            <span
              key={`${link.name}-${link.corr}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2 py-1 text-[11px]"
            >
              <span className="text-muted max-w-[96px] truncate">{link.name}</span>
              <span className="font-semibold" style={{ color: corrColor(link.corr) }}>
                {strengthLabel(link.corr)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-full border border-border/60 bg-paper/90 backdrop-blur-sm px-4 py-2 shadow-sm">
        <LegendLine label="弱" corr={0.3} />
        <LegendLine label="中" corr={0.55} />
        <LegendLine label="強" corr={0.82} />
        <LegendLine label="逆" corr={-0.65} dashed />
      </div>
    </div>
  )
}

function LegendLine({ label, corr, dashed }: { label: string; corr: number; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="36" height="10" aria-hidden>
        <line
          x1="2"
          y1="5"
          x2="34"
          y2="5"
          stroke={corrColor(corr)}
          strokeWidth={edgeStrokeWidth(corr)}
          strokeLinecap="round"
          strokeDasharray={dashed ? '6 5' : undefined}
          opacity={0.86}
        />
      </svg>
      <span className="text-[10px] text-muted font-mono">{label}</span>
    </div>
  )
}

export function NetworkGraph({ stocks, matrix, minCorr, sectors, period, onStockSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [sectorIndexState, setSectorIndexState] = useState<{
    period: Period
    sectors: SectorIndexMeta[]
    matrix: number[][]
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSectorIndices(period)
      .then(data => {
        if (!cancelled) setSectorIndexState({ period, ...data })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [period])

  const fallbackSectorMeta = useMemo<SectorIndexMeta[]>(
    () => (sectors ?? []).map(s => ({ name: s.name, color: s.color, stockCount: s.stocks.length })),
    [sectors],
  )
  const fallbackMatrix = useMemo(
    () => sectors ? buildFallbackSectorMatrix(sectors, stocks, matrix) : [],
    [sectors, stocks, matrix],
  )

  const sectorIndexData = sectorIndexState?.period === period ? sectorIndexState : null
  const sectorMeta = sectorIndexData?.sectors ?? fallbackSectorMeta
  const sectorMatrix = sectorIndexData?.matrix ?? fallbackMatrix
  const selectedSector = selected ? sectors?.find(s => s.name === selected) : undefined

  const header = (
    <header className="shrink-0 flex items-center gap-2 px-1.5 py-2 sm:px-4 lg:px-6 border-b border-border/70">
      <div className="shrink-0 flex flex-col justify-center">
        <p className="text-[10px] text-muted font-mono tracking-[0.08em] uppercase leading-none">Kaburela</p>
        <h2 className="text-[15px] font-semibold text-ink tracking-tight leading-tight">相関ネットワーク</h2>
      </div>
    </header>
  )

  if (selectedSector) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        {header}
        <div className="min-h-0 flex-1">
          <StockNetwork
            stocks={selectedSector.stocks}
            matrix={sectorSubmatrix(selectedSector.stocks, stocks, matrix)}
            minCorr={minCorr}
            sector={selectedSector}
            onBack={() => setSelected(null)}
            onStockSelect={onStockSelect}
          />
        </div>
      </div>
    )
  }

  if (sectorMeta.length > 0 && sectorMatrix.length > 0) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        {header}
        <div className="min-h-0 flex-1">
          <SectorNetwork
            sectors={sectorMeta}
            sectorMatrix={sectorMatrix}
            minCorr={minCorr}
            onSelect={setSelected}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {header}
      <div className="min-h-0 flex-1">
        <StockNetwork stocks={stocks} matrix={matrix} minCorr={minCorr} onStockSelect={onStockSelect} />
      </div>
    </div>
  )
}
