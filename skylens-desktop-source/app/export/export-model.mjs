export const GROUPS = ['water', 'parks', 'buildings', 'roads', 'tracks', 'paths', 'waterways', 'districts', 'pois', 'stops', 'labels']
export const routeKey = p => `${p.Transport ?? ''}|${p.Route ?? ''}|${p.Name ?? ''}`
export const isSubway = feature => feature.properties?.Transport === 'Subway' && feature.geometry?.type === 'LineString'

export function validateSize(value, max = 8192) {
  const size = Number(value)
  if (!Number.isInteger(size) || size < 256 || size > max) throw new Error(`尺寸须为 256–${max} 的整数像素`)
  return size
}

export function layerGroup(layer) {
  const id = layer.id
  if (/^(selected-|hover-|directions-|routing-|navigation-|route-highlight)/.test(id) || /-(hover|pressed)$/.test(id)) return null
  if (id.startsWith('transport-')) return id.endsWith('-route') ? 'routes' : 'stops'
  if (layer.type === 'symbol' && layer.layout?.['text-field']) return 'labels'
  if (/water-raster/.test(id)) return 'water'
  if (/waterway/.test(id)) return 'waterways'
  if (/district|tile-/.test(id) || layer.source === 'area') return 'districts'
  if (/park|commercial-area/.test(id) || ['parks', 'commercial'].includes(layer.source)) return 'parks'
  if (/road/.test(id) || layer.source === 'network-boundary') return 'roads'
  if (/track|rail|^train-/.test(id)) return 'tracks'
  if (/pathway|path-/.test(id)) return 'paths'
  if (/building/.test(id) || layer.source === 'buildings') return 'buildings'
  if (layer.source === 'poi' || /place-/.test(id)) return 'pois'
  return null
}

export function exportStyle(original, { groups, routeKeys }, dataRoot) {
  const enabled = new Set(groups), selected = new Set(routeKeys)
  const style = structuredClone(original)
  style.layers = style.layers.filter(layer => {
    if (layer.type === 'background') return true
    const group = layerGroup(layer)
    if (group === 'routes') {
      if (!selected.size) return false
      const test = ['in', ['concat', ['coalesce', ['get', 'Transport'], ''], '|', ['to-string', ['get', 'Route']], '|', ['coalesce', ['get', 'Name'], '']], ['literal', [...selected]]]
      layer.filter = layer.filter ? ['all', layer.filter, test] : test
    } else {
      // A place symbol may combine an icon with text. Honour those two switches independently.
      const place = /^(place-building|place-subway)-label$/.test(layer.id)
      if (place) {
        const owner = layer.id.startsWith('place-subway') ? 'stops' : 'pois'
        if (!enabled.has('labels') && !enabled.has(owner)) return false
        layer.layout = { ...layer.layout }
        if (!enabled.has('labels')) delete layer.layout['text-field']
        if (!enabled.has(owner)) delete layer.layout['icon-image']
      } else if (!group || !enabled.has(group)) return false
    }
    layer.layout = { ...layer.layout, visibility: 'visible' }
    return true
  })
  const used = new Set(style.layers.map(layer => layer.source).filter(Boolean))
  for (const id of Object.keys(style.sources)) if (!used.has(id)) delete style.sources[id]
  // The live water source contains a decoded image; provide its offline URL to the new map.
  if (style.sources.water?.type === 'image') style.sources.water.url = new URL('water-mask.png', dataRoot).href
  // Do not duplicate transition animations or a selected feature in the output.
  style.transition = { duration: 0, delay: 0 }
  return style
}

export function squareSvg(svg, size, { labels = true, legend = true } = {}) {
  const match = svg.match(/viewBox="([^"]+)"/)
  if (!match) throw new Error('地铁 SVG 缺少画布范围')
  if (!labels) svg = svg.replace(/<g id="labels"[\s\S]*?<\/g>/, '')
  if (!legend) {
    const at = svg.lastIndexOf('<line x1="24"')
    const bodyHeight = svg.match(/<clipPath id="body"><rect[^>]*height="([^"]+)"/)
    if (bodyHeight) {
      const bounds = match[1].split(/\s+/)
      bounds[3] = bodyHeight[1]; match[1] = bounds.join(' ')
    }
    if (at >= 0) svg = svg.slice(0, at) + '</svg>'
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="white"/><svg width="${size}" height="${size}" viewBox="${match[1]}" preserveAspectRatio="xMidYMid meet">${svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))}</svg></svg>`
}
