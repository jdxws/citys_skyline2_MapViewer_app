'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ensureSubwayEntrances, FORMAT_VERSION } = require('../src/core/subway-entrances')
const { importPath } = require('../src/core/importer')
const { Library } = require('../src/core/library')

const polygon = (cx, cy, d = 0.00005) => ({ type: 'Polygon', coordinates: [[[cx - d, cy - d], [cx + d, cy - d], [cx + d, cy + d], [cx - d, cy + d], [cx - d, cy - d]]] })
const collection = features => ({ type: 'FeatureCollection', features })
const pois = collection([
  { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { Object: 'POI', Category: 'StopSubway', Name: '测试站' } },
])
const buildings = collection([
  { type: 'Feature', geometry: polygon(0.0003, 0), properties: { Object: 'Building', Asset: 'SubwayStationEntrance01', Name: '' } },
  { type: 'Feature', geometry: polygon(0.01, 0.01), properties: { Object: 'Building', Asset: 'House', Name: '无关建筑' } },
])

function snapshot({ withInputs = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subway-'))
  fs.mkdirSync(path.join(dir, 'GeoJSON'))
  if (withInputs) {
    fs.writeFileSync(path.join(dir, 'GeoJSON', 'Building_Boundary.json'), JSON.stringify(buildings))
    fs.writeFileSync(path.join(dir, 'GeoJSON', 'POI_Location.json'), JSON.stringify(pois))
  }
  return dir
}
const table = dir => JSON.parse(fs.readFileSync(path.join(dir, 'GeoJSON', 'Subway_Station_Entrances.json'), 'utf8'))

test('ensureSubwayEntrances：生成、幂等、升级旧格式', async () => {
  const dir = snapshot()
  assert.equal(await ensureSubwayEntrances(dir), 'generated')
  const first = table(dir)
  assert.equal(first.formatVersion, FORMAT_VERSION)
  assert.equal(first.stations.length, 1)
  assert.equal(first.stations[0].entranceCount, 1)
  assert.equal(first.stations[0].entrances[0].entranceType, 'subway-station-entrance')

  assert.equal(await ensureSubwayEntrances(dir), 'current') // 已是最新：不重复生成
  fs.writeFileSync(path.join(dir, 'GeoJSON', 'Subway_Station_Entrances.json'), JSON.stringify({ formatVersion: 1, stations: [] }))
  assert.equal(await ensureSubwayEntrances(dir), 'generated') // 旧格式：升级
  assert.equal(table(dir).formatVersion, FORMAT_VERSION)
  fs.writeFileSync(path.join(dir, 'GeoJSON', 'Subway_Station_Entrances.json'), '{ not json')
  assert.equal(await ensureSubwayEntrances(dir), 'generated') // 损坏：重新生成
})

test('ensureSubwayEntrances：缺少输入时返回 failed，不留下半成品', async () => {
  const dir = snapshot({ withInputs: false })
  assert.equal(await ensureSubwayEntrances(dir), 'failed')
  assert.deepEqual(fs.readdirSync(path.join(dir, 'GeoJSON')), [])
})

test('导入已处理好的快照时会补生成出入口表', async () => {
  const src = snapshot()
  for (const file of ['Network_Centerline', 'Area_Boundary', 'Route_Centerline', 'Zoning_Boundary', 'Network_Boundary']) {
    fs.writeFileSync(path.join(src, 'GeoJSON', `${file}.json`), JSON.stringify(collection([])))
  }
  fs.writeFileSync(path.join(src, 'manifest.json'), JSON.stringify({ datasetId: 'abcdef0123456789', files: {} }))
  fs.writeFileSync(path.join(src, 'water-mask.png'), 'png')
  const lib = new Library(fs.mkdtempSync(path.join(os.tmpdir(), 'subway-lib-')))
  await lib.init()
  const [entry] = await importPath(src, lib)
  const imported = path.join(lib.dataDir(entry.id), 'GeoJSON', 'Subway_Station_Entrances.json')
  assert.ok(fs.existsSync(imported), '导入后应当有出入口表')
  assert.equal(JSON.parse(fs.readFileSync(imported, 'utf8')).formatVersion, FORMAT_VERSION)
  assert.ok(!fs.existsSync(path.join(src, 'GeoJSON', 'Subway_Station_Entrances.json')), '不应修改原文件夹')
})
