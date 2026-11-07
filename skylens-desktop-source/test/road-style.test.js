'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')
const helperSource = fs.readFileSync(path.join(root, 'scripts', 'road-style-helpers.js'), 'utf8')
const { skylensRoadTiers } = vm.runInNewContext(`${helperSource}\n;({ skylensRoadTiers })`, {})

// 度数坐标：1e-4° 约 11 米
function road(coordinates, properties = {}) {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: { Object: 'Road', Form: 'Elevated', Category: 'Highway', ...properties },
  }
}
const fc = (...features) => ({ type: 'FeatureCollection', features })
const lv = feature => feature.properties._lv

test('高架交叉：高程高的在上层，地面路保持 0 层', () => {
  const a = road([[-0.001, 0, 20], [0.001, 0, 20]])
  const b = road([[0, -0.001, 10], [0, 0.001, 10]])
  const ground = road([[0, -0.001, 0], [0, 0.001, 0]], { Form: 'Normal' })
  skylensRoadTiers(fc(a, b, ground))
  assert.equal(lv(b), 1)
  assert.equal(lv(a), 2)
  assert.equal(lv(ground), 0)
})

test('高度不对称时按高程而不是数据顺序决定上下', () => {
  const low = road([[-0.001, 0, 5], [0.001, 0, 5]])
  const high = road([[0, -0.001, 25], [0, 0.001, 25]])
  skylensRoadTiers(fc(high, low)) // 故意把高的放在前面
  assert.equal(lv(low), 1)
  assert.equal(lv(high), 2)
})

test('路口相接（线段端点相交）和高差小于 3 米的交叉不产生层级', () => {
  const a = road([[-0.001, 0, 10], [0, 0, 10]]) // 终点落在 b 的中间：是路口，不是立交
  const b = road([[0, -0.001, 10], [0, 0.001, 10]])
  const c = road([[-0.001, 0.0005, 10], [0.001, 0.0005, 10]])
  const d = road([[0.0004, -0.001, 11.5], [0.0004, 0.001, 11.5]]) // 与 c 交叉但只差 1.5 米
  skylensRoadTiers(fc(a, b, c, d))
  assert.deepEqual([a, b, c, d].map(lv), [1, 1, 1, 1])
})

test('多层立交：层数有上限，而且每个约束的上下关系都得到满足', () => {
  const r1 = road([[0, 0, 10], [0.001, 0, 10]])
  const r2 = road([[0.0003, -0.0005, 20], [0.0003, 0.0005, 20]])
  const r3 = road([[0.0002, 0.0003, 30], [0.0012, 0.0003, 30]])
  const r4 = road([[0.0008, -0.0005, 40], [0.0008, 0.0009, 40]])
  const r5 = road([[0.0002, 0.0006, 50], [0.0012, 0.0006, 50]])
  skylensRoadTiers(fc(r1, r2, r3, r4, r5))
  const levels = [r1, r2, r3, r4, r5].map(lv)
  assert.ok(Math.max(...levels) <= 3)
  assert.ok(lv(r1) < lv(r2) && lv(r2) < lv(r3))
  assert.deepEqual(levels, [1, 2, 3, 3, 3])
})

test('道路等级：复合的 Category（带自行车道）取第一个词', () => {
  const features = ['Highway', 'Large', 'Medium', 'Small', 'Medium, Bicycle', 'Large, Bicycle', 'Small, Bicycle', 'Whatever', undefined]
    .map(Category => road([[0, 0, 0], [0.001, 0, 0]], { Form: 'Normal', Category }))
  skylensRoadTiers(fc(...features))
  assert.deepEqual(features.map(f => f.properties._cls), ['Highway', 'Large', 'Medium', 'Small', 'Medium', 'Large', 'Small', 'Small', 'Small'])
  assert.deepEqual(features.map(f => f.properties._rank), [3, 2, 1, 0, 1, 2, 0, 0, 0])
})

test('Form 决定基础层级；非道路要素不被改动；"Pathway, Road" 算道路', () => {
  const tunnel = road([[0, 0, -5], [0.001, 0, -5]], { Form: 'Tunnel' })
  const normal = road([[0, 0.001, 0], [0.001, 0.001, 0]], { Form: 'Normal' })
  const pathRoad = road([[0, 0.002, 0], [0.001, 0.002, 0]], { Form: 'Normal', Object: 'Pathway, Road' })
  const track = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0, 0], [1, 1, 0]] }, properties: { Object: 'Track', Category: 'Train' } }
  skylensRoadTiers(fc(tunnel, normal, pathRoad, track))
  assert.deepEqual([tunnel, normal, pathRoad].map(lv), [-1, 0, 0])
  assert.equal(track.properties._lv, undefined)
  assert.equal(track.properties._rank, undefined)
})

test('没有高程、坏数据、空数据都不会抛错', () => {
  const flat = [road([[-0.001, 0], [0.001, 0]]), road([[0, -0.001], [0, 0.001]])]
  assert.doesNotThrow(() => skylensRoadTiers(fc(...flat)))
  assert.deepEqual(flat.map(lv), [1, 1])
  for (const bad of [null, undefined, {}, { features: null }, fc(), fc({ type: 'Feature' }, { properties: null }, road([[0, 0, 0]]))]) {
    assert.doesNotThrow(() => skylensRoadTiers(bad))
  }
})

test('补丁脚本：已打过补丁的网页包重复运行结果完全一致，并包含所有接入点', async () => {
  const { patchRoadStyle } = await import('../scripts/patch-road-style.mjs')
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'road-patch-'))
  fs.cpSync(path.join(root, 'app'), copy, { recursive: true })
  const bundle = path.join(copy, 'assets', fs.readdirSync(path.join(copy, 'assets')).find(name => /^index-.*\.js$/.test(name)))
  const first = fs.readFileSync(bundle, 'utf8')
  await patchRoadStyle(copy)
  await patchRoadStyle(copy)
  const again = fs.readFileSync(bundle, 'utf8')
  assert.equal(again, first)
  for (const needle of [
    'skylensRoadTiers(a)', 'skylensSmoothWater(f)', '"road-elevated3-line"', '"road-elevated-shadow"', '"road-tunnel-line"',
    'skylens-road-hd:begin', 'skylens-road-style:begin', 'skylens-road-helpers:begin',
    'skylens-road-arrows:begin', '"road-direction-arrows-tunnel"', '"road-direction-arrows-3"', 'lv:properties._lv??0',
  ]) assert.ok(again.includes(needle), `缺少 ${needle}`)
  // 打过补丁的包仍然是合法的 ES 模块
  const mjs = path.join(copy, 'check.mjs')
  fs.copyFileSync(bundle, mjs)
  assert.doesNotThrow(() => require('node:child_process').execFileSync(process.execPath, ['--check', mjs]))
})

test('补丁脚本：网页包不是预期版本时给出明确错误', async () => {
  const { patchRoadStyle } = await import('../scripts/patch-road-style.mjs')
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'road-bad-'))
  fs.mkdirSync(path.join(copy, 'assets'))
  fs.writeFileSync(path.join(copy, 'assets', 'index-x.js'), 'console.log("not the expected bundle")')
  await assert.rejects(patchRoadStyle(copy), /找不到|应当/)
})
