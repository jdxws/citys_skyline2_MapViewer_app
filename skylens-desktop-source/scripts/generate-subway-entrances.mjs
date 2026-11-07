#!/usr/bin/env node

import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import entranceBuilder from '../src/core/subway-entrances.js'

const { buildSubwayStationEntrances } = entranceBuilder
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argumentsList = process.argv.slice(2)
const roots = argumentsList.length
  ? argumentsList.map(value => path.resolve(value))
  : [path.join(projectRoot, 'maps/maps')]

async function snapshotDirectories(root) {
  const directGeoJSON = path.join(root, 'GeoJSON')
  try {
    await readFile(path.join(directGeoJSON, 'Building_Boundary.json'))
    return [root]
  } catch {}
  const entries = await readdir(root, { withFileTypes: true })
  const candidates = entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(root, entry.name))
  const matches = await Promise.all(candidates.map(async candidate => {
      try {
        await access(path.join(candidate, 'GeoJSON', 'Building_Boundary.json'))
        return true
      } catch {
        return false
      }
    }))
  return candidates.filter((candidate, index) => matches[index])
}

const readJson = async file =>
  JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))

for (const root of roots) {
  for (const snapshot of await snapshotDirectories(root)) {
    const geoRoot = path.join(snapshot, 'GeoJSON')
    const buildings = await readJson(path.join(geoRoot, 'Building_Boundary.json'))
    const pois = await readJson(path.join(geoRoot, 'POI_Location.json'))
    const table = buildSubwayStationEntrances(buildings, pois)
    const destination = path.join(geoRoot, 'Subway_Station_Entrances.json')
    await writeFile(destination, `${JSON.stringify(table, null, 2)}\n`)
    const entrances = table.stations.reduce((total, station) => total + station.entranceCount, 0)
    console.log(`${path.relative(projectRoot, destination)}: ${table.stations.length} stations, ${entrances} entrances`)
  }
}
