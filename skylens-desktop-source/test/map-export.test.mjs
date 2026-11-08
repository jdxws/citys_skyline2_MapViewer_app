import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { exportStyle, validateSize, routeKey, squareSvg } from '../web-export/export-model.mjs'
import { browserMetroSource } from '../scripts/install-map-export.mjs'

test('地图导出：筛选图层与具体线路，不改变浏览中的样式', () => {
  const style = { version: 8, sources: { network: { type: 'geojson', data: {} }, route: { type: 'geojson', data: {} }, water: { type: 'image', coordinates: [] } }, layers: [
    { id: 'background', type: 'background' }, { id: 'road-line', source: 'network', type: 'line', layout: { visibility: 'none' } },
    { id: 'water-raster', source: 'water', type: 'raster' }, { id: 'selected-road', source: 'network', type: 'line' },
    { id: 'transport-subway-route', type: 'line', source: 'route', filter: ['==', ['get', '_transportMode'], 'subway'] },
    { id: 'transport-subway-hover', type: 'symbol', source: 'poi' },
  ] }
  const original = structuredClone(style)
  const output = exportStyle(style, { groups: ['water'], routeKeys: [routeKey({ Transport: 'Subway', Route: 1, Name: '一号线' })] }, 'http://localhost/snapshots/123/')
  assert.deepEqual(style, original)
  assert.deepEqual(output.layers.map(l => l.id), ['background', 'water-raster', 'transport-subway-route'])
  assert.equal(output.sources.network, undefined)
  assert.equal(output.sources.water.url, 'http://localhost/snapshots/123/water-mask.png')
  assert.equal(output.layers.at(-1).filter[0], 'all')
  assert.equal(output.layers.at(-1).layout.visibility, 'visible')
})

test('地图导出：设施图标与文字可独立关闭', () => {
  const style = { sources: { 'building-places': {} }, layers: [{ id: 'place-building-label', type: 'symbol', source: 'building-places', layout: { 'text-field': ['get', 'label'], 'icon-image': ['get', 'icon'] } }] }
  const onlyText = exportStyle(style, { groups: ['labels'], routeKeys: [] }, 'http://localhost/')
  const onlyIcons = exportStyle(style, { groups: ['pois'], routeKeys: [] }, 'http://localhost/')
  assert.equal(onlyText.layers[0].layout['icon-image'], undefined)
  assert.equal(onlyIcons.layers[0].layout['text-field'], undefined)
})

test('导出尺寸拒绝溢出、负数、小数，SVG 使用方形画布并保留等比显示', () => {
  for (const value of [NaN, Infinity, 0, -1, 255, 8193, 1024.5]) assert.throws(() => validateSize(value))
  assert.equal(validateSize('4096'), 4096)
  const svg = squareSvg('<svg viewBox="0 0 600 900"><g id="labels"><text>站名</text></g><path d="M0,0L1,1"/></svg>', 2048, { labels: false })
  assert.match(svg, /width="2048" height="2048"/)
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/)
  assert.doesNotMatch(svg, /站名/)
})

test('地铁浏览器内核来自现有生成器，且没有文件系统依赖', async () => {
  const source = browserMetroSource(await readFile(new URL('../scripts/generate-metro-map.mjs', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /node:|readFile\(|readJson\(|require\(|process\./)
  const core = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  assert.equal(typeof core.buildNetwork, 'function')
  assert.equal(typeof core.renderSvg, 'function')
  assert.equal(core.pointInWater([1, 1], [[[0, 0], [2, 0], [2, 2], [0, 2]]]), true)
})
