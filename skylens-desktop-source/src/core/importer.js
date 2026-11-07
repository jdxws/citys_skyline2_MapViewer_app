'use strict'
// 导入器：接受 ① 快照 .zip ② 快照文件夹 ③ 已构建的 dist 文件夹 ④ 原始 exported_files 文件夹，
// 自动识别其中的快照并放入地图库。
const fsp = require('node:fs').promises
const path = require('node:path')
const { fork } = require('node:child_process')
const { SNAPSHOT_ID } = require('./server')
const { ensureSubwayEntrances } = require('./subway-entrances')

class ImportError extends Error {}

const REQUIRED_GEOJSON = [
  'Building_Boundary.json', 'Network_Centerline.json', 'Area_Boundary.json', 'POI_Location.json',
  'Route_Centerline.json', 'Zoning_Boundary.json', 'Network_Boundary.json',
]
const SKIP_DIRS = new Set(['node_modules', 'Styles', 'GeoJSON', 'GeoTIFF', 'Shapefile', 'assets', '$RECYCLE.BIN', 'System Volume Information'])
const GENERIC_NAMES = new Set(['data', 'exported_files', 'dist', 'snapshots', 'export', 'exports'])

const exists = target => fsp.stat(target).then(() => true, () => false)

/** 'prepared' = 游戏模组/本程序已处理好的快照；'raw' = 原始 exported_files；null = 不是快照 */
async function classify(dir) {
  if (!await exists(path.join(dir, 'GeoJSON', 'Building_Boundary.json'))) return null
  if (await exists(path.join(dir, 'manifest.json')) && await exists(path.join(dir, 'water-mask.png'))) return 'prepared'
  return 'raw'
}

/** 由浅入深查找快照；同一层找到多个时全部返回。 */
async function findSnapshots(root, { maxDepth = 4, maxDirs = 3000 } = {}) {
  let level = [root]
  let visited = 0
  for (let depth = 0; depth <= maxDepth && level.length; depth += 1) {
    const found = []
    for (const dir of level) {
      const kind = await classify(dir)
      if (kind) found.push({ dir, kind })
    }
    if (found.length) return found
    const next = []
    for (const dir of level) {
      let entries
      try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { continue }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
        if (++visited > maxDirs) return []
        next.push(path.join(dir, entry.name))
      }
    }
    level = next
  }
  return []
}

async function listFiles(dir, base = dir, out = []) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await listFiles(full, base, out)
    else if (entry.isFile()) out.push({ rel: path.relative(base, full), size: (await fsp.stat(full)).size })
  }
  return out
}

async function dirSize(dir) {
  return (await listFiles(dir)).reduce((sum, file) => sum + file.size, 0)
}

async function copyTree(src, dst, onFraction) {
  const files = await listFiles(src)
  const total = files.reduce((sum, file) => sum + file.size, 0) || 1
  let copied = 0
  await fsp.mkdir(dst, { recursive: true })
  for (const { rel, size } of files) {
    const target = path.join(dst, rel)
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.copyFile(path.join(src, rel), target)
    copied += size
    onFraction(copied / total, `正在复制 ${rel.split(path.sep)[0]} …`)
  }
}

async function extractZip(zipPath, dir, onFraction) {
  const extract = require('extract-zip')
  await extract(zipPath, {
    dir: path.resolve(dir),
    onEntry: (entry, zipfile) => onFraction(zipfile.entryCount ? zipfile.entriesRead / zipfile.entryCount : 1, '正在解压 …'),
  })
}

function runPrepare(inputRoot, outputDir, onFraction) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'prepare-worker.js'), [inputRoot, outputDir], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      execArgv: ['--max-old-space-size=8192'],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    let result = null
    let stderr = ''
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000) })
    child.on('message', message => {
      if (message?.type === 'progress') onFraction(message.fraction, message.message)
      else result = message
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (result?.type === 'done') resolve(result.datasetId)
      else if (result?.type === 'error') reject(new ImportError(result.message))
      else reject(new Error(`整理快照的子进程异常退出（代码 ${code}）。${stderr.trim()}`))
    })
  })
}

function stamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function defaultName(sourcePath) {
  const base = path.basename(sourcePath).replace(/\.zip$/i, '')
  if (!base || /^[0-9a-f]{16}$/i.test(base) || GENERIC_NAMES.has(base.toLowerCase())) return `城市地图 ${stamp()}`
  return base
}

async function buildEntry(stageDir, name, source) {
  const manifest = JSON.parse((await fsp.readFile(path.join(stageDir, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''))
  const id = manifest?.datasetId
  if (typeof id !== 'string' || !SNAPSHOT_ID.test(id)) throw new ImportError('manifest.json 中没有有效的快照 ID（datasetId）')
  const count = file => manifest.files?.[file]?.features ?? null
  return {
    id,
    name,
    source,
    importedAt: new Date().toISOString(),
    bytes: await dirSize(stageDir),
    stats: {
      buildings: count('Building_Boundary.json'),
      roads: count('Network_Centerline.json'),
      pois: count('POI_Location.json'),
      routes: count('Route_Centerline.json'),
    },
  }
}

async function checkPrepared(dir) {
  let manifest
  try {
    manifest = JSON.parse((await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''))
  } catch {
    throw new ImportError('manifest.json 无法读取，快照可能已损坏')
  }
  if (typeof manifest?.datasetId !== 'string' || !SNAPSHOT_ID.test(manifest.datasetId)) {
    throw new ImportError('manifest.json 中没有有效的快照 ID（datasetId）')
  }
  for (const file of REQUIRED_GEOJSON) {
    if (!await exists(path.join(dir, 'GeoJSON', file))) throw new ImportError(`快照不完整：缺少 GeoJSON/${file}`)
  }
}

/**
 * 导入一个路径（zip / 文件夹），返回导入成功的地图条目数组。
 * @param {string} sourcePath
 * @param {import('./library').Library} library
 * @param {{ onProgress?: (p: { fraction: number | null, message: string }) => void, beforeInstall?: (entry: object) => Promise<void> }} [options]
 *   beforeInstall：写入地图库之前调用（用来先关闭正在查看同一张地图的窗口）
 */
async function importPath(sourcePath, library, { onProgress = () => {}, beforeInstall = async () => {} } = {}) {
  const absolute = path.resolve(String(sourcePath))
  const info = await fsp.stat(absolute).catch(() => null)
  if (!info) throw new ImportError('找不到所选的文件或文件夹')
  const phase = (from, to) => (fraction, message) => onProgress({ fraction: from + (to - from) * fraction, message })

  let root = absolute
  let extractDir = null
  const entries = []
  try {
    if (info.isFile()) {
      if (!/\.zip$/i.test(absolute)) throw new ImportError('请选择 .zip 压缩包，或包含快照的文件夹')
      extractDir = library.newStagingDir()
      await extractZip(absolute, extractDir, phase(0, 0.6))
      root = extractDir
    }

    const found = await findSnapshots(root)
    if (!found.length) {
      throw new ImportError('没有找到地图快照。所选内容里需要有 GeoJSON 文件夹（含 Building_Boundary.json 等文件）。')
    }

    for (let index = 0; index < found.length; index += 1) {
      const { dir, kind } = found[index]
      const from = info.isFile() ? 0.6 : 0
      const span = (1 - from) / found.length
      const range = phase(from + span * index, from + span * (index + 1))
      const stage = library.newStagingDir()
      const inTemp = extractDir !== null
      try {
        if (kind === 'prepared') {
          await checkPrepared(dir)
          if (inTemp) await fsp.rename(dir, stage)
          else await copyTree(dir, stage, range)
          await ensureSubwayEntrances(stage) // 游戏导出的快照不带出入口表，这里补上（失败不影响导入）
        } else {
          await fsp.mkdir(stage, { recursive: true })
          await runPrepare(dir, stage, range)
        }
        let name = defaultName(absolute)
        if (found.length > 1) name = `${name} · ${path.basename(dir)}`
        const entry = await buildEntry(stage, name, absolute)
        // 已存在同一快照时保留用户改过的名字
        const previous = await library.get(entry.id)
        if (previous) entry.name = previous.name
        await beforeInstall(entry)
        await library.install(stage, entry)
        entries.push(entry)
      } catch (error) {
        await fsp.rm(stage, { recursive: true, force: true })
        throw error
      }
    }
    onProgress({ fraction: 1, message: '导入完成' })
    return entries
  } finally {
    if (extractDir) await fsp.rm(extractDir, { recursive: true, force: true })
  }
}

module.exports = { importPath, findSnapshots, classify, ImportError, REQUIRED_GEOJSON }
