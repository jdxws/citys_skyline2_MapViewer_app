'use strict'
// 把 Carto 导出的原始 exported_files（GeoJSON / GeoTIFF / Styles）整理成网页能读取的快照，
// 逻辑与上游项目的 scripts/prepare-data.mjs、prepare-water.mjs 保持一致（生成的快照 ID 也相同）。
// 注意：本模块会把整个 GeoJSON 读入内存，请在子进程里运行（见 prepare-worker.js）。
const { createHash } = require('node:crypto')
const fsp = require('node:fs').promises
const path = require('node:path')
const { buildSubwayStationEntrances } = require('./subway-entrances')

const SOURCES = [
  { file: 'Building_Boundary.json', geometry: 'Polygon' },
  { file: 'Network_Centerline.json', geometry: 'LineString' },
  { file: 'Area_Boundary.json', geometry: 'Polygon' },
  { file: 'POI_Location.json', geometry: 'Point' },
  { file: 'Route_Centerline.json', geometry: 'LineString' },
  { file: 'Zoning_Boundary.json', geometry: 'Polygon' },
  { file: 'Network_Boundary.json', geometry: 'Polygon' },
]
const RASTERS = ['Depth.tif']
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

async function styleFiles(root, prefix = '') {
  const paths = []
  for (const entry of await fsp.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) paths.push(...await styleFiles(root, relative))
    else if (entry.isFile()) paths.push(relative)
  }
  return paths.sort()
}

function walkCoordinates(value, bounds) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('出现空的坐标数组')
  if (typeof value[0] === 'number') {
    if (value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) throw new Error('出现无效坐标')
    bounds[0] = Math.min(bounds[0], value[0])
    bounds[1] = Math.min(bounds[1], value[1])
    bounds[2] = Math.max(bounds[2], value[0])
    bounds[3] = Math.max(bounds[3], value[1])
    return
  }
  for (const child of value) walkCoordinates(child, bounds)
}

async function prepareWater(inputPath, outputPath, buildingBounds) {
  const { fromFile } = await import('geotiff')
  const proj4 = (await import('proj4')).default
  const { PNG } = (await import('pngjs')).default

  const sourceBytes = await fsp.readFile(inputPath)
  const tiff = await fromFile(inputPath)
  const image = await tiff.getImage()
  const epsg = image.getGeoKeys().ProjectedCSTypeGeoKey
  const zone = epsg >= 32601 && epsg <= 32660 ? epsg - 32600 :
    epsg >= 32701 && epsg <= 32760 ? epsg - 32700 : null
  if (zone === null) throw new Error(`不支持的水深 GeoTIFF 坐标系：${epsg ?? '无'}`)

  const tiePoints = await image.getTiePoints()
  const pixelScale = await image.fileDirectory.getValue(33550)
  const noData = image.getGDALNoData()
  if (tiePoints.length !== 1 || !pixelScale || pixelScale[0] <= 0 || pixelScale[1] <= 0 || !Number.isFinite(noData)) {
    throw new Error('无法确认水深 GeoTIFF 的基准点、像素大小或 NoData')
  }

  const width = image.getWidth()
  const height = image.getHeight()
  const tie = tiePoints[0]
  const left = tie.x - tie.i * pixelScale[0]
  const top = tie.y + tie.j * pixelScale[1]
  const right = left + width * pixelScale[0]
  const bottom = top - height * pixelScale[1]
  const utm = `+proj=utm +zone=${zone} ${epsg >= 32700 ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`
  const coordinates = [[left, top], [right, top], [right, bottom], [left, bottom]]
    .map(point => proj4(utm, 'EPSG:4326', point))
  const longitude = coordinates.map(point => point[0])
  const latitude = coordinates.map(point => point[1])
  const bounds = [Math.min(...longitude), Math.min(...latitude), Math.max(...longitude), Math.max(...latitude)]
  if (buildingBounds && (bounds[2] < buildingBounds[0] || bounds[0] > buildingBounds[2] ||
      bounds[3] < buildingBounds[1] || bounds[1] > buildingBounds[3])) {
    throw new Error('水深 GeoTIFF 与建筑坐标范围没有重叠')
  }

  const [depth] = await image.readRasters({ samples: [0] })
  if (depth.length !== width * height) throw new Error('水深像素数与图像尺寸不一致')
  const png = new PNG({ width, height })
  const water = new Uint8Array(depth.length)
  let waterPixels = 0
  for (let i = 0; i < depth.length; i += 1) {
    water[i] = depth[i] !== noData && depth[i] > 0 ? 1 : 0
  }
  // Antialias the binary water mask at shorelines before it is enlarged in the map.
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let wet = 0
    let samples = 0
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      wet += water[ny * width + nx]
      samples += 1
    }
    const alpha = Math.round(wet / samples * 255)
    if (!alpha) continue
    const offset = (y * width + x) * 4
    png.data[offset] = 166
    png.data[offset + 1] = 208
    png.data[offset + 2] = 221
    png.data[offset + 3] = alpha
    waterPixels += 1
  }
  if (!waterPixels) throw new Error('水深 GeoTIFF 中没有水体像素')
  await fsp.writeFile(outputPath, PNG.sync.write(png))
  return {
    file: 'water-mask.png', source: 'Depth.tif', sourceSha256: sha256(sourceBytes),
    epsg, noData, width, height, waterPixels, coordinates, bounds,
  }
}

/**
 * @param {string} inputRoot  含 GeoJSON/、GeoTIFF/、Styles/ 的目录（exported_files）
 * @param {string} outputDir  输出目录（会写入 GeoJSON/、manifest.json、water-mask.png 等）
 * @param {(fraction: number, message: string) => void} [onProgress]
 */
async function prepareSnapshot(inputRoot, outputDir, onProgress = () => {}) {
  const input = path.join(inputRoot, 'GeoJSON')
  await fsp.mkdir(path.join(outputDir, 'GeoJSON'), { recursive: true })
  await fsp.mkdir(path.join(outputDir, 'GeoTIFF'), { recursive: true })
  await fsp.mkdir(path.join(outputDir, 'Shapefile'), { recursive: true })

  const manifest = { preparedAt: new Date().toISOString(), files: {}, cartoFiles: {}, rasters: {} }
  const steps = SOURCES.length + 3
  let done = 0
  const tick = message => onProgress(Math.min(0.99, ++done / steps), message)

  for (const { file, geometry } of SOURCES) {
    onProgress(done / steps, `正在检查 ${file}`)
    const sourcePath = path.join(input, file)
    let bytes
    try { bytes = await fsp.readFile(sourcePath) } catch { throw new Error(`缺少文件 GeoJSON/${file}`) }
    const data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error(`${file}：不是 FeatureCollection`)
    }
    if (!data.features.length) throw new Error(`${file}：没有任何要素`)
    const bounds = [Infinity, Infinity, -Infinity, -Infinity]
    const objects = Object.create(null)
    data.features.forEach((feature, index) => {
      if (feature?.type !== 'Feature' || feature.geometry?.type !== geometry ||
          !Array.isArray(feature.geometry.coordinates) ||
          !feature.properties || typeof feature.properties !== 'object') {
        throw new Error(`${file}：第 ${index} 个要素的结构不正确`)
      }
      walkCoordinates(feature.geometry.coordinates, bounds)
      const object = feature.properties.Object
      if (typeof object !== 'string') throw new Error(`${file}：第 ${index} 个要素缺少 Object 属性`)
      objects[object] = (objects[object] ?? 0) + 1
    })
    manifest.files[file] = {
      features: data.features.length, bytes: bytes.length, sha256: sha256(bytes), bounds, objects,
    }
    await fsp.copyFile(sourcePath, path.join(outputDir, 'GeoJSON', file))
    tick(`已处理 ${file}（${data.features.length} 个要素）`)
  }

  const buildingPath = path.join(input, 'Building_Boundary.json')
  const poiPath = path.join(input, 'POI_Location.json')
  const buildings = JSON.parse((await fsp.readFile(buildingPath, 'utf8')).replace(/^\uFEFF/, ''))
  const pois = JSON.parse((await fsp.readFile(poiPath, 'utf8')).replace(/^\uFEFF/, ''))
  const subwayEntrances = buildSubwayStationEntrances(buildings, pois)
  const subwayEntranceFile = 'Subway_Station_Entrances.json'
  await fsp.writeFile(
    path.join(outputDir, 'GeoJSON', subwayEntranceFile),
    `${JSON.stringify(subwayEntrances, null, 2)}\n`,
  )
  manifest.derived = {
    [subwayEntranceFile]: {
      stations: subwayEntrances.stations.length,
      entrances: subwayEntrances.stations.reduce((total, station) => total + station.entranceCount, 0),
      groupedBy: subwayEntrances.stationGrouping,
    },
  }

  for (const file of RASTERS) {
    const source = path.join(inputRoot, 'GeoTIFF', file)
    let bytes
    try { bytes = await fsp.readFile(source) } catch { throw new Error(`缺少文件 GeoTIFF/${file}`) }
    await fsp.copyFile(source, path.join(outputDir, 'GeoTIFF', file))
    manifest.cartoFiles[file] = { bytes: bytes.length, sha256: sha256(bytes) }
  }

  let styles = []
  try { styles = await styleFiles(path.join(inputRoot, 'Styles')) } catch { /* 没有样式文件也可以 */ }
  for (const relative of styles) {
    const source = path.join(inputRoot, 'Styles', relative)
    const target = path.join(outputDir, 'Styles', relative)
    const bytes = await fsp.readFile(source)
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.copyFile(source, target)
    manifest.cartoFiles[`Styles/${relative}`] = { bytes: bytes.length, sha256: sha256(bytes) }
  }
  tick('已复制样式与栅格文件')

  onProgress(done / steps, '正在生成水体图层')
  try {
    manifest.rasters.water = await prepareWater(
      path.join(inputRoot, 'GeoTIFF', 'Depth.tif'),
      path.join(outputDir, 'water-mask.png'),
      manifest.files['Building_Boundary.json'].bounds,
    )
  } catch (error) {
    await fsp.rm(path.join(outputDir, 'water-mask.png'), { force: true })
    manifest.rasters.water = { error: error instanceof Error ? error.message : String(error) }
  }
  tick('水体图层完成')

  const snapshotFiles = Object.entries(manifest.files).map(([file, info]) => `${file}:${info.sha256 ?? 'unavailable'}`)
  snapshotFiles.push(...RASTERS.map(file => `${file}:${manifest.cartoFiles[file].sha256}`))
  snapshotFiles.push(...styles.map(file => `Styles/${file}:${manifest.cartoFiles[`Styles/${file}`].sha256}`))
  snapshotFiles.unshift('CityMap-snapshot-layout-v2')
  manifest.datasetId = createHash('sha256').update(snapshotFiles.join('\n')).digest('hex').slice(0, 16)

  await fsp.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  onProgress(1, '快照整理完成')
  return manifest
}

module.exports = { prepareSnapshot }
