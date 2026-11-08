import { CONFIG, buildNetwork, layoutNetwork, chooseEdgeRoutes, renderSvg, checkLayout } from './metro-core.mjs'

self.onmessage = ({ data }) => {
  try {
    const { routes, pois, seed = 1, quality = 'standard' } = data
    CONFIG.restarts = quality === 'detailed' ? 2 : 1
    CONFIG.iterations = quality === 'detailed' ? 100000 : 25000
    CONFIG.extraRestarts = quality === 'detailed' ? 3 : 1
    const log = message => self.postMessage({ type: 'progress', message })
    log('正在识别地铁线路与换乘站…')
    const network = buildNetwork(routes, pois)
    if (network.stations.length < 2 || network.lines.some(line => line.stations.length < 2)) throw new Error('所选线路至少需要两个可识别的站点，请检查站点与线路数据')
    log(`正在排布 ${network.lines.length} 条线路、${network.stations.length} 个站点…`)
    const layout = layoutNetwork(network, { seed, log })
    const polylines = chooseEdgeRoutes(network, layout.positions)
    const { svg } = renderSvg({ network, positions: layout.positions, polylines })
    const report = checkLayout(network, layout, polylines, [], [], null, null)
    const warnings = network.lines.filter(line => !line.consistent).map(line => `${line.displayName}：识别站数与快照不一致`)
    if (report.lineCrossings) warnings.push(`布局中有 ${report.lineCrossings} 处线路交叉，请查看预览`)
    self.postMessage({ type: 'result', svg, warnings, report, stations: network.stations.length, lines: network.lines.length })
  } catch (error) { self.postMessage({ type: 'error', message: error.message }) }
}
