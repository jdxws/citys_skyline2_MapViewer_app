'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { execFileSync } = require('node:child_process')
const { Library } = require('../src/core/library')
const { importPath, findSnapshots, ImportError } = require('../src/core/importer')
const { createMapServer } = require('../src/core/server')

const GEOMETRY = {
  'Building_Boundary.json': 'Polygon', 'Network_Centerline.json': 'LineString', 'Area_Boundary.json': 'Polygon',
  'POI_Location.json': 'Point', 'Route_Centerline.json': 'LineString', 'Zoning_Boundary.json': 'Polygon',
  'Network_Boundary.json': 'Polygon',
}

async function tmp(label) { return fs.mkdtemp(path.join(os.tmpdir(), `skylens-${label}-`)) }

/** 生成一个很小的、已处理好的快照目录 */
async function makeSnapshot(dir, id = 'aaaaaaaaaaaaaaaa') {
  await fs.mkdir(path.join(dir, 'GeoJSON'), { recursive: true })
  const files = {}
  for (const [file, type] of Object.entries(GEOMETRY)) {
    const coordinates = type === 'Point' ? [0, 0] : type === 'LineString' ? [[0, 0], [1, 1]] : [[[0, 0], [1, 0], [1, 1], [0, 0]]]
    const body = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type, coordinates }, properties: { Object: 'x' } }] }
    await fs.writeFile(path.join(dir, 'GeoJSON', file), JSON.stringify(body))
    files[file] = { features: 1 }
  }
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ datasetId: id, files }))
  await fs.writeFile(path.join(dir, 'water-mask.png'), 'png')
  return dir
}

async function makeLibrary() {
  const lib = new Library(await tmp('lib'))
  await lib.init()
  return lib
}

test('findSnapshots：直接目录、dist/data、多层嵌套、无关目录', async () => {
  const root = await tmp('find')
  await makeSnapshot(path.join(root, 'direct'))
  await makeSnapshot(path.join(root, 'dist', 'data'))
  await makeSnapshot(path.join(root, 'deep', 'a', 'b'))
  await fs.mkdir(path.join(root, 'empty'))
  assert.equal((await findSnapshots(path.join(root, 'direct'))).length, 1)
  assert.equal((await findSnapshots(path.join(root, 'dist'))).length, 1)
  assert.equal((await findSnapshots(path.join(root, 'deep')))[0].dir, path.join(root, 'deep', 'a', 'b'))
  assert.deepEqual(await findSnapshots(path.join(root, 'empty')), [])
})

test('importPath：快照文件夹 → 地图库，重复导入保留自定义名称', async () => {
  const lib = await makeLibrary()
  const src = await makeSnapshot(path.join(await tmp('src'), 'mycity'))
  const progress = []
  const [entry] = await importPath(src, lib, { onProgress: p => progress.push(p.fraction) })
  assert.equal(entry.id, 'aaaaaaaaaaaaaaaa')
  assert.equal(entry.name, 'mycity')
  assert.equal(entry.stats.buildings, 1)
  assert.equal(progress.at(-1), 1)
  assert.equal((await lib.list()).length, 1)

  await lib.rename(entry.id, '改过的名字')
  const [again] = await importPath(src, lib)
  assert.equal(again.name, '改过的名字')
  assert.equal((await lib.list()).length, 1)
  assert.deepEqual(await fs.readdir(lib.stagingDir), [])
})

test('importPath：一个文件夹里有多个快照时全部导入', async () => {
  const lib = await makeLibrary()
  const root = await tmp('multi')
  await makeSnapshot(path.join(root, 's1'), '1111111111111111')
  await makeSnapshot(path.join(root, 's2'), '2222222222222222')
  const entries = await importPath(root, lib)
  assert.equal(entries.length, 2)
  assert.deepEqual((await lib.list()).map(e => e.id).sort(), ['1111111111111111', '2222222222222222'])
})

test('importPath：错误情况给出清楚的提示且不留垃圾', async () => {
  const lib = await makeLibrary()
  await assert.rejects(importPath(path.join(os.tmpdir(), 'no-such-thing'), lib), ImportError)
  const notZip = path.join(await tmp('f'), 'a.txt')
  await fs.writeFile(notZip, 'x')
  await assert.rejects(importPath(notZip, lib), /zip/)
  await assert.rejects(importPath(await tmp('empty'), lib), /没有找到地图快照/)
  const broken = await makeSnapshot(await tmp('broken'))
  await fs.rm(path.join(broken, 'GeoJSON', 'POI_Location.json'))
  await assert.rejects(importPath(broken, lib), /缺少 GeoJSON\/POI_Location\.json/)
  await fs.writeFile(path.join(broken, 'manifest.json'), JSON.stringify({ datasetId: 'nope' }))
  await assert.rejects(importPath(broken, lib), /快照 ID/)
  assert.deepEqual(await fs.readdir(lib.stagingDir), [])
  assert.equal((await lib.list()).length, 0)
})

test('importPath：zip 压缩包（含外层文件夹）', { skip: (() => { try { execFileSync('zip', ['-v'], { stdio: 'ignore' }); return false } catch { return 'zip 命令不可用' } })() }, async () => {
  const lib = await makeLibrary()
  const root = await tmp('zip')
  await makeSnapshot(path.join(root, 'inner'), 'bbbbbbbbbbbbbbbb')
  execFileSync('zip', ['-qr', path.join(root, 'snap.zip'), 'inner'], { cwd: root })
  const [entry] = await importPath(path.join(root, 'snap.zip'), lib)
  assert.equal(entry.id, 'bbbbbbbbbbbbbbbb')
  assert.equal(entry.name, 'snap')
  assert.deepEqual(await fs.readdir(lib.stagingDir), [])
})

test('Library：重命名校验、删除、过滤已丢失的目录', async () => {
  const lib = await makeLibrary()
  const [entry] = await importPath(await makeSnapshot(await tmp('lib-src')), lib)
  await assert.rejects(lib.rename(entry.id, '  '), /不能为空/)
  assert.throws(() => lib.dataDir('../../etc'), /无效/)
  await fs.rm(lib.dataDir(entry.id), { recursive: true })
  assert.equal((await lib.list()).length, 0)
  await lib.remove(entry.id)
})

test('createMapServer：会话、快照映射、路径穿越与主机名校验', async () => {
  const appDir = await tmp('app')
  await fs.writeFile(path.join(appDir, 'index.html'), '<html>ok</html>')
  await fs.mkdir(path.join(appDir, 'assets'))
  await fs.writeFile(path.join(appDir, 'assets', 'a.js'), 'x')
  const dataDir = await makeSnapshot(await tmp('data'), 'cccccccccccccccc')
  const server = await createMapServer({ appDir, dataDir })
  try {
    const get = async (p, headers) => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: server.port, path: p, headers }, res => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }))
      }).on('error', reject)
    })
    assert.deepEqual(JSON.parse((await get('/session.json')).body), { snapshotId: 'cccccccccccccccc', dataRoot: 'snapshots/cccccccccccccccc/' })
    assert.equal((await get('/')).body, '<html>ok</html>')
    assert.match((await get('/assets/a.js')).type, /javascript/)
    assert.equal((await get('/snapshots/cccccccccccccccc/manifest.json')).status, 200)
    assert.equal((await get('/snapshots/cccccccccccccccc/GeoJSON/Building_Boundary.json')).status, 200)
    assert.equal((await get('/snapshots/dddddddddddddddd/manifest.json')).status, 404)
    assert.equal((await get('/snapshots/cccccccccccccccc/%2e%2e/%2e%2e/x')).status, 404)
    assert.equal((await get('/%2e%2e/%2e%2e/etc/passwd')).status, 404)
    assert.equal((await get('/session.json', { Host: 'evil.example' })).status, 403)
  } finally {
    await server.close()
  }
})
