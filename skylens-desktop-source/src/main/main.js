'use strict'
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron')
const fsp = require('node:fs').promises
const path = require('node:path')
const { Library } = require('../core/library')
const { importPath } = require('../core/importer')
const { createMapServer, SNAPSHOT_ID } = require('../core/server')
const { ensureSubwayEntrances } = require('../core/subway-entrances')

// 几十万个要素的 GeoJSON 需要较大的 JS 堆
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192')

const ROOT = path.join(__dirname, '..', '..')
const APP_DIR = path.join(ROOT, 'app')
const ICON = path.join(ROOT, 'assets', 'icon.png')
const UPSTREAM = 'https://github.com/ganjanggejang/skylens-maps'

/** @type {Library} */
let library
/** @type {BrowserWindow | null} */
let libraryWindow = null
/** @type {Map<string, { win: BrowserWindow, server: Awaited<ReturnType<typeof createMapServer>> }>} */
const mapWindows = new Map()
let importing = false
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showLibraryWindow())
  app.whenReady().then(start).catch(error => {
    dialog.showErrorBox('SKYLENS Desktop 启动失败', String(error?.stack ?? error))
    app.quit()
  })
  app.on('window-all-closed', () => app.quit())
}

async function start() {
  const defaultLibraryDir = path.join(app.getPath('userData'), 'library')
  let settings = {}
  try { settings = JSON.parse(await fsp.readFile(settingsFile(), 'utf8')) } catch { /* 首次启动 */ }
  library = new Library(typeof settings.libraryDir === 'string' ? settings.libraryDir : defaultLibraryDir)
  await library.init()
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  registerIpc()
  Menu.setApplicationMenu(buildMenu())
  showLibraryWindow()
}

// ---------------------------------------------------------------- 窗口

function lockNavigation(contents, allowedOrigin) {
  const external = url => { if (/^https?:\/\//i.test(url)) shell.openExternal(url) }
  contents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' } })
  contents.on('will-navigate', (event, url) => {
    if (allowedOrigin ? new URL(url).origin === allowedOrigin : url.startsWith('file://')) return
    event.preventDefault()
    external(url)
  })
}

function showLibraryWindow() {
  if (libraryWindow && !libraryWindow.isDestroyed()) {
    if (libraryWindow.isMinimized()) libraryWindow.restore()
    libraryWindow.show()
    libraryWindow.focus()
    return libraryWindow
  }
  libraryWindow = new BrowserWindow({
    width: 980,
    height: 740,
    minWidth: 760,
    minHeight: 560,
    title: 'SKYLENS Desktop',
    backgroundColor: '#0e1620',
    icon: ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  lockNavigation(libraryWindow.webContents, null)
  libraryWindow.once('ready-to-show', () => libraryWindow?.show())
  libraryWindow.on('closed', () => { libraryWindow = null })
  libraryWindow.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'))
  return libraryWindow
}

async function closeMapWindow(id) {
  const open = mapWindows.get(id)
  if (!open) return
  mapWindows.delete(id)
  if (!open.win.isDestroyed()) {
    open.win.removeAllListeners('closed')
    open.win.destroy()
  }
  await open.server.close()
  // 给 Windows 一点时间释放文件句柄
  await new Promise(resolve => setTimeout(resolve, 300))
}

async function openMap(id) {
  if (!SNAPSHOT_ID.test(id)) throw new Error('无效的地图 ID')
  const existing = mapWindows.get(id)
  if (existing && !existing.win.isDestroyed()) {
    if (existing.win.isMinimized()) existing.win.restore()
    existing.win.focus()
    return
  }
  const entry = await library.get(id)
  if (!entry) throw new Error('找不到这张地图，可能已被删除')

  await ensureSubwayEntrances(library.dataDir(id)) // 旧版本导入的地图没有出入口表，首次打开时补上
  const server = await createMapServer({ appDir: APP_DIR, dataDir: library.dataDir(id) })
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 560,
    title: `${entry.name} - SKYLENS Desktop`,
    backgroundColor: '#e9ece8',
    icon: ICON,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'map-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  mapWindows.set(id, { win, server })
  lockNavigation(win.webContents, server.origin)
  win.on('page-title-updated', event => event.preventDefault())
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mapWindows.get(id)?.win === win) mapWindows.delete(id)
    server.close()
  })
  try {
    await win.loadURL(server.url)
  } catch (error) {
    await closeMapWindow(id)
    throw new Error(`地图页面加载失败：${error.message}`)
  }
}

// ---------------------------------------------------------------- 菜单

function buildMenu() {
  const sendToLibrary = kind => {
    const win = showLibraryWindow()
    const send = () => win.webContents.send('menu:pick', kind)
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
    else send()
  }
  return Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '返回地图库', accelerator: 'CmdOrCtrl+L', click: () => showLibraryWindow() },
        { type: 'separator' },
        { label: '导入文件夹…', accelerator: 'CmdOrCtrl+O', click: () => sendToLibrary('folder') },
        { label: '导入 ZIP…', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendToLibrary('zip') },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
        { label: '开发者工具', role: 'toggleDevTools' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '上游项目 SKYLENS MAPS', click: () => shell.openExternal(UPSTREAM) },
        { label: '关于', click: showAbout },
      ],
    },
  ])
}

function showAbout() {
  dialog.showMessageBox({
    type: 'info',
    title: '关于 SKYLENS Desktop',
    message: `SKYLENS Desktop ${app.getVersion()}`,
    detail: [
      '离线查看《城市：天际线 2》SKYLENS MAPS 导出的城市地图快照。',
      '',
      `内置的地图网页来自 SKYLENS MAPS（GPL-3.0-only）：${UPSTREAM}`,
      '本程序同样以 GPL-3.0-only 发布，第三方组件的许可见 THIRD_PARTY_NOTICES.txt。',
      '',
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
      `地图库位置：${library.baseDir}`,
    ].join('\n'),
    icon: undefined,
  })
}

// ---------------------------------------------------------------- IPC

function failure(error) {
  return { error: error instanceof Error ? error.message : String(error) }
}

function assertId(id) {
  if (typeof id !== 'string' || !SNAPSHOT_ID.test(id)) throw new Error('无效的地图 ID')
}

async function runImport(sender, paths) {
  if (importing) return { error: '正在导入另一张地图，请等它完成。' }
  if (!Array.isArray(paths) || !paths.length || !paths.every(item => typeof item === 'string' && item)) {
    return { error: '没有收到可导入的文件。' }
  }
  importing = true
  try {
    const imported = []
    for (const source of paths) {
      imported.push(...await importPath(source, library, {
        onProgress: progress => { if (!sender.isDestroyed()) sender.send('import:progress', progress) },
        beforeInstall: entry => closeMapWindow(entry.id),
      }))
    }
    return { imported }
  } catch (error) {
    return failure(error)
  } finally {
    importing = false
  }
}

function registerIpc() {
  ipcMain.handle('map:save-export', async (event, payload) => {
    const open = [...mapWindows.values()].find(item => item.win.webContents === event.sender)
    if (!open || event.senderFrame?.url !== `${open.server.origin}/`) return { error: '请从地图窗口导出图片' }
    try {
      const extensions = { 'image/png': 'png', 'image/svg+xml': 'svg' }
      const extension = extensions[payload?.mime]
      if (!extension || !(payload.bytes instanceof Uint8Array) || !payload.bytes.length || payload.bytes.length > 128 * 1024 * 1024) throw new Error('无效的导出图片或文件过大')
      const name = path.basename(String(payload.name || `SKYLENS.${extension}`)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      const result = await dialog.showSaveDialog(open.win, { title: '保存导出图片', defaultPath: name,
        filters: [{ name: extension === 'png' ? 'PNG 图片' : 'SVG 矢量图', extensions: [extension] }] })
      if (result.canceled || !result.filePath) return { canceled: true }
      await fsp.writeFile(result.filePath, payload.bytes)
      return { ok: true }
    } catch (error) { return failure(error) }
  })
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), libraryDir: library.baseDir }))
  ipcMain.handle('library:change-location', async event => {
    if (importing) return { error: '地图导入期间不能迁移地图库，请等导入完成后重试。' }
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(parent, {
      title: '选择新的地图库文件夹（请使用空文件夹）',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return { canceled: true }
    try {
      for (const id of [...mapWindows.keys()]) await closeMapWindow(id)
      const next = await library.copyTo(result.filePaths[0])
      const settings = { libraryDir: next.baseDir }
      const temporary = `${settingsFile()}.tmp`
      await fsp.writeFile(temporary, JSON.stringify(settings, null, 2))
      await fsp.rename(temporary, settingsFile())
      library = next
      return { libraryDir: library.baseDir }
    } catch (error) { return failure(error) }
  })
  ipcMain.handle('library:list', async () => {
    const maps = await library.list()
    return maps.map(entry => ({ ...entry, open: mapWindows.has(entry.id) }))
  })
  ipcMain.handle('library:open', async (_event, id) => {
    try { assertId(id); await openMap(id); return { ok: true } } catch (error) { return failure(error) }
  })
  ipcMain.handle('library:rename', async (_event, id, name) => {
    try { assertId(id); return { entry: await library.rename(id, String(name)) } } catch (error) { return failure(error) }
  })
  ipcMain.handle('library:reveal', async (_event, id) => {
    try { assertId(id); const message = await shell.openPath(library.dataDir(id)); return message ? { error: message } : { ok: true } } catch (error) { return failure(error) }
  })
  ipcMain.handle('library:remove', async (event, id) => {
    try {
      assertId(id)
      const entry = await library.get(id)
      if (!entry) return { ok: true }
      const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const { response } = await dialog.showMessageBox(parent, {
        type: 'warning',
        buttons: ['删除', '取消'],
        defaultId: 1,
        cancelId: 1,
        title: '删除地图',
        message: `删除“${entry.name}”？`,
        detail: '只会删除导入到本程序里的副本，不会动你原来的文件。',
      })
      if (response !== 0) return { canceled: true }
      await closeMapWindow(id)
      await library.remove(id)
      return { ok: true }
    } catch (error) { return failure(error) }
  })
  ipcMain.handle('import:pick', async (event, kind) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const isZip = kind === 'zip'
    const result = await dialog.showOpenDialog(parent, {
      title: isZip ? '选择地图快照 ZIP' : '选择地图快照文件夹（exported_files、dist 或快照目录）',
      properties: isZip ? ['openFile'] : ['openDirectory'],
      filters: isZip ? [{ name: 'ZIP 压缩包', extensions: ['zip'] }] : undefined,
    })
    if (result.canceled || !result.filePaths.length) return { canceled: true }
    return runImport(event.sender, result.filePaths)
  })
  ipcMain.handle('import:paths', (event, paths) => runImport(event.sender, paths))
}
