#!/usr/bin/env node
// 从 SKYLENS 快照生成"北京/上海地铁风格"的轨道交通示意图（SVG）。
//
// 用法：node scripts/generate-metro-map.mjs <快照目录> [输出目录] [--seed 数字] [--font 字体名]
//   快照目录：含 GeoJSON/、manifest.json、water-mask.png 的文件夹（桌面版地图库里的 maps/<id>，或游戏导出的快照）
//   输出目录：默认 ./metro-map-output
//
// 做了什么：
//   1. 读取 Route_Centerline / POI_Location，识别地铁线路和站点。游戏导出的每条线路都是"去程 + 回程"的闭合走向，
//      同一个站会出现两次（两个方向的站台）：这里按站名去重，线性线路画成一条线，只有真正的环线（内环/外环）才画成环。
//   2. 在网格上用模拟退火排布站点：线路只走 0°/45°/90°，站距均匀、少转弯、不交叉，同时尽量保留大致的东南西北关系。
//   3. 河流（来自水体遮罩）和山（城区里被建筑包围的圆形空地）用同一个平滑形变跟着站点一起移动，保持"线路过河"等关系。
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

// ======================================================================= 可调参数
export const CONFIG = {
  unit: 30, // 1 个网格单位 = 30 像素
  targetEdge: 4.6, // 相邻两站的理想距离（网格单位）
  minStationDistance: 3.4, // 任意两站之间的最小距离（网格单位）
  minEdgeLength: 3.2,
  stationEdgeClearance: 1.7, // 站点到不相干线路的最小距离
  restarts: 4,
  iterations: 220000,
  extraRestarts: 8,
  title: '轨道交通示意图',
  subtitle: 'RAIL TRANSIT NETWORK MAP',
  // 线路颜色：默认使用游戏里的颜色；黄色在白底上太浅，这里加深一点（想用原色就删掉对应的行）
  colorOverrides: { '#F9FF42': '#F2C300', '#B5B5B5': '#8F9AA3', '#A6A6A6': '#8F9AA3' },
  font: "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Source Han Sans SC',sans-serif",
  mountainName: '梨子山',
}

// ======================================================================= 工具函数
const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const mean = values => values.reduce((a, b) => a + b, 0) / values.length
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ======================================================================= 1. 提取线路与站点
export function buildNetwork(routesCollection, poiCollection) {
  const stopFeatures = poiCollection.features.filter(f => f.properties?.Category === 'StopSubway')
  if (!stopFeatures.length) throw new Error('快照里没有地铁站点（POI_Location 里没有 StopSubway）')
  const lat0 = mean(stopFeatures.map(f => f.geometry.coordinates[1]))
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110574
  const project = c => [c[0] * kx, c[1] * ky]
  const stops = stopFeatures.map(f => ({ name: f.properties.Name, p: project(f.geometry.coordinates) }))

  function nearestOnPolyline(poly, point) {
    let best = { distance: Infinity, along: 0 }
    let acc = 0
    for (let i = 0; i < poly.length - 1; i += 1) {
      const [ax, ay] = poly[i]
      const [bx, by] = poly[i + 1]
      const dx = bx - ax
      const dy = by - ay
      const l2 = dx * dx + dy * dy
      const length = Math.sqrt(l2)
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / l2))
      const distance = Math.hypot(point[0] - (ax + t * dx), point[1] - (ay + t * dy))
      if (distance < best.distance) best = { distance, along: acc + t * length }
      acc += length
    }
    return best
  }

  const rawLines = []
  for (const feature of routesCollection.features) {
    const p = feature.properties
    if (p?.Transport !== 'Subway' || feature.geometry.type !== 'LineString') continue
    const poly = feature.geometry.coordinates.map(project)
    const hits = []
    for (const stop of stops) {
      const near = nearestOnPolyline(poly, stop.p)
      if (near.distance < 40) hits.push({ along: near.along, name: stop.name })
    }
    hits.sort((a, b) => a.along - b.along)
    const sequence = []
    for (const hit of hits) if (!sequence.includes(hit.name)) sequence.push(hit.name)
    // 导出的 Stop 数：线性线路 = 2×站数−2（两个终点只停一次），环线 = 站数（每站只停一次）
    const isLoop = Number(p.Stop) === sequence.length
    rawLines.push({
      route: String(p.Route), name: p.Name, color: p.Color, sequence, isLoop,
      stopCount: Number(p.Stop), consistent: isLoop || Number(p.Stop) === 2 * sequence.length - 2,
    })
  }
  if (!rawLines.length) throw new Error('快照里没有地铁线路（Route_Centerline 里没有 Transport=Subway）')

  // 环线的内环/外环是同一条环线的两个方向：站点集合相同的环线合并成一条
  const lines = []
  for (const raw of rawLines) {
    const key = [...raw.sequence].sort().join('|')
    const twin = raw.isLoop ? lines.find(l => l.isLoop && l.key === key) : null
    if (twin) {
      twin.routes.push(raw.route)
      continue
    }
    lines.push({ ...raw, key, routes: [raw.route] })
  }
  for (const line of lines) {
    line.routes.sort((a, b) => Number(a) - Number(b))
    line.displayName = line.isLoop ? line.name.replace(/(内环|外环)$/, '') : line.name
    line.badge = line.routes.join('/')
  }
  lines.sort((a, b) => Number(a.routes[0]) - Number(b.routes[0]))

  // 站点：同名的所有站台视为同一个站（换乘站），位置取平均
  const stationMap = new Map()
  for (const stop of stops) {
    if (!stationMap.has(stop.name)) stationMap.set(stop.name, [])
    stationMap.get(stop.name).push(stop.p)
  }
  const stations = []
  const index = new Map()
  for (const line of lines) {
    for (const name of line.sequence) {
      if (index.has(name)) continue
      const points = stationMap.get(name)
      index.set(name, stations.length)
      stations.push({ name, geo: [mean(points.map(p => p[0])), mean(points.map(p => p[1]))], lines: [] })
    }
  }
  lines.forEach((line, lineIndex) => {
    line.stations = line.sequence.map(name => index.get(name))
    for (const s of line.stations) if (!stations[s].lines.includes(lineIndex)) stations[s].lines.push(lineIndex)
  })
  const edges = []
  lines.forEach((line, lineIndex) => {
    const count = line.stations.length
    for (let i = 0; i < count - 1; i += 1) edges.push({ a: line.stations[i], b: line.stations[i + 1], line: lineIndex })
    if (line.isLoop) edges.push({ a: line.stations[count - 1], b: line.stations[0], line: lineIndex })
  })
  return { lines, stations, edges, projection: { lat0, kx, ky } }
}

// ======================================================================= 2. 示意化排布（模拟退火）
function segmentsCross(p1, p2, p3, p4) {
  const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = o(p3, p4, p1)
  const d2 = o(p3, p4, p2)
  const d3 = o(p1, p2, p3)
  const d4 = o(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function layoutNetwork(network, { seed = 1, log = () => {} } = {}) {
  const { stations, edges, lines } = network
  const n = stations.length
  const { targetEdge, minStationDistance, minEdgeLength, stationEdgeClearance } = CONFIG

  // 地理位置 → 网格单位（上北下南，所以 y 取反）
  const metersPerUnit = median(edges.map(e => Math.hypot(
    stations[e.a].geo[0] - stations[e.b].geo[0], stations[e.a].geo[1] - stations[e.b].geo[1]))) / targetEdge
  const cx = mean(stations.map(s => s.geo[0]))
  const cy = mean(stations.map(s => s.geo[1]))
  const base = stations.map(s => [(s.geo[0] - cx) / metersPerUnit, -(s.geo[1] - cy) / metersPerUnit])
  const geoAngle = edges.map(e => Math.atan2(base[e.b][1] - base[e.a][1], base[e.b][0] - base[e.a][0]))

  const incident = Array.from({ length: n }, () => [])
  edges.forEach((e, i) => { incident[e.a].push(i); incident[e.b].push(i) })
  const adjacent = Array.from({ length: n }, () => new Set())
  for (const e of edges) { adjacent[e.a].add(e.b); adjacent[e.b].add(e.a) }

  // 同一条线上连续三站（用来惩罚急转弯）
  const triples = []
  lines.forEach(line => {
    const s = line.stations
    const count = s.length
    for (let i = 1; i < count - 1; i += 1) triples.push([s[i - 1], s[i], s[i + 1]])
    if (line.isLoop) {
      triples.push([s[count - 2], s[count - 1], s[0]])
      triples.push([s[count - 1], s[0], s[1]])
    }
  })
  const tripleOf = Array.from({ length: n }, () => [])
  triples.forEach((t, i) => { for (const s of new Set(t)) tripleOf[s].push(i) })

  const W = { oct: 60, len: 5, tooShort: 40, dir: 7, pos: 1.2, cross: 90, close: 40, clear: 40, turn: 1 }

  function edgeCost(e, X, Y) {
    const edge = edges[e]
    const dx = X[edge.b] - X[edge.a]
    const dy = Y[edge.b] - Y[edge.a]
    const length = Math.hypot(dx, dy)
    if (length === 0) return 1e4
    const angle = Math.atan2(dy, dx)
    const step = Math.PI / 4
    const deviation = Math.abs(angle - Math.round(angle / step) * step) / step // 0..0.5
    let cost = W.oct * deviation * deviation * 4 * 0.5 + W.oct * deviation * 0.5
    cost += W.len * ((length - targetEdge) / targetEdge) ** 2
    if (length < minEdgeLength) cost += W.tooShort * (minEdgeLength - length) ** 2
    let diff = Math.abs(angle - geoAngle[e])
    if (diff > Math.PI) diff = 2 * Math.PI - diff
    cost += W.dir * (diff / step) ** 2
    return cost
  }

  function tripleCost(t, X, Y) {
    const [a, b, c] = triples[t]
    const ux = X[b] - X[a]
    const uy = Y[b] - Y[a]
    const vx = X[c] - X[b]
    const vy = Y[c] - Y[b]
    const lu = Math.hypot(ux, uy)
    const lv = Math.hypot(vx, vy)
    if (!lu || !lv) return 1e4
    const turn = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) // 0 = 直行
    let cost = W.turn * 2 * (turn / (Math.PI / 4)) ** 1.5
    if (turn > Math.PI / 2 + 0.01) cost += 50 * ((turn - Math.PI / 2) / (Math.PI / 2))
    return cost
  }

  function localCost(i, X, Y) {
    let cost = 0
    for (const e of incident[i]) cost += edgeCost(e, X, Y)
    for (const t of tripleOf[i]) cost += tripleCost(t, X, Y)
    const bx = base[i][0]
    const by = base[i][1]
    cost += W.pos * (Math.hypot(X[i] - bx, Y[i] - by) / 8) ** 2
    for (let j = 0; j < n; j += 1) {
      if (j === i || adjacent[i].has(j)) continue
      const d = Math.hypot(X[i] - X[j], Y[i] - Y[j])
      if (d < minStationDistance) cost += W.close * (minStationDistance - d) ** 2
    }
    for (let e = 0; e < edges.length; e += 1) {
      const edge = edges[e]
      if (edge.a === i || edge.b === i) continue
      const d = pointSegmentDistance(X[i], Y[i], X[edge.a], Y[edge.a], X[edge.b], Y[edge.b])
      if (d < stationEdgeClearance) cost += W.clear * (stationEdgeClearance - d) ** 2
    }
    for (const e of incident[i]) {
      const edge = edges[e]
      const pa = [X[edge.a], Y[edge.a]]
      const pb = [X[edge.b], Y[edge.b]]
      for (let k = 0; k < n; k += 1) {
        if (k === edge.a || k === edge.b) continue
        const d = pointSegmentDistance(X[k], Y[k], pa[0], pa[1], pb[0], pb[1])
        if (d < stationEdgeClearance) cost += W.clear * (stationEdgeClearance - d) ** 2
      }
      for (let f = 0; f < edges.length; f += 1) {
        const other = edges[f]
        if (f === e || other.a === edge.a || other.a === edge.b || other.b === edge.a || other.b === edge.b) continue
        if (segmentsCross(pa, pb, [X[other.a], Y[other.a]], [X[other.b], Y[other.b]])) cost += W.cross
      }
    }
    return cost
  }

  function totalCost(X, Y) {
    let cost = 0
    for (let e = 0; e < edges.length; e += 1) cost += edgeCost(e, X, Y)
    for (let t = 0; t < triples.length; t += 1) cost += tripleCost(t, X, Y)
    for (let i = 0; i < n; i += 1) {
      cost += W.pos * (Math.hypot(X[i] - base[i][0], Y[i] - base[i][1]) / 8) ** 2
      for (let j = i + 1; j < n; j += 1) {
        if (adjacent[i].has(j)) continue
        const d = Math.hypot(X[i] - X[j], Y[i] - Y[j])
        if (d < minStationDistance) cost += W.close * (minStationDistance - d) ** 2
      }
      for (let e = 0; e < edges.length; e += 1) {
        const edge = edges[e]
        if (edge.a === i || edge.b === i) continue
        const d = pointSegmentDistance(X[i], Y[i], X[edge.a], Y[edge.a], X[edge.b], Y[edge.b])
        if (d < stationEdgeClearance) cost += W.clear * (stationEdgeClearance - d) ** 2
      }
    }
    for (let e = 0; e < edges.length; e += 1) {
      for (let f = e + 1; f < edges.length; f += 1) {
        const a = edges[e]
        const b = edges[f]
        if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue
        if (segmentsCross([X[a.a], Y[a.a]], [X[a.b], Y[a.b]], [X[b.a], Y[b.a]], [X[b.b], Y[b.b]])) cost += W.cross
      }
    }
    return cost
  }

  function countCrossings(X, Y) {
    let count = 0
    for (let e = 0; e < edges.length; e += 1) {
      for (let f = e + 1; f < edges.length; f += 1) {
        const a = edges[e]
        const b = edges[f]
        if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue
        if (segmentsCross([X[a.a], Y[a.a]], [X[a.b], Y[a.b]], [X[b.a], Y[b.a]], [X[b.b], Y[b.b]])) count += 1
      }
    }
    return count
  }

  const countNonOctilinear = (X, Y) => edges.filter(e => {
    const dx = X[e.b] - X[e.a]
    const dy = Y[e.b] - Y[e.a]
    return !(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))
  }).length

  // 先做 CONFIG.restarts 次；如果最好的一次仍然有线路交叉或非八方向的区间，再多试几次（最多 8 次）。
  // 排序依据：（交叉数，非八方向区间数，代价）
  let best = null
  const clean = candidate => candidate.crossings === 0 && candidate.nonOctilinear === 0
  const isBetter = (a, b) => !b || a.crossings < b.crossings || (a.crossings === b.crossings && (a.nonOctilinear < b.nonOctilinear || (a.nonOctilinear === b.nonOctilinear && a.cost < b.cost)))
  for (let restart = 0; restart < CONFIG.restarts + CONFIG.extraRestarts; restart += 1) {
    if (restart >= CONFIG.restarts && best && clean(best)) break
    const random = mulberry32(seed * 1000 + restart)
    const X = base.map(p => Math.round(p[0] + (random() - 0.5) * 2))
    const Y = base.map(p => Math.round(p[1] + (random() - 0.5) * 2))
    const T0 = 7
    const T1 = 0.04
    const N = CONFIG.iterations
    for (let step = 0; step < N; step += 1) {
      const T = T0 * (T1 / T0) ** (step / N)
      const i = Math.floor(random() * n)
      const radius = T > 2 ? 4 : T > 0.5 ? 2 : 1
      const dx = Math.floor(random() * (2 * radius + 1)) - radius
      const dy = Math.floor(random() * (2 * radius + 1)) - radius
      if (dx === 0 && dy === 0) continue
      const before = localCost(i, X, Y)
      X[i] += dx
      Y[i] += dy
      const delta = localCost(i, X, Y) - before
      if (delta > 0 && random() > Math.exp(-delta / T)) { X[i] -= dx; Y[i] -= dy }
    }
    const cost = totalCost(X, Y)
    const crossings = countCrossings(X, Y)
    const nonOctilinear = countNonOctilinear(X, Y)
    log(`  restart ${restart + 1}: cost ${cost.toFixed(1)}${crossings ? `，${crossings} 处线路交叉` : ''}${nonOctilinear ? `，${nonOctilinear} 条非八方向区间` : ''}`)
    const candidate = { cost, crossings, nonOctilinear, X: [...X], Y: [...Y] }
    if (isBetter(candidate, best)) best = candidate
  }
  const minX = Math.min(...best.X)
  const minY = Math.min(...best.Y)
  return {
    positions: best.X.map((x, i) => [x - minX, best.Y[i] - minY]),
    base: base.map(p => [p[0] - (minX), p[1] - (minY)]),
    cost: best.cost,
    metersPerUnit,
    center: [cx, cy],
    offset: [minX, minY],
    baseRaw: base,
  }
}

// ======================================================================= 3. 连线（0/45/90 度）
export function routeEdge(pa, pb, preferDiagonalFirst) {
  const dx = pb[0] - pa[0]
  const dy = pb[1] - pa[1]
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (dx === 0 || dy === 0 || adx === ady) return [pa, pb]
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const diagonal = Math.min(adx, ady)
  const corner = preferDiagonalFirst
    ? [pa[0] + sx * diagonal, pa[1] + sy * diagonal]
    : adx > ady ? [pb[0] - sx * diagonal, pa[1]] : [pa[0], pb[1] - sy * diagonal]
  // 先对角再直线：到 corner 之后沿剩余的轴向走；先直线再对角：先走轴向再对角
  const mid = preferDiagonalFirst
    ? corner
    : corner
  return [pa, mid, pb]
}

export function chooseEdgeRoutes(network, positions) {
  const { edges, stations } = network
  const routes = edges.map(e => routeEdge(positions[e.a], positions[e.b], true))
  // 对每条非直线边，在“先对角/先直线”两种折法里选和其他站点/线路冲突较少的
  const polylines = routes.map(r => r)
  const score = (polyline, selfIndex) => {
    let s = 0
    for (let k = 0; k < polyline.length - 1; k += 1) {
      for (let st = 0; st < stations.length; st += 1) {
        if (st === edges[selfIndex].a || st === edges[selfIndex].b) continue
        const d = pointSegmentDistance(positions[st][0], positions[st][1], polyline[k][0], polyline[k][1], polyline[k + 1][0], polyline[k + 1][1])
        if (d < 1.2) s += (1.2 - d) * 20
      }
      for (let f = 0; f < polylines.length; f += 1) {
        if (f === selfIndex) continue
        const other = edges[f]
        const mine = edges[selfIndex]
        if (other.a === mine.a || other.a === mine.b || other.b === mine.a || other.b === mine.b) continue
        for (let m = 0; m < polylines[f].length - 1; m += 1) {
          if (segmentsCross(polyline[k], polyline[k + 1], polylines[f][m], polylines[f][m + 1])) s += 10
        }
      }
    }
    return s
  }
  edges.forEach((e, i) => {
    if (routes[i].length === 2) return
    const first = routeEdge(positions[e.a], positions[e.b], true)
    const second = routeEdge(positions[e.a], positions[e.b], false)
    polylines[i] = first
    const s1 = score(first, i)
    polylines[i] = second
    const s2 = score(second, i)
    polylines[i] = s1 <= s2 ? first : second
  })
  return polylines
}

// ======================================================================= 4. 河流、山：与站点一起形变
function solveLinearSystem(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    const d = M[col][col] || 1e-12
    for (let c = col; c <= n; c += 1) M[col][c] /= d
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue
      const f = M[r][col]
      if (f) for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c]
    }
  }
  return M.map(row => row[n])
}

// 薄板样条（TPS）：把"地理位置（网格单位）"平滑地映射到"示意图位置"，控制点之间的区域按平滑插值
export function makeWarp(sources, targets, lambda = 1.5) {
  const n = sources.length
  const phi = r2 => (r2 === 0 ? 0 : 0.5 * r2 * Math.log(r2))
  const size = n + 3
  const A = Array.from({ length: size }, () => new Array(size).fill(0))
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const dx = sources[i][0] - sources[j][0]
      const dy = sources[i][1] - sources[j][1]
      A[i][j] = phi(dx * dx + dy * dy) + (i === j ? lambda : 0)
    }
    A[i][n] = 1
    A[i][n + 1] = sources[i][0]
    A[i][n + 2] = sources[i][1]
    A[n][i] = 1
    A[n + 1][i] = sources[i][0]
    A[n + 2][i] = sources[i][1]
  }
  const solve = dim => solveLinearSystem(A, [...targets.map(t => t[dim]), 0, 0, 0])
  const cx = solve(0)
  const cy = solve(1)
  return p => {
    let x = cx[n] + cx[n + 1] * p[0] + cx[n + 2] * p[1]
    let y = cy[n] + cy[n + 1] * p[0] + cy[n + 2] * p[1]
    for (let i = 0; i < n; i += 1) {
      const dx = p[0] - sources[i][0]
      const dy = p[1] - sources[i][1]
      const f = phi(dx * dx + dy * dy)
      x += cx[i] * f
      y += cy[i] * f
    }
    return [x, y]
  }
}

function rdp(points, tolerance) {
  if (points.length < 3) return points
  const [a, b] = [points[0], points[points.length - 1]]
  let index = 0
  let max = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = pointSegmentDistance(points[i][0], points[i][1], a[0], a[1], b[0], b[1])
    if (d > max) { max = d; index = i }
  }
  if (max <= tolerance) return [a, b]
  return [...rdp(points.slice(0, index + 1), tolerance).slice(0, -1), ...rdp(points.slice(index), tolerance)]
}

export function chaikin(points, iterations = 2) {
  let current = points
  for (let it = 0; it < iterations; it += 1) {
    const next = []
    for (let i = 0; i < current.length; i += 1) {
      const p = current[i]
      const q = current[(i + 1) % current.length]
      next.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]])
    }
    current = next
  }
  return current
}

// 行进方块法：从二维网格里提取等值线（外面补一圈 0，所以每条轮廓都是闭合的）
export function contours(grid, w, h, level) {
  const W = w + 2
  const H = h + 2
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : grid[j * w + i])
  const segments = new Map()
  const point = new Map()
  const edgePoint = (i, j, horizontal) => {
    const key = `${horizontal ? 'h' : 'v'}${i},${j}`
    if (!point.has(key)) {
      const a = at(i, j)
      const b = horizontal ? at(i + 1, j) : at(i, j + 1)
      const t = (level - a) / (b - a || 1e-9)
      point.set(key, horizontal ? [i + t, j] : [i, j + t])
    }
    return key
  }
  const link = (p, q) => {
    if (!segments.has(p)) segments.set(p, [])
    if (!segments.has(q)) segments.set(q, [])
    segments.get(p).push(q)
    segments.get(q).push(p)
  }
  for (let j = -1; j < H - 1; j += 1) {
    for (let i = -1; i < W - 1; i += 1) {
      const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)].map(x => x >= level)
      const code = (v[0] ? 8 : 0) | (v[1] ? 4 : 0) | (v[2] ? 2 : 0) | (v[3] ? 1 : 0)
      if (code === 0 || code === 15) continue
      const top = () => edgePoint(i, j, true)
      const bottom = () => edgePoint(i, j + 1, true)
      const left = () => edgePoint(i, j, false)
      const right = () => edgePoint(i + 1, j, false)
      switch (code) {
        case 1: case 14: link(left(), bottom()); break
        case 2: case 13: link(bottom(), right()); break
        case 3: case 12: link(left(), right()); break
        case 4: case 11: link(top(), right()); break
        case 6: case 9: link(top(), bottom()); break
        case 7: case 8: link(left(), top()); break
        case 5: link(left(), top()); link(bottom(), right()); break
        case 10: link(top(), right()); link(left(), bottom()); break
        default: break
      }
    }
  }
  const used = new Set()
  const loops = []
  for (const start of segments.keys()) {
    if (used.has(start)) continue
    const loop = []
    let previous = null
    let current = start
    while (current && !used.has(current)) {
      used.add(current)
      loop.push(point.get(current))
      const next = segments.get(current).find(n => n !== previous && !used.has(n))
      previous = current
      current = next
    }
    if (loop.length > 3) loops.push(loop)
  }
  return loops
}

function polygonArea(points) {
  let a = 0
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(a) / 2
}

// 水体遮罩 → 一组闭合多边形（地理米坐标）
async function loadWaterPolygons(snapshotDir, network) {
  let manifest
  let image
  try {
    manifest = await readJson(path.join(snapshotDir, 'manifest.json'))
    const { PNG } = require('pngjs')
    image = PNG.sync.read(await readFile(path.join(snapshotDir, 'water-mask.png')))
  } catch {
    return []
  }
  const water = manifest.rasters?.water
  if (!water?.bounds) return []
  const [minLon, minLat, maxLon, maxLat] = water.bounds
  const { kx, ky } = network.projection
  const f = 4
  const w = Math.floor(image.width / f)
  const h = Math.floor(image.height / f)
  const grid = new Float32Array(w * h)
  for (let y = 0; y < h * f; y += 1) {
    for (let x = 0; x < w * f; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] > 127) grid[Math.floor(y / f) * w + Math.floor(x / f)] += 1 / (f * f)
    }
  }
  // 轻微模糊，让轮廓更平滑
  const blurred = new Float32Array(grid.length)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0
      let weight = 0
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const k = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1
        sum += grid[yy * w + xx] * k
        weight += k
      }
      blurred[y * w + x] = sum / weight
    }
  }
  const toMeters = ([i, j]) => {
    const lon = minLon + ((i + 0.5) / w) * (maxLon - minLon)
    const lat = maxLat - ((j + 0.5) / h) * (maxLat - minLat)
    return [lon * kx, lat * ky]
  }
  const cellMeters = ((maxLon - minLon) * kx) / w
  return contours(blurred, w, h, 0.5)
    .filter(loop => polygonArea(loop) * cellMeters * cellMeters > 120000)
    .map(loop => rdp([...loop, loop[0]], 0.9).slice(0, -1).map(toMeters))
}

// 在城区里找"被建筑和道路包围的圆形空地"，当作山（例如中央城区的梨子山）
async function detectMountain(snapshotDir, network, waterPolygons) {
  let buildings
  let roads
  try {
    buildings = await readJson(path.join(snapshotDir, 'GeoJSON', 'Building_Boundary.json'))
    roads = await readJson(path.join(snapshotDir, 'GeoJSON', 'Network_Centerline.json'))
  } catch {
    return null
  }
  const { kx, ky } = network.projection
  const pts = []
  for (const feature of buildings.features) {
    const g = feature.geometry
    const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0]?.[0]
    for (const c of ring ?? []) pts.push([c[0] * kx, c[1] * ky])
  }
  for (const feature of roads.features) {
    if (feature.geometry.type !== 'LineString') continue
    for (const c of feature.geometry.coordinates) pts.push([c[0] * kx, c[1] * ky])
  }
  if (!pts.length) return null
  const CELL = 40
  let minPx = Infinity
  let maxPx = -Infinity
  let minPy = Infinity
  let maxPy = -Infinity
  for (const p of pts) { // 点很多（几十万），不能用 Math.min(...数组)（会爆栈）
    if (p[0] < minPx) minPx = p[0]
    if (p[0] > maxPx) maxPx = p[0]
    if (p[1] < minPy) minPy = p[1]
    if (p[1] > maxPy) maxPy = p[1]
  }
  const x0 = minPx - 200
  const y0 = minPy - 200
  const W = Math.ceil((maxPx - x0) / CELL) + 6
  const H = Math.ceil((maxPy - y0) / CELL) + 6
  const occupied = new Uint8Array(W * H)
  const mark = (x, y) => {
    const i = Math.floor((x - x0) / CELL)
    const j = Math.floor((y - y0) / CELL)
    if (i >= 0 && j >= 0 && i < W && j < H) occupied[j * W + i] = 1
  }
  for (const p of pts) mark(p[0], p[1])
  const dilate = source => {
    const grown = new Uint8Array(W * H)
    for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) {
      if (!source[j * W + i]) continue
      for (let dj = -1; dj <= 1; dj += 1) for (let di = -1; di <= 1; di += 1) {
        const ii = i + di
        const jj = j + dj
        if (ii >= 0 && jj >= 0 && ii < W && jj < H) grown[jj * W + ii] = 1
      }
    }
    return grown
  }
  const urban = dilate(occupied) // 仅建筑和道路（用来衡量"被城区包围"）
  // 水面也算占用，这样不会把河面当成山；岛屿/山不是水（奇偶规则）
  const boxes = waterPolygons.map(polygon => {
    let x1 = Infinity
    let x2 = -Infinity
    let y1 = Infinity
    let y2 = -Infinity
    for (const p of polygon) { if (p[0] < x1) x1 = p[0]; if (p[0] > x2) x2 = p[0]; if (p[1] < y1) y1 = p[1]; if (p[1] > y2) y2 = p[1] }
    return [x1, y1, x2, y2]
  })
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const p = [x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL]
      let count = 0
      for (let k = 0; k < waterPolygons.length; k += 1) {
        const [bx1, by1, bx2, by2] = boxes[k]
        if (p[0] >= bx1 && p[0] <= bx2 && p[1] >= by1 && p[1] <= by2 && pointInPolygon(p, waterPolygons[k])) count += 1
      }
      if (count % 2 === 1) occupied[j * W + i] = 1
    }
  }
  const grown = dilate(occupied)
  const INF = 1e12
  const f = new Float64Array(W * H)
  for (let k = 0; k < f.length; k += 1) f[k] = grown[k] ? 0 : INF
  const dt1d = (src, length) => {
    const d = new Float64Array(length)
    const v = new Int32Array(length)
    const z = new Float64Array(length + 1)
    let k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for (let q = 1; q < length; q += 1) {
      let s
      do {
        const p = v[k]
        s = ((src[q] + q * q) - (src[p] + p * p)) / (2 * q - 2 * p)
        if (s <= z[k]) k -= 1
        else break
      } while (k >= 0)
      k += 1
      v[k] = q
      z[k] = s
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < length; q += 1) {
      while (z[k + 1] < q) k += 1
      d[q] = (q - v[k]) ** 2 + src[v[k]]
    }
    return d
  }
  for (let i = 0; i < W; i += 1) {
    const col = new Float64Array(H)
    for (let j = 0; j < H; j += 1) col[j] = f[j * W + i]
    const d = dt1d(col, H)
    for (let j = 0; j < H; j += 1) f[j * W + i] = d[j]
  }
  for (let j = 0; j < H; j += 1) {
    const row = f.slice(j * W, (j + 1) * W)
    const d = dt1d(row, W)
    for (let i = 0; i < W; i += 1) f[j * W + i] = d[i]
  }
  const distance = k => Math.sqrt(Math.min(f[k], INF)) * CELL
  const ringOccupancy = (i, j, r) => {
    const r1 = r * 1.15
    const r2 = r * 1.9
    let count = 0
    let total = 0
    const R = Math.ceil(r2)
    for (let jj = j - R; jj <= j + R; jj += 1) for (let ii = i - R; ii <= i + R; ii += 1) {
      const d = Math.hypot(ii - i, jj - j)
      if (d < r1 || d > r2) continue
      total += 1
      if (ii >= 0 && jj >= 0 && ii < W && jj < H && urban[jj * W + ii]) count += 1
    }
    return count / Math.max(total, 1)
  }
  let best = null
  for (let j = 0; j < H; j += 2) {
    for (let i = 0; i < W; i += 2) {
      const r = distance(j * W + i)
      if (r < 450) continue
      const occ = ringOccupancy(i, j, r / CELL)
      const score = r * occ * occ
      if (occ >= 0.7 && (!best || score > best.score)) best = { score, r, occ, x: x0 + (i + 0.5) * CELL, y: y0 + (j + 0.5) * CELL }
    }
  }
  return best ? { center: [best.x, best.y], radius: best.r, enclosure: best.occ } : null
}

// 水面由若干闭合轮廓组成（外轮廓 + 岛屿的内轮廓）：被奇数个轮廓包围的点才在水里
export function pointInWater(p, polygons) {
  let count = 0
  for (const polygon of polygons) if (pointInPolygon(p, polygon)) count += 1
  return count % 2 === 1
}

function pointInPolygon(p, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// ======================================================================= 5. 标注与绘制
const textWidth = (text, size) => [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? size : size * 0.58), 0)

function roundedPath(points, radius, closed = false) {
  const clean = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1])
  if (closed && clean.length > 1 && clean[0][0] === clean[clean.length - 1][0] && clean[0][1] === clean[clean.length - 1][1]) clean.pop()
  const n = clean.length
  if (n < 3 && !closed) return `M${clean.map(p => `${p[0]},${p[1]}`).join('L')}`
  const corner = (prev, cur, next) => {
    const l1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
    const l2 = Math.hypot(next[0] - cur[0], next[1] - cur[1])
    const r = Math.min(radius, l1 / 2, l2 / 2)
    return [
      [cur[0] + ((prev[0] - cur[0]) / l1) * r, cur[1] + ((prev[1] - cur[1]) / l1) * r],
      [cur[0] + ((next[0] - cur[0]) / l2) * r, cur[1] + ((next[1] - cur[1]) / l2) * r],
    ]
  }
  const f = v => v.toFixed(1)
  if (closed) {
    let d = ''
    for (let i = 0; i < n; i += 1) {
      const [p1, p2] = corner(clean[(i + n - 1) % n], clean[i], clean[(i + 1) % n])
      d += `${i ? 'L' : 'M'}${f(p1[0])},${f(p1[1])}Q${clean[i][0]},${clean[i][1]} ${f(p2[0])},${f(p2[1])}`
    }
    return `${d}Z`
  }
  let d = `M${clean[0][0]},${clean[0][1]}`
  for (let i = 1; i < n - 1; i += 1) {
    const [p1, p2] = corner(clean[i - 1], clean[i], clean[i + 1])
    d += `L${f(p1[0])},${f(p1[1])}Q${clean[i][0]},${clean[i][1]} ${f(p2[0])},${f(p2[1])}`
  }
  return `${d}L${clean[n - 1][0]},${clean[n - 1][1]}`
}

const escapeXml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function lineColor(line) {
  return CONFIG.colorOverrides[line.color?.toUpperCase()] ?? line.color
}

const isLight = hex => {
  const v = parseInt(hex.slice(1), 16)
  return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) > 170
}

// 站名标注：每个站在 8 个候选位置里选一个与线路、站点、其他标注冲突最少的
function placeLabels(network, pixelPositions, linePaths, obstacles, canvas) {
  const size = 16
  const stations = network.stations
  const samples = []
  for (const path of linePaths) {
    for (let k = 0; k < path.length - 1; k += 1) {
      const [a, b] = [path[k], path[k + 1]]
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4))
      for (let s = 0; s <= steps; s += 1) samples.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps])
    }
  }
  const candidatesFor = i => {
    const [x, y] = pixelPositions[i]
    const w = textWidth(stations[i].name, size)
    const r = stations[i].lines.length > 1 ? 11 : 6.5
    const d = r + 7
    const h = size
    const make = (name, bx, by, anchor, cost) => ({ name, anchor, cost, box: [bx, by, bx + w, by + h], x: anchor === 'start' ? bx : anchor === 'end' ? bx + w : bx + w / 2, y: by + h - 3 })
    const e = x + d
    const wl = x - d - w
    const c = x - w / 2
    return [
      make('E', e, y - h / 2, 'start', 0), make('W', wl, y - h / 2, 'end', 0.8),
      make('N', c, y - d - h + 2, 'middle', 1.6), make('S', c, y + d - 2, 'middle', 1.6),
      make('NE', x + d * 0.75, y - d * 0.75 - h + 3, 'start', 1.2), make('SE', x + d * 0.75, y + d * 0.75 - 2, 'start', 1.2),
      make('NW', x - d * 0.75 - w, y - d * 0.75 - h + 3, 'end', 2), make('SW', x - d * 0.75 - w, y + d * 0.75 - 2, 'end', 2),
    ]
  }
  const overlapArea = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const penalty = (i, cand, placed) => {
    let p = cand.cost
    const [x0, y0, x1, y1] = cand.box
    if (x0 < 4 || y0 < 4 || x1 > canvas.width - 4 || y1 > canvas.height - 4) p += 200
    for (const s of samples) if (s[0] > x0 - 3 && s[0] < x1 + 3 && s[1] > y0 - 2 && s[1] < y1 + 2) p += 4
    pixelPositions.forEach((q, j) => {
      if (j === i) return
      if (q[0] > x0 - 9 && q[0] < x1 + 9 && q[1] > y0 - 9 && q[1] < y1 + 9) p += 40
    })
    for (const ob of obstacles) p += overlapArea(cand.box, ob) > 0 ? 60 : 0
    placed.forEach((other, j) => { if (other && j !== i) { const a = overlapArea(cand.box, other.box); if (a > 0) p += 30 + a / 20 } })
    return p
  }
  const order = stations.map((s, i) => i).sort((a, b) => stations[b].lines.length - stations[a].lines.length)
  const placed = new Array(stations.length).fill(null)
  for (const i of order) {
    let best = null
    for (const cand of candidatesFor(i)) { const p = penalty(i, cand, placed); if (!best || p < best.p) best = { p, cand } }
    placed[i] = best.cand
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (const i of order) {
      let best = null
      for (const cand of candidatesFor(i)) { const p = penalty(i, cand, placed); if (!best || p < best.p) best = { p, cand } }
      placed[i] = best.cand
    }
  }
  return placed.map(c => ({ ...c, collisions: penalty(placed.indexOf(c), c, placed) }))
}

export function renderSvg({ network, positions, polylines, scene = { water: [], mountain: null }, title = true }) {
  const U = CONFIG.unit
  const margin = 6
  const xs = positions.map(p => p[0])
  const ys = positions.map(p => p[1])
  const minX = Math.min(...xs) - margin
  const minY = Math.min(...ys) - margin
  const bodyWidth = (Math.max(...xs) - minX + margin) * U
  const bodyHeight = (Math.max(...ys) - minY + margin) * U
  const legendRows = network.lines.length + 3
  const legendHeight = 54 + legendRows * 30
  const width = Math.max(bodyWidth, 760)
  const height = bodyHeight + legendHeight
  const P = ([x, y]) => [Math.round((x - minX) * U * 10) / 10, Math.round((y - minY) * U * 10) / 10]
  const pixel = positions.map(P)

  // 线路（像素坐标）
  const linePaths = network.lines.map((line, lineIndex) => {
    const points = []
    network.edges.forEach((edge, e) => {
      if (edge.line !== lineIndex) return
      const polyline = polylines[e].map(P)
      points.push(...(points.length ? polyline.slice(1) : polyline))
    })
    return points
  })

  // 线路编号牌：放在线性线路两端的延长线上；环线放在外侧
  const badges = []
  network.lines.forEach((line, lineIndex) => {
    const path = linePaths[lineIndex]
    const text = line.badge
    const bw = Math.max(28, textWidth(text, 14) + 14)
    const place = (anchor, towards) => {
      const dx = anchor[0] - towards[0]
      const dy = anchor[1] - towards[1]
      const len = Math.hypot(dx, dy) || 1
      const cx = anchor[0] + (dx / len) * (bw / 2 + 22)
      const cy = anchor[1] + (dy / len) * 30
      badges.push({ cx, cy, w: bw, h: 26, text, color: lineColor(line) })
    }
    if (!line.isLoop) {
      place(path[0], path[1])
      place(path[path.length - 1], path[path.length - 2])
    } else {
      const cxm = mean(line.stations.map(s => pixel[s][0]))
      const cym = mean(line.stations.map(s => pixel[s][1]))
      const top = line.stations.map(s => pixel[s]).sort((a, b) => a[1] - b[1])[0]
      badges.push({ cx: cxm, cy: cym, w: bw, h: 26, text, color: lineColor(line) })
      void top
    }
  })
  const obstacles = badges.map(b => [b.cx - b.w / 2 - 3, b.cy - b.h / 2 - 3, b.cx + b.w / 2 + 3, b.cy + b.h / 2 + 3])
  const labels = placeLabels(network, pixel, linePaths, obstacles, { width, height: bodyHeight })

  const out = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" font-family="${escapeXml(CONFIG.font)}">`)
  out.push(`<rect width="${Math.round(width)}" height="${Math.round(height)}" fill="#ffffff"/>`)
  out.push(`<clipPath id="body"><rect x="0" y="0" width="${Math.round(width)}" height="${Math.round(bodyHeight)}"/></clipPath>`)
  out.push('<g id="scene" clip-path="url(#body)">')
  if (scene.water.length) {
    const d = scene.water.map(polygon => {
      const smooth = chaikin(polygon.map(P), 2)
      return `M${smooth.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`
    }).join('')
    out.push(`<path d="${d}" fill="#c9e6f5" fill-rule="evenodd" stroke="#b3d9ee" stroke-width="1.2" stroke-linejoin="round"/>`)
  }
  if (scene.mountain) {
    const smooth = chaikin(scene.mountain.polygon.map(P), 2)
    out.push(`<path d="M${smooth.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z" fill="#dcead2" stroke="#b9d3a7" stroke-width="2" stroke-dasharray="7 5" stroke-linejoin="round"/>`)
    const [mx, my] = P(scene.mountain.center)
    const tri = (x, y, s) => `<path d="M${x - s},${y + s * 0.7}L${x},${y - s * 0.9}L${x + s},${y + s * 0.7}Z" fill="#a9c79a" stroke="#8fb07f" stroke-width="1.4" stroke-linejoin="round"/>`
    out.push(tri(mx - 20, my + 14, 14) + tri(mx + 12, my + 18, 17) + tri(mx + 2, my - 4, 12))
    const mountainText = escapeXml(CONFIG.mountainName)
    out.push(`<text x="${mx}" y="${my + 50}" text-anchor="middle" font-size="18" font-weight="700" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round">${mountainText}</text>`)
    out.push(`<text x="${mx}" y="${my + 50}" text-anchor="middle" font-size="18" font-weight="700" fill="#5f8450">${mountainText}</text>`)
  }
  out.push('</g>')
  out.push(`<rect x="1" y="1" width="${Math.round(width) - 2}" height="${Math.round(bodyHeight) - 2}" fill="none" stroke="#cfd4d8" stroke-width="2" rx="6"/>`)

  out.push('<g id="lines" fill="none" stroke-linecap="round" stroke-linejoin="round">')
  network.lines.forEach((line, lineIndex) => {
    out.push(`<path d="${roundedPath(linePaths[lineIndex], 14, line.isLoop)}" stroke="${lineColor(line)}" stroke-width="11"/>`)
  })
  out.push('</g>')

  out.push('<g id="stations">')
  network.stations.forEach((station, i) => {
    const [x, y] = pixel[i]
    if (station.lines.length > 1) out.push(`<circle cx="${x}" cy="${y}" r="11" fill="#fff" stroke="#111" stroke-width="3.4"/>`)
    else out.push(`<circle cx="${x}" cy="${y}" r="6.5" fill="#fff" stroke="#222" stroke-width="2.6"/>`)
  })
  out.push('</g>')

  out.push('<g id="badges" font-size="14" font-weight="700" text-anchor="middle">')
  for (const b of badges) {
    out.push(`<rect x="${(b.cx - b.w / 2).toFixed(1)}" y="${(b.cy - b.h / 2).toFixed(1)}" width="${b.w}" height="${b.h}" rx="6" fill="${b.color}" stroke="#fff" stroke-width="2"/>`)
    out.push(`<text x="${b.cx.toFixed(1)}" y="${(b.cy + 5).toFixed(1)}" fill="${isLight(b.color) ? '#222' : '#fff'}">${escapeXml(b.text)}</text>`)
  }
  out.push('</g>')

  out.push('<g id="labels" font-size="16" fill="#1d1d1d">')
  network.stations.forEach((station, i) => {
    const l = labels[i]
    const weight = station.lines.length > 1 ? ' font-weight="700"' : ''
    const text = escapeXml(station.name)
    out.push(`<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}"${weight} fill="none" stroke="#fff" stroke-width="4.5" stroke-linejoin="round">${text}</text>`)
    out.push(`<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.anchor}"${weight}>${text}</text>`)
  })
  out.push('</g>')

  // 标题与图例
  const ly = bodyHeight + 20
  out.push(`<line x1="24" y1="${ly - 8}" x2="${Math.round(width) - 24}" y2="${ly - 8}" stroke="#d6d6d6" stroke-width="1.5"/>`)
  out.push(`<text x="28" y="${ly + 22}" font-size="26" font-weight="700" fill="#222">${escapeXml(CONFIG.title)}</text>`)
  out.push(`<text x="28" y="${ly + 42}" font-size="12" letter-spacing="1.5" fill="#777">${escapeXml(CONFIG.subtitle)}</text>`)
  let row = ly + 74
  network.lines.forEach((line, lineIndex) => {
    const color = lineColor(line)
    const text = line.badge
    const bw = Math.max(34, textWidth(text, 14) + 16)
    out.push(`<rect x="28" y="${row - 17}" width="${bw}" height="24" rx="6" fill="${color}"/>`)
    out.push(`<text x="${28 + bw / 2}" y="${row}" font-size="14" font-weight="700" text-anchor="middle" fill="${isLight(color) ? '#222' : '#fff'}">${escapeXml(text)}</text>`)
    const label = line.isLoop ? `号线  ${line.displayName}（${line.stations.length} 站，内外环为同一条环线的两个方向）` : `号线  ${line.stations.length} 站：${stationsLabel(network, line)}`
    out.push(`<text x="${28 + bw + 10}" y="${row}" font-size="14" fill="#333">${escapeXml(label)}</text>`)
    row += 30
  })
  row += 4
  out.push(`<circle cx="42" cy="${row - 5}" r="9.5" fill="#fff" stroke="#111" stroke-width="3"/><text x="62" y="${row}" font-size="14" fill="#333">换乘站</text>`)
  out.push(`<circle cx="150" cy="${row - 5}" r="5.5" fill="#fff" stroke="#222" stroke-width="2.4"/><text x="166" y="${row}" font-size="14" fill="#333">车站</text>`)
  if (scene.water.length) out.push(`<rect x="232" y="${row - 16}" width="34" height="18" rx="4" fill="#c9e6f5" stroke="#b3d9ee"/><text x="274" y="${row}" font-size="14" fill="#333">河流</text>`)
  if (scene.mountain) out.push(`<rect x="334" y="${row - 16}" width="34" height="18" rx="9" fill="#dcead2" stroke="#b9d3a7" stroke-dasharray="4 3"/><text x="376" y="${row}" font-size="14" fill="#333">山</text>`)
  out.push(`<text x="${Math.round(width) - 28}" y="${height - 14}" font-size="11" text-anchor="end" fill="#999">示意图，站间距与方位不按实际比例</text>`)
  out.push('</svg>')
  return { svg: out.join('\n'), labels, pixel, width, height: bodyHeight }
}

function stationsLabel(network, line) {
  const s = line.stations
  return `${network.stations[s[0]].name} — ${network.stations[s[s.length - 1]].name}`
}

// ======================================================================= 6. 自检
function polylineLength(points) {
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
  return total
}

function pointAlong(points, fraction) {
  const target = polylineLength(points) * fraction
  let acc = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const length = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
    if (acc + length >= target) {
      const t = length ? (target - acc) / length : 0
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t]
    }
    acc += length
  }
  return points[points.length - 1]
}

export function checkLayout(network, layout, polylines, waterGeo, waterFinal, mountainGeo, mountainFinal) {
  const { edges, stations } = network
  const report = {}
  report.edges = edges.length
  report.nonOctilinearChords = edges.filter(e => {
    const dx = layout.positions[e.b][0] - layout.positions[e.a][0]
    const dy = layout.positions[e.b][1] - layout.positions[e.a][1]
    return !(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))
  }).length
  let crossings = 0
  for (let e = 0; e < edges.length; e += 1) {
    for (let f = e + 1; f < edges.length; f += 1) {
      const a = edges[e]
      const b = edges[f]
      if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue
      for (let i = 0; i < polylines[e].length - 1; i += 1) for (let j = 0; j < polylines[f].length - 1; j += 1) {
        if (segmentsCross(polylines[e][i], polylines[e][i + 1], polylines[f][j], polylines[f][j + 1])) crossings += 1
      }
    }
  }
  report.lineCrossings = crossings
  let minDistance = Infinity
  for (let i = 0; i < stations.length; i += 1) for (let j = i + 1; j < stations.length; j += 1) {
    minDistance = Math.min(minDistance, Math.hypot(layout.positions[i][0] - layout.positions[j][0], layout.positions[i][1] - layout.positions[j][1]))
  }
  report.minStationDistanceUnits = Number(minDistance.toFixed(2))
  const inWater = (p, polygons) => pointInWater(p, polygons)
  if (waterGeo.length) {
    let mismatches = 0
    let crossingGeo = 0
    const details = []
    edges.forEach((e, i) => {
      const geoA = stations[e.a].geo
      const geoB = stations[e.b].geo
      let wet = false
      for (let s = 1; s < 80; s += 1) {
        const t = s / 80
        if (inWater([geoA[0] + (geoB[0] - geoA[0]) * t, geoA[1] + (geoB[1] - geoA[1]) * t], waterGeo)) { wet = true; break }
      }
      let wetFinal = false
      for (let s = 1; s < 120; s += 1) if (inWater(pointAlong(polylines[i], s / 120), waterFinal)) { wetFinal = true; break }
      if (wet) crossingGeo += 1
      if (wet !== wetFinal) { mismatches += 1; details.push(`${stations[e.a].name}—${stations[e.b].name}(${network.lines[e.line].badge}号线): 实际${wet ? '过河' : '不过河'}，示意图${wetFinal ? '过河' : '不过河'}`) }
    })
    report.riverCrossingsGeo = crossingGeo
    report.riverMismatches = mismatches
    report.riverMismatchDetails = details
  }
  if (mountainGeo) {
    report.stationsInsideMountainGeo = stations.filter(s => pointInPolygon(s.geo, mountainGeo)).length
    report.stationsInsideMountainFinal = layout.positions.filter(p => pointInPolygon(p, mountainFinal)).length
  }
  return report
}

// ======================================================================= 主程序
export async function buildMap(snapshotDir, { seed = 1, log = () => {} } = {}) {
  log('读取线路与站点…')
  const routes = await readJson(path.join(snapshotDir, 'GeoJSON', 'Route_Centerline.json'))
  const pois = await readJson(path.join(snapshotDir, 'GeoJSON', 'POI_Location.json'))
  const network = buildNetwork(routes, pois)
  for (const line of network.lines) {
    log(`  ${line.isLoop ? '环线' : '线路'} ${line.badge}（${line.displayName}）：${line.stations.length} 站${line.consistent ? '' : '（站数与导出的 Stop 数对不上，请检查）'}`)
  }
  log(`  共 ${network.stations.length} 个站，${network.stations.filter(s => s.lines.length > 1).length} 个换乘站`)

  log('排布站点…')
  const layout = layoutNetwork(network, { seed, log })
  const polylines = chooseEdgeRoutes(network, layout.positions)

  log('处理河流和山…')
  const waterGeo = await loadWaterPolygons(snapshotDir, network)
  const mountain = await detectMountain(snapshotDir, network, waterGeo)
  log(`  河流/水体 ${waterGeo.length} 块；${mountain ? `山：半径约 ${Math.round(mountain.radius)} 米（被城区包围程度 ${(mountain.enclosure * 100).toFixed(0)}%）` : '没有找到被城区包围的圆形空地，不画山'}`)

  // 用站点和"区间上的中间点"做控制点，建立 地理 → 示意图 的平滑形变
  const [cx, cy] = layout.center
  const toBase = ([x, y]) => [(x - cx) / layout.metersPerUnit, -(y - cy) / layout.metersPerUnit]
  const sources = layout.baseRaw.map(p => [...p])
  const targets = layout.positions.map(p => [...p])
  network.edges.forEach((edge, e) => {
    for (const t of [0.25, 0.5, 0.75]) {
      sources.push([layout.baseRaw[edge.a][0] + (layout.baseRaw[edge.b][0] - layout.baseRaw[edge.a][0]) * t, layout.baseRaw[edge.a][1] + (layout.baseRaw[edge.b][1] - layout.baseRaw[edge.a][1]) * t])
      targets.push(pointAlong(polylines[e], t))
    }
  })
  // 形变是在"相对坐标"里定义的；layout.positions 已经减去了最小值，所以要把源坐标也平移到同一参照
  const warp = makeWarp(sources, targets, 2.0)
  const waterFinal = waterGeo.map(poly => poly.map(p => warp(toBase(p))))
  let mountainScene = null
  let mountainGeoPolygon = null
  let mountainFinalPolygon = null
  if (mountain) {
    const ring = Array.from({ length: 36 }, (_, k) => {
      const angle = (k / 36) * Math.PI * 2
      return [mountain.center[0] + Math.cos(angle) * mountain.radius * 0.92, mountain.center[1] + Math.sin(angle) * mountain.radius * 0.92]
    })
    mountainGeoPolygon = ring
    mountainFinalPolygon = ring.map(p => warp(toBase(p)))
    mountainScene = { polygon: mountainFinalPolygon, center: warp(toBase(mountain.center)) }
  }
  const report = checkLayout(network, layout, polylines, waterGeo, waterFinal, mountainGeoPolygon, mountainFinalPolygon)
  const rendered = renderSvg({ network, positions: layout.positions, polylines, scene: { water: waterFinal, mountain: mountainScene } })
  return { network, layout, polylines, report, ...rendered }
}

async function main() {
  const args = process.argv.slice(2)
  const option = (name, fallback) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v }
  const seed = Number(option('--seed', 1))
  const font = option('--font', null)
  const mountainName = option('--mountain-name', null)
  if (font) CONFIG.font = font
  if (mountainName) CONFIG.mountainName = mountainName
  const [snapshotDir, outDirArg] = args
  if (!snapshotDir) throw new Error('用法：node scripts/generate-metro-map.mjs <快照目录> [输出目录] [--seed 数字] [--font 字体名] [--mountain-name 山的名字]')
  const outDir = path.resolve(outDirArg ?? 'metro-map-output')
  await mkdir(outDir, { recursive: true })

  const result = await buildMap(snapshotDir, { seed, log: console.log })
  await writeFile(path.join(outDir, 'metro-map.svg'), result.svg)
  await writeFile(path.join(outDir, 'metro-map-layout.json'), JSON.stringify({
    lines: result.network.lines.map(l => ({ route: l.badge, name: l.displayName, color: lineColor(l), loop: l.isLoop, stations: l.stations.map(i => result.network.stations[i].name) })),
    stations: result.network.stations.map((s, i) => ({ name: s.name, lines: s.lines.map(k => result.network.lines[k].badge), grid: result.layout.positions[i] })),
  }, null, 2))
  console.log('自检：', JSON.stringify({ ...result.report, riverMismatchDetails: undefined }))
  for (const d of result.report.riverMismatchDetails ?? []) console.log('  过河关系不一致：', d)
  console.log(`已生成 ${path.join(outDir, 'metro-map.svg')}（布局代价 ${result.layout.cost.toFixed(1)}）`)
}

import { fileURLToPath } from 'node:url'
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(error.message); process.exit(1) })
}
