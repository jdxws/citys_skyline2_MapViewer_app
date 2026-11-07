#!/usr/bin/env node

import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 真实城市数据体积大、与具体城市绑定，不放进项目：用环境变量 SKYLENS_CITY_GEOJSON 指向快照的 GeoJSON 目录；
// 找不到时只跳过“真实城市”这一部分，不影响其余测试。
const cityRoot = process.env.SKYLENS_CITY_GEOJSON
  ? path.resolve(process.env.SKYLENS_CITY_GEOJSON)
  : path.resolve(projectRoot, '../maps/maps/84960ae0f5e2a929/GeoJSON')
const workerPath = path.join(projectRoot, 'app/assets/routing.worker-B8mGiyHX.js')
const datasetId = '84960ae0f5e2a929'
const configVersion = 7

const point = (coordinates, properties) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties,
})

const pathway = coordinates => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties: { Object: 'Pathway' },
})

async function readJson(file) {
  return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
}

async function createWorker(workerSource) {
  const inbox = []
  const self = {
    onmessage: null,
    postMessage(message) {
      inbox.push(message)
    },
  }
  const context = vm.createContext({ console, self })
  vm.runInContext(workerSource, context, { filename: workerPath })
  return data => {
    inbox.length = 0
    context.self.onmessage({ data })
    assert.ok(inbox.length > 0, `worker produced no response for ${data.type}`)
    return inbox.at(-1)
  }
}

async function testDisconnectedWalkingNetwork(workerSource) {
  const dispatch = await createWorker(workerSource)
  const network = {
    type: 'FeatureCollection',
    features: [
      pathway([[-0.0008, 0.0036], [-0.0002, 0.0036]]),
      pathway([[0, 0], [0.005, 0]]),
      pathway([[0.0052, 0.0036], [0.0058, 0.0036]]),
    ],
  }
  const pois = {
    type: 'FeatureCollection',
    features: [
      point([0, 0], { Object: 'POITransport', Category: 'StopSubway', Name: 'Start station' }),
      point([0.005, 0], { Object: 'POITransport', Category: 'StopSubway', Name: 'End station' }),
    ],
  }
  const routes = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[0, 0], [0.005, 0]] },
      properties: {
        Object: 'RoutePassenger',
        Transport: 'Subway',
        Stop: 2,
        Name: 'Test subway',
        Color: '#006dff',
      },
    }],
  }

  assert.equal(dispatch({
    type: 'init',
    datasetId: 'synthetic00000001',
    configVersion,
    network,
    subwayEntrances: null,
  }).type, 'ready')
  assert.equal(dispatch({
    type: 'transit-data',
    datasetId: 'synthetic00000001',
    configVersion,
    pois,
    routes,
  }).type, 'transit-ready')

  const result = dispatch({
    type: 'route-transit',
    requestId: 1,
    datasetId: 'synthetic00000001',
    configVersion,
    origin: { type: 'Point', coordinates: [-0.0005, 0.0036] },
    destination: { type: 'Point', coordinates: [0.0055, 0.0036] },
  })
  assert.equal(result.type, 'transit-result')
  assert.ok(result.outcome.journey, JSON.stringify(result.outcome))
  assert.equal(result.outcome.journey.estimatedAccess, true)
  assert.equal(result.outcome.journey.accessDebug.origin.graphWalks, 0)
  assert.ok(result.outcome.journey.accessDebug.origin.directStops > 0)
  console.log('synthetic disconnected walking network: direct access fallback passed')
}

async function testStationPlatformTransfer(workerSource) {
  const dispatch = await createWorker(workerSource)
  const network = {
    type: 'FeatureCollection',
    features: [
      pathway([[0, 0], [0.0005, 0]]),
      pathway([[0.005, 0], [0.0055, 0]]),
      pathway([[0.006, 0], [0.0065, 0]]),
      pathway([[0.011, 0], [0.0115, 0]]),
    ],
  }
  const stops = [
    [0.0002, 0],
    [0.0052, 0],
    [0.0062, 0],
    [0.0112, 0],
  ]
  const pois = {
    type: 'FeatureCollection',
    features: stops.map((coordinates, index) =>
      point(coordinates, {
        Object: 'POITransport',
        Category: 'StopSubway',
        Name: ['Start', 'Interchange A', 'Interchange B', 'End'][index],
      })),
  }
  const route = (coordinates, name) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: {
      Object: 'RoutePassenger',
      Transport: 'Subway',
      Stop: 2,
      Name: name,
      Color: '#006dff',
    },
  })
  const routes = {
    type: 'FeatureCollection',
    features: [
      route([stops[0], stops[1]], 'Line 2'),
      route([stops[2], stops[3]], 'Line 6'),
    ],
  }
  const subwayEntrances = {
    formatVersion: 2,
    stations: [
      { id: 'start', name: 'Start', platformStopFeatureIds: [0], entrances: [] },
      { id: 'interchange', name: 'Interchange', platformStopFeatureIds: [1, 2], entrances: [] },
      { id: 'end', name: 'End', platformStopFeatureIds: [3], entrances: [] },
    ],
  }

  const datasetId = 'synthetic00000002'
  assert.equal(dispatch({
    type: 'init',
    datasetId,
    configVersion,
    network,
    subwayEntrances,
  }).type, 'ready')
  assert.equal(dispatch({
    type: 'transit-data',
    datasetId,
    configVersion,
    pois,
    routes,
  }).type, 'transit-ready')

  const result = dispatch({
    type: 'route-transit',
    requestId: 2,
    datasetId,
    configVersion,
    origin: { type: 'Point', coordinates: [0.0002, 0] },
    destination: { type: 'Point', coordinates: [0.0112, 0] },
  })
  assert.equal(result.type, 'transit-result')
  assert.ok(result.outcome.journey, JSON.stringify(result.outcome))
  assert.equal(result.outcome.journey.strategy, 'shortest-time')
  assert.deepEqual(Array.from(
    result.outcome.journey.legs.filter(leg => leg.kind === 'ride').map(leg => leg.routeName),
  ), ['Line 2', 'Line 6'])
  assert.equal(result.outcome.journey.transfers, 1)
  console.log('synthetic same-station platform transfer passed')
}

async function testRealCity(workerSource) {
  const [network, pois, routes, subwayEntrances] = await Promise.all([
    readJson(path.join(cityRoot, 'Network_Centerline.json')),
    readJson(path.join(cityRoot, 'POI_Location.json')),
    readJson(path.join(cityRoot, 'Route_Centerline.json')),
    readJson(path.join(cityRoot, 'Subway_Station_Entrances.json')),
  ])
  const subwayStopFeatures = pois.features
    .filter(feature => feature.geometry?.type === 'Point' &&
      String(feature.properties?.Category ?? '').split(',').map(value => value.trim()).includes('StopSubway'))
    .map(feature => ({
      coordinates: feature.geometry.coordinates,
      name: String(feature.properties?.Name ?? ''),
    }))
    .sort((left, right) => left.coordinates[0] - right.coordinates[0])
  const subwayStops = subwayStopFeatures.map(stop => stop.coordinates)
  assert.ok(subwayStops.length >= 2)
  assert.equal(subwayEntrances.formatVersion, 2)
  assert.equal(subwayEntrances.stations.filter(station => station.entranceCount === 0).length, 0)
  const anderiEntrance = subwayEntrances.stations
    .find(station => station.name === '安德里')?.entrances?.[0]
  assert.equal(anderiEntrance?.entranceType, 'station-building-fallback')

  const dispatch = await createWorker(workerSource)
  assert.equal(dispatch({
    type: 'init',
    datasetId,
    configVersion,
    network,
    subwayEntrances,
  }).type, 'ready')
  const transitReady = dispatch({
    type: 'transit-data',
    datasetId,
    configVersion,
    pois,
    routes,
  })
  assert.equal(transitReady.type, 'transit-ready')

  const endpoints = [
    [subwayStops[0], subwayStops.at(-1)],
    [subwayStops[Math.floor(subwayStops.length / 3)], subwayStops[Math.floor(subwayStops.length * 2 / 3)]],
  ]
  for (const [requestId, [origin, destination]] of endpoints.entries()) {
    const result = dispatch({
      type: 'route-transit',
      requestId: requestId + 10,
      datasetId,
      configVersion,
      origin: { type: 'Point', coordinates: origin },
      destination: { type: 'Point', coordinates: destination },
    })
    assert.equal(result.type, 'transit-result')
    assert.notEqual(result.outcome.reason, 'access', JSON.stringify(result.outcome))
    assert.equal(result.outcome.journeys?.[0]?.strategy, 'shortest-time')
    assert.equal(result.outcome.journey?.strategy, 'shortest-time')
    const debug = result.outcome.journey?.accessDebug ?? result.outcome.debug
    assert.ok(debug, JSON.stringify(result.outcome))
    console.log(
      `real city route ${requestId + 1}:`,
      result.outcome.journey ? 'journey' : result.outcome.reason,
      JSON.stringify(debug),
    )
  }

  const anderi = subwayStopFeatures.find(stop => stop.name === '安德里')
  const huancai = subwayStopFeatures.find(stop => stop.name === '寰彩')
  assert.ok(anderi && huancai)
  const anderiResult = dispatch({
    type: 'route-transit',
    requestId: 20,
    datasetId,
    configVersion,
    origin: { type: 'Point', coordinates: anderi.coordinates },
    destination: { type: 'Point', coordinates: huancai.coordinates },
  })
  assert.equal(anderiResult.type, 'transit-result')
  assert.ok(anderiResult.outcome.journey, JSON.stringify(anderiResult.outcome))
  assert.equal(anderiResult.outcome.journey.strategy, 'shortest-time')
  assert.ok(anderiResult.outcome.journey.legs.some(leg =>
    [leg.stationName, leg.fromStop, leg.toStop].some(value => String(value ?? '').includes('安德里')),
  ))
  console.log('安德里 station-building entrance route passed')

  const anfu = pois.features[5105]?.geometry?.coordinates
  const chongfenglin = pois.features[5039]?.geometry?.coordinates
  assert.ok(anfu && chongfenglin)
  const directInterchange = dispatch({
    type: 'route-transit',
    requestId: 21,
    datasetId,
    configVersion,
    origin: { type: 'Point', coordinates: anfu },
    destination: { type: 'Point', coordinates: chongfenglin },
  })
  const directJourney = directInterchange.outcome.journey
  assert.ok(directJourney, JSON.stringify(directInterchange.outcome))
  assert.deepEqual(
    Array.from(directJourney.legs.filter(leg => leg.kind === 'ride').map(leg => leg.routeName)),
    ['地铁路线 2', '地铁路线 6'],
  )
  assert.equal(directJourney.transfers, 1)
  assert.ok(directJourney.walkingDistance < 500)
  console.log('安福 → 银云楼步行街 → 铳锋林 direct interchange passed')
}

const workerSource = await readFile(workerPath, 'utf8')
await testDisconnectedWalkingNetwork(workerSource)
await testStationPlatformTransfer(workerSource)
if (await access(path.join(cityRoot, 'Subway_Station_Entrances.json')).then(() => true, () => false)) {
  await testRealCity(workerSource)
} else {
  console.log(`skipped real-city checks: ${cityRoot} not found (set SKYLENS_CITY_GEOJSON to run them)`)
}
console.log('transit entry access checks passed')
