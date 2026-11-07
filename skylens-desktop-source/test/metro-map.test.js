'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')

let metro
test.before(async () => {
  metro = await import('../scripts/generate-metro-map.mjs')
  metro.CONFIG.restarts = 2 // 测试里把退火调小，几秒内跑完
  metro.CONFIG.iterations = 40000
})

// ---- 合成数据：1 度 = 约 111 公里，0.01 度约 1.1 公里 ----
const LAT = 0.02
const stop = (name, lon, lat) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { Category: 'StopSubway', Name: name } })
const route = (name, number, coordinates, stopCount, color = '#ff0000') => ({
  type: 'Feature', geometry: { type: 'LineString', coordinates },
  properties: { Transport: 'Subway', Route: number, Name: name, Stop: stopCount, Color: color },
})
const collection = features => ({ type: 'FeatureCollection', features })

// 一条线性线路（站点沿东西向），导出格式：去程 + 回程，非终点站有两个站台
function linearLine(number, names, lon0, lat, spacing = 0.01) {
  const pts = names.map((_, i) => [lon0 + i * spacing, lat])
  const back = pts.slice().reverse().map(([x, y]) => [x, y + 0.0001])
  const stops = []
  names.forEach((name, i) => {
    stops.push(stop(name, pts[i][0], pts[i][1]))
    if (i > 0 && i < names.length - 1) stops.push(stop(name, pts[i][0], pts[i][1] + 0.0001))
  })
  return { route: route(`线路 ${number}`, number, [...pts, ...back], 2 * names.length - 2), stops }
}

function crossNetwork() {
  const east = linearLine('1', ['A1', 'A2', 'X', 'A4', 'A5'], 0.0, LAT)
  // 第二条线南北向，在 X（0.02, LAT）与第一条线相交
  const south = [['B1', LAT - 0.02], ['B2', LAT - 0.01], ['X', LAT], ['B4', LAT + 0.01], ['B5', LAT + 0.02]]
  const pts = south.map(([, lat]) => [0.02, lat])
  const back = pts.slice().reverse().map(([x, y]) => [x + 0.0001, y])
  const stops = south.map(([name, lat], i) => stop(name, 0.02, lat))
  south.forEach(([name, lat], i) => { if (i > 0 && i < south.length - 1 && name !== 'X') stops.push(stop(name, 0.0201, lat)) })
  const second = { route: route('线路 2', '2', [...pts, ...back], 2 * south.length - 2, '#0000ff'), stops }
  return {
    routes: collection([east.route, second.route]),
    pois: collection([...east.stops, ...second.stops]),
  }
}

test('线性线路：去程+回程的重复站台按站名合并成一条线', () => {
  const { route: r, stops } = linearLine('1', ['A', 'B', 'C', 'D'], 0, LAT)
  const network = metro.buildNetwork(collection([r]), collection(stops))
  assert.equal(network.lines.length, 1)
  assert.equal(network.lines[0].isLoop, false)
  assert.deepEqual(network.lines[0].stations.map(i => network.stations[i].name), ['A', 'B', 'C', 'D'])
  assert.equal(network.stations.length, 4)
  assert.equal(network.edges.length, 3)
  assert.equal(network.lines[0].consistent, true)
})

test('环线：内环/外环合并为一条环线，并带有闭合的边', () => {
  const corners = [['N1', 0, LAT], ['N2', 0.01, LAT], ['N3', 0.01, LAT + 0.01], ['N4', 0, LAT + 0.01]]
  const inner = corners.map(([, x, y]) => [x, y])
  const outer = inner.slice().reverse()
  const stops = corners.map(([name, x, y]) => stop(name, x, y))
  const network = metro.buildNetwork(
    collection([route('环线内环', '4', [...inner, inner[0]], 4, '#aaaaaa'), route('环线外环', '5', [...outer, outer[0]], 4, '#bbbbbb')]),
    collection(stops))
  assert.equal(network.lines.length, 1)
  assert.equal(network.lines[0].isLoop, true)
  assert.equal(network.lines[0].badge, '4/5')
  assert.equal(network.lines[0].displayName, '环线')
  assert.equal(network.edges.length, 4) // 4 站的环有 4 条边（含闭合边）
})

test('换乘站：同名站点属于多条线路', () => {
  const { routes, pois } = crossNetwork()
  const network = metro.buildNetwork(routes, pois)
  assert.equal(network.lines.length, 2)
  const x = network.stations.find(s => s.name === 'X')
  assert.equal(x.lines.length, 2)
  assert.equal(network.stations.filter(s => s.lines.length > 1).length, 1)
  assert.equal(network.stations.length, 9)
})

test('没有地铁数据时给出明确的错误', () => {
  assert.throws(() => metro.buildNetwork(collection([]), collection([])), /没有地铁站点/)
  assert.throws(() => metro.buildNetwork(collection([]), collection([stop('A', 0, LAT)])), /没有地铁线路/)
})

test('连线只会出现 0° / 45° / 90° 的线段', () => {
  for (const [a, b] of [[[0, 0], [5, 0]], [[0, 0], [0, 4]], [[0, 0], [3, 3]], [[0, 0], [7, 2]], [[0, 0], [-2, 6]], [[3, 3], [-4, -1]]]) {
    for (const diagonalFirst of [true, false]) {
      const polyline = metro.routeEdge(a, b, diagonalFirst)
      assert.deepEqual(polyline[0], a)
      assert.deepEqual(polyline[polyline.length - 1], b)
      for (let i = 0; i < polyline.length - 1; i += 1) {
        const dx = polyline[i + 1][0] - polyline[i][0]
        const dy = polyline[i + 1][1] - polyline[i][1]
        assert.ok(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy), `非八方向线段 ${JSON.stringify(polyline)}`)
      }
    }
  }
})

test('示意化排布：八方向、不交叉、站点之间有最小间距', () => {
  const { routes, pois } = crossNetwork()
  const network = metro.buildNetwork(routes, pois)
  const layout = metro.layoutNetwork(network, { seed: 3 })
  const polylines = metro.chooseEdgeRoutes(network, layout.positions)
  const report = metro.checkLayout(network, layout, polylines, [], [], null, null)
  assert.equal(report.nonOctilinearChords, 0)
  assert.equal(report.lineCrossings, 0)
  assert.ok(report.minStationDistanceUnits >= 3, `最小站距 ${report.minStationDistanceUnits}`)
  // 同一条线上相邻的站在示意图里的先后顺序不变：线路 1 仍然是从西到东
  const west = network.stations.findIndex(s => s.name === 'A1')
  const east = network.stations.findIndex(s => s.name === 'A5')
  assert.ok(layout.positions[west][0] < layout.positions[east][0])
})

test('行进方块法：提取外轮廓和岛屿（内轮廓），并按奇偶规则判断是否在水里', () => {
  const w = 24
  const h = 24
  const grid = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const d = Math.hypot(x - 11.5, y - 11.5)
    grid[y * w + x] = d <= 9 && d >= 3.5 ? 1 : 0 // 一个环形水面，中间是岛
  }
  const loops = metro.contours(grid, w, h, 0.5)
  assert.equal(loops.length, 2)
  assert.equal(metro.pointInWater([11.5, 11.5], loops), false) // 岛上
  assert.equal(metro.pointInWater([11.5, 4.5], loops), true) // 水里
  assert.equal(metro.pointInWater([1, 1], loops), false) // 水外
})

test('薄板样条形变：经过所有控制点，并且对恒等映射保持不变', () => {
  const sources = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 8]]
  const targets = sources.map(([x, y]) => [x * 1.5 + 2, y * 0.8 - 1 + (x === 5 ? 1.5 : 0)])
  const warp = metro.makeWarp(sources, targets, 1e-6)
  sources.forEach((p, i) => {
    const q = warp(p)
    assert.ok(Math.hypot(q[0] - targets[i][0], q[1] - targets[i][1]) < 1e-3)
  })
  const identity = metro.makeWarp(sources, sources, 1e-6)
  const q = identity([4.2, 6.1])
  assert.ok(Math.hypot(q[0] - 4.2, q[1] - 6.1) < 1e-3)
})

test('生成 SVG：包含站名和图例，没有 NaN，水体用奇偶规则', () => {
  const { routes, pois } = crossNetwork()
  const network = metro.buildNetwork(routes, pois)
  const layout = metro.layoutNetwork(network, { seed: 3 })
  const polylines = metro.chooseEdgeRoutes(network, layout.positions)
  const lake = [[1, 1], [8, 1], [8, 8], [1, 8]]
  const { svg } = metro.renderSvg({ network, positions: layout.positions, polylines, scene: { water: [lake], mountain: null } })
  assert.ok(svg.startsWith('<svg'))
  for (const name of ['A1', 'A5', 'B3'.replace('3', '4'), 'X']) assert.ok(svg.includes(`>${name}</text>`), `缺少站名 ${name}`)
  assert.ok(svg.includes('fill-rule="evenodd"'))
  assert.ok(!svg.includes('NaN') && !svg.includes('undefined'))
})

test('真实快照（可选）：设置 SKYLENS_SNAPSHOT 指向快照目录时运行完整流程', { skip: !process.env.SKYLENS_SNAPSHOT && '未设置 SKYLENS_SNAPSHOT' }, async () => {
  metro.CONFIG.restarts = 1
  metro.CONFIG.iterations = 60000
  const result = await metro.buildMap(process.env.SKYLENS_SNAPSHOT, { seed: 1 })
  assert.equal(result.report.nonOctilinearChords, 0)
  assert.equal(result.report.lineCrossings, 0)
  assert.ok(result.network.lines.every(line => line.consistent), '有线路的站数和导出的 Stop 数对不上')
})
