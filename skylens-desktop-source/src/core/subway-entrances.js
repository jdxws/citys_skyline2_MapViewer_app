'use strict'

const fsp = require('node:fs').promises
const path = require('node:path')

const FORMAT_VERSION = 2
const OUTPUT_FILE = 'Subway_Station_Entrances.json'
const EARTH_RADIUS_METERS = 6371000
const STATION_GROUP_DISTANCE_METERS = 120

const radians = value => value * Math.PI / 180

function distanceMeters(left, right) {
  const latitudeDelta = radians(right[1] - left[1])
  const longitudeDelta = radians(right[0] - left[0])
  const latitude1 = radians(left[1])
  const latitude2 = radians(right[1])
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2,
  ))
}

function centroid(geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : []
  const points = []
  for (const polygon of polygons) {
    const ring = polygon[0]
    if (!Array.isArray(ring) || ring.length < 3) continue
    const unique = ring.length > 1 &&
      ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
      ? ring.slice(0, -1)
      : ring
    points.push(...unique)
  }
  if (!points.length) return null
  const longitude = points.reduce((total, point) => total + point[0], 0) / points.length
  const latitude = points.reduce((total, point) => total + point[1], 0) / points.length
  return [longitude, latitude]
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function includesCategory(properties, category) {
  return String(properties?.Category ?? '').split(',')
    .map(value => value.trim()).includes(category)
}

function addEntrance(sourceFeatureId, feature, point, nearest, entranceType, entrances) {
  const properties = feature.properties ?? {}
  const entrance = {
    id: `subway-entrance-${entrances.length + 1}`,
    sourceFeatureId,
    name: text(properties.Name) || 'Subway station entrance',
    asset: text(properties.Asset),
    coordinates: point,
    geometry: feature.geometry,
    district: text(properties.Address_District),
    street: text(properties.Address_Street),
    number: properties.Address_Number ?? 0,
    stationId: nearest.station.id,
    stationName: nearest.station.name,
    distanceToPlatformMeters: Number(nearest.distance.toFixed(2)),
    entranceType,
  }
  nearest.station.entrances.push(entrance)
  entrances.push(entrance)
}

function buildSubwayStationEntrances(buildings, pois) {
  const stops = []
  for (const [sourceFeatureId, feature] of (pois?.features ?? []).entries()) {
    if (!includesCategory(feature.properties, 'StopSubway') || feature.geometry?.type !== 'Point') continue
    const point = feature.geometry.coordinates
    if (!Array.isArray(point) || point.length < 2) continue
    stops.push({
      sourceFeatureId,
      name: text(feature.properties?.Name),
      district: text(feature.properties?.Address_District),
      street: text(feature.properties?.Address_Street),
      number: feature.properties?.Address_Number ?? 0,
      point,
    })
  }

  const groups = []
  for (const stop of stops) {
    let station = groups.find(candidate =>
      candidate.name === stop.name &&
      candidate.stops.some(member =>
        distanceMeters(member.point, stop.point) <= STATION_GROUP_DISTANCE_METERS,
      ),
    )
    if (!station) {
      station = {
        id: `subway-station-${groups.length + 1}`,
        name: stop.name || `Unnamed subway station ${groups.length + 1}`,
        stops: [],
        entrances: [],
      }
      groups.push(station)
    }
    station.stops.push(stop)
  }

  for (const station of groups) {
    const longitude = station.stops.reduce((total, stop) => total + stop.point[0], 0) / station.stops.length
    const latitude = station.stops.reduce((total, stop) => total + stop.point[1], 0) / station.stops.length
    station.coordinates = [longitude, latitude]
    station.district = station.stops.find(stop => stop.district)?.district ?? ''
    station.street = station.stops.find(stop => stop.street)?.street ?? ''
    station.number = station.stops.find(stop => Number(stop.number))?.number ?? 0
  }

  const entrances = []
  for (const [sourceFeatureId, feature] of (buildings?.features ?? []).entries()) {
    const properties = feature.properties ?? {}
    const asset = text(properties.Asset)
    if (!/subwaystationentrance/i.test(asset) || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) continue
    const point = centroid(feature.geometry)
    if (!point || !groups.length) continue
    let nearest = null
    for (const station of groups) {
      for (const stop of station.stops) {
        const distance = distanceMeters(point, stop.point)
        if (!nearest || distance < nearest.distance) nearest = { station, stop, distance }
      }
    }
    addEntrance(sourceFeatureId, feature, point, nearest, 'subway-station-entrance', entrances)
  }

  // Some stations have no separate entrance geometry; their ground-level station
  // building is the entrance. Match by station name and address so unrelated
  // buildings are never used as entrances.
  for (const [sourceFeatureId, feature] of (buildings?.features ?? []).entries()) {
    const properties = feature.properties ?? {}
    if (!['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) continue
    const point = centroid(feature.geometry)
    if (!point || !groups.length) continue
    const name = text(properties.Name)
    const district = text(properties.Address_District)
    const street = text(properties.Address_Street)
    const number = properties.Address_Number ?? 0
    const namedGroups = groups.filter(station =>
      name && station.name === name &&
      (!street || !station.street || station.street === street) &&
      (!number || !station.number || station.number === number),
    )
    if (!namedGroups.length) continue
    let nearest = null
    for (const station of namedGroups) {
      for (const stop of station.stops) {
        const distance = distanceMeters(point, stop.point)
        if (!nearest || distance < nearest.distance) nearest = { station, stop, distance }
      }
    }
    if (!nearest || nearest.station.entrances.length) continue
    addEntrance(sourceFeatureId, feature, point, nearest, 'station-building-fallback', entrances)
  }

  return {
    formatVersion: FORMAT_VERSION,
    generatedFrom: ['Building_Boundary.json', 'POI_Location.json'],
    stationGrouping: {
      method: 'same-name stops within 120 meters',
      stopCategory: 'StopSubway',
      entranceAssetPattern: 'SubwayStationEntrance; matching station building fallback',
    },
    stations: groups.map(station => ({
      id: station.id,
      name: station.name,
      coordinates: station.coordinates,
      district: station.district,
      street: station.street,
      number: station.number,
      platformStopFeatureIds: station.stops.map(stop => stop.sourceFeatureId).sort((left, right) => left - right),
      entranceCount: station.entrances.length,
      entrances: station.entrances.sort((left, right) =>
        left.distanceToPlatformMeters - right.distanceToPlatformMeters,
      ),
    })).sort((left, right) =>
      left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id),
    ),
  }
}

const readJson = async file => JSON.parse((await fsp.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))

/**
 * 保证快照里有最新格式的出入口表。游戏导出的“已处理好的快照”本身不带这张表，所以导入时和打开旧地图时都要补生成
 *（和安卓端 SubwayEntranceBuilder.ensureGenerated 行为一致）。
 * 返回 'current'（已是最新）、'generated'（刚生成）或 'failed'（生成失败）。失败只记日志，不影响地图使用。
 */
async function ensureSubwayEntrances(snapshotDir) {
  const output = path.join(snapshotDir, 'GeoJSON', OUTPUT_FILE)
  try {
    if ((await readJson(output)).formatVersion >= FORMAT_VERSION) return 'current'
  } catch { /* 不存在或已损坏：重新生成 */ }
  try {
    const geo = path.join(snapshotDir, 'GeoJSON')
    const [buildings, pois] = await Promise.all([
      readJson(path.join(geo, 'Building_Boundary.json')),
      readJson(path.join(geo, 'POI_Location.json')),
    ])
    const table = buildSubwayStationEntrances(buildings, pois)
    const temporary = `${output}.tmp`
    await fsp.writeFile(temporary, `${JSON.stringify(table, null, 2)}\n`)
    await fsp.rename(temporary, output)
    return 'generated'
  } catch (error) {
    await fsp.rm(output, { force: true })
    await fsp.rm(`${output}.tmp`, { force: true })
    console.warn(`生成地铁出入口表失败：${error.message}`)
    return 'failed'
  }
}

module.exports = {
  buildSubwayStationEntrances,
  ensureSubwayEntrances,
  distanceMeters,
  FORMAT_VERSION,
  OUTPUT_FILE,
}
