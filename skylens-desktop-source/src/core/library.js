'use strict'
// 地图库：把导入过的快照保存在应用数据目录里，并维护一份 library.json 索引。
const fsp = require('node:fs').promises
const path = require('node:path')
const crypto = require('node:crypto')
const { SNAPSHOT_ID } = require('./server')

class Library {
  constructor(baseDir) {
    this.baseDir = path.resolve(baseDir)
    this.mapsDir = path.join(this.baseDir, 'maps')
    this.stagingDir = path.join(this.baseDir, 'staging')
    this.indexFile = path.join(this.baseDir, 'library.json')
    this._queue = Promise.resolve()
  }

  async init() {
    await fsp.mkdir(this.mapsDir, { recursive: true })
    // 清理上次异常退出时遗留的临时目录
    await fsp.rm(this.stagingDir, { recursive: true, force: true })
    await fsp.mkdir(this.stagingDir, { recursive: true })
  }

  newStagingDir() {
    return path.join(this.stagingDir, crypto.randomBytes(6).toString('hex'))
  }

  dataDir(id) {
    if (!SNAPSHOT_ID.test(id)) throw new Error('无效的地图 ID')
    return path.join(this.mapsDir, id)
  }

  // 所有对 library.json 的修改串行执行，避免并发覆盖
  _locked(task) {
    const run = this._queue.then(task, task)
    this._queue = run.catch(() => {})
    return run
  }

  async _read() {
    try {
      const data = JSON.parse(await fsp.readFile(this.indexFile, 'utf8'))
      return Array.isArray(data?.maps) ? data.maps : []
    } catch {
      return []
    }
  }

  async _write(maps) {
    const tmp = `${this.indexFile}.tmp`
    await fsp.writeFile(tmp, JSON.stringify({ version: 1, maps }, null, 2))
    await fsp.rename(tmp, this.indexFile)
  }

  async list() {
    const maps = await this._read()
    const present = []
    for (const entry of maps) {
      if (!SNAPSHOT_ID.test(entry?.id ?? '')) continue
      const ok = await fsp.stat(path.join(this.mapsDir, entry.id, 'manifest.json')).then(() => true, () => false)
      if (ok) present.push(entry)
    }
    return present.sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))
  }

  async get(id) {
    return (await this.list()).find(entry => entry.id === id) ?? null
  }

  /** 把已经准备好的快照目录放入地图库（同一个 ID 会被替换）。 */
  install(stageDir, entry) {
    return this._locked(async () => {
      const target = this.dataDir(entry.id)
      const backup = path.join(this.mapsDir, `${entry.id}.previous-${crypto.randomBytes(4).toString('hex')}`)
      const renameWithRetry = async (from, to) => {
        let lastError
        for (let attempt = 0; attempt < 8; attempt += 1) {
          try { await fsp.rename(from, to); return } catch (error) {
            lastError = error
            if (!['EPERM', 'EACCES', 'EBUSY'].includes(error?.code) || attempt === 7) throw error
            await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
          }
        }
        throw lastError
      }
      const targetExists = await fsp.stat(target).then(() => true, () => false)
      if (targetExists) await renameWithRetry(target, backup)
      try {
        await renameWithRetry(stageDir, target)
      } catch (renameError) {
        try {
          await fsp.cp(stageDir, target, { recursive: true, errorOnExist: true, force: false })
          await fsp.rm(stageDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
        } catch (copyError) {
          await fsp.rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }).catch(() => {})
          if (targetExists) await renameWithRetry(backup, target).catch(() => {})
          throw new Error(`无法安装地图目录。重命名失败：${renameError.message}；复制失败：${copyError.message}`)
        }
      }
      if (targetExists) await fsp.rm(backup, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }).catch(() => {})
      const maps = (await this._read()).filter(item => item.id !== entry.id)
      maps.push(entry)
      await this._write(maps)
      return entry
    })
  }

  rename(id, name) {
    return this._locked(async () => {
      const clean = String(name ?? '').trim().slice(0, 80)
      if (!clean) throw new Error('名称不能为空')
      const maps = await this._read()
      const entry = maps.find(item => item.id === id)
      if (!entry) throw new Error('找不到这张地图')
      entry.name = clean
      await this._write(maps)
      return entry
    })
  }

  remove(id) {
    return this._locked(async () => {
      const target = this.dataDir(id)
      await fsp.rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
      await this._write((await this._read()).filter(item => item.id !== id))
    })
  }

  async copyTo(nextDir) {
    const destination = path.resolve(nextDir)
    if (destination === this.baseDir) return this
    const relativeForward = path.relative(this.baseDir, destination)
    const relativeBackward = path.relative(destination, this.baseDir)
    const isNested = relative => !path.isAbsolute(relative) && relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    if (isNested(relativeForward) || isNested(relativeBackward)) {
      throw new Error('新地图库不能位于当前地图库内部，也不能包含当前地图库')
    }
    await fsp.mkdir(destination, { recursive: true })
    const existing = await fsp.readdir(destination)
    if (existing.length) throw new Error('请选择一个空文件夹作为新地图库位置')
    try {
      const mapsSource = this.mapsDir
      const mapsTarget = path.join(destination, 'maps')
      if (await fsp.stat(mapsSource).then(() => true, () => false)) {
        await fsp.cp(mapsSource, mapsTarget, { recursive: true, errorOnExist: true, force: false })
      }
      if (await fsp.stat(this.indexFile).then(() => true, () => false)) {
        await fsp.copyFile(this.indexFile, path.join(destination, 'library.json'))
      }
      const next = new Library(destination)
      await next.init()
      const oldMaps = await this.list()
      const newMaps = await next.list()
      if (newMaps.length !== oldMaps.length) throw new Error('新位置中的地图校验失败')
      return next
    } catch (error) {
      await fsp.rm(destination, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }
}

module.exports = { Library }
