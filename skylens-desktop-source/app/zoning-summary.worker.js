'use strict'

function ringAreaSquareMeters(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let twiceArea = 0
  let latitudeTotal = 0
  let points = 0
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]
    const next = ring[(index + 1) % ring.length]
    if (!Array.isArray(current) || !Array.isArray(next) || current.length < 2 || next.length < 2) continue
    twiceArea += current[0] * next[1] - next[0] * current[1]
    latitudeTotal += current[1]
    points += 1
  }
  if (points < 3) return 0
  const latitudeScale = 111_320
  const longitudeScale = latitudeScale * Math.cos((latitudeTotal / points) * Math.PI / 180)
  return Math.abs(twiceArea / 2) * latitudeScale * longitudeScale
}

function polygonAreaSquareMeters(geometry) {
  if (!geometry) return 0
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
  let total = 0
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const area = ringAreaSquareMeters(polygon[index])
      total += index === 0 ? area : -area
    }
  }
  return Math.max(0, total)
}

function summarize(feature, groups) {
  const properties = feature?.properties ?? {}
  const zoning = String(properties.Zoning || 'Unspecified')
  const density = String(properties.Density || '').trim()
  const label = density ? `${zoning} · ${density}` : zoning
  let group = groups.get(label)
  if (!group) {
    group = { label, features: 0, areaM2: 0 }
    groups.set(label, group)
  }
  group.features += 1
  group.areaM2 += polygonAreaSquareMeters(feature.geometry)
}

self.onmessage = async event => {
  try {
    const response = await fetch(event.data.url)
    if (!response.ok) throw new Error(`Zoning data unavailable (${response.status})`)
    if (!response.body) throw new Error('Streaming is not available in this WebView')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const groups = new Map()
    let seek = ''
    let featureStarted = false
    let featureDepth = 0
    let inString = false
    let escaped = false
    let featureBuffer = ''
    let featureCount = 0
    let bytesRead = 0

    function consume(text) {
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        if (!featureStarted) {
          seek = (seek + char).slice(-32)
          if (seek.includes('"features"')) featureStarted = true
          continue
        }
        if (featureDepth === 0) {
          if (char === '{') {
            featureDepth = 1
            featureBuffer = '{'
            inString = false
            escaped = false
          }
          continue
        }
        featureBuffer += char
        if (inString) {
          if (escaped) escaped = false
          else if (char === '\\') escaped = true
          else if (char === '"') inString = false
          continue
        }
        if (char === '"') inString = true
        else if (char === '{') featureDepth += 1
        else if (char === '}') {
          featureDepth -= 1
          if (featureDepth === 0) {
            summarize(JSON.parse(featureBuffer), groups)
            featureCount += 1
            featureBuffer = ''
          }
        }
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      consume(decoder.decode(value, { stream: true }))
      if (bytesRead >= 8 * 1024 * 1024) {
        self.postMessage({ type: 'progress', features: featureCount })
        bytesRead = 0
      }
    }
    consume(decoder.decode())
    const resultGroups = [...groups.values()]
      .sort((left, right) => right.areaM2 - left.areaM2)
      .map(group => ({ label: group.label, features: group.features, areaKm2: group.areaM2 / 1_000_000 }))
    self.postMessage({ type: 'done', totalFeatures: featureCount, groups: resultGroups })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
