'use strict'

const METERS_PER_DEGREE = 111320

function segmentDistanceSquared(point, start, end) {
  const latitude = (point[1] + start[1] + end[1]) * Math.PI / 540
  const xScale = METERS_PER_DEGREE * Math.cos(latitude)
  const px = point[0] * xScale
  const py = point[1] * METERS_PER_DEGREE
  const ax = start[0] * xScale
  const ay = start[1] * METERS_PER_DEGREE
  const bx = end[0] * xScale
  const by = end[1] * METERS_PER_DEGREE
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const fraction = lengthSquared
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
    : 0
  const x = ax + fraction * dx - px
  const y = ay + fraction * dy - py
  return x * x + y * y
}

function simplifyRing(ring, tolerance) {
  if (!Array.isArray(ring) || ring.length <= 3) return ring
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  const source = closed ? ring.slice(0, -1) : ring
  if (source.length <= 3) return ring

  const threshold = tolerance * tolerance
  const keep = new Uint8Array(source.length)
  keep[0] = 1
  keep[source.length - 1] = 1
  const stack = [[0, source.length - 1]]

  while (stack.length) {
    const [first, last] = stack.pop()
    let farthest = threshold
    let index = -1
    for (let current = first + 1; current < last; current += 1) {
      const distance = segmentDistanceSquared(source[current], source[first], source[last])
      if (distance > farthest) {
        farthest = distance
        index = current
      }
    }
    if (index >= 0) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const output = []
  for (let index = 0; index < source.length; index += 1) {
    if (!keep[index]) continue
    const point = source[index]
    output.push([
      Number(point[0].toFixed(7)),
      Number(point[1].toFixed(7)),
      ...(point.length > 2 ? [Number(point[2].toFixed(3))] : []),
    ])
  }
  if (output.length < 3) return ring
  if (closed) output.push(output[0].slice())
  return output
}

self.onmessage = async event => {
  try {
    const response = await fetch(event.data.url, { cache: 'force-cache' })
    if (!response.ok) throw new Error(`Network_Boundary.json request failed (HTTP ${response.status})`)
    const source = await response.json()
    const tolerance = Number(event.data.tolerance) || 1.5
    const features = []

    for (const feature of source.features ?? []) {
      if (feature?.geometry?.type !== 'Polygon' || !Array.isArray(feature.geometry.coordinates)) continue
      features.push({
        type: 'Feature',
        properties: feature.properties ?? {},
        geometry: {
          type: 'Polygon',
          coordinates: feature.geometry.coordinates.map(ring => simplifyRing(ring, tolerance)),
        },
      })
    }

    const originalPoints = source.features.reduce(
      (total, feature) => total + (feature.geometry?.coordinates ?? []).reduce((sum, ring) => sum + ring.length, 0),
      0,
    )
    const simplifiedPoints = features.reduce(
      (total, feature) => total + feature.geometry.coordinates.reduce((sum, ring) => sum + ring.length, 0),
      0,
    )
    self.postMessage({
      type: 'done',
      data: { type: 'FeatureCollection', features },
      originalPoints,
      simplifiedPoints,
    })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
