'use strict'

const api = window.skylens
const $ = id => document.getElementById(id)
const numberFormat = new Intl.NumberFormat('zh-CN')
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

let busy = false
let toastTimer = 0

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function toast(message, isError = false) {
  const el = $('toast')
  el.textContent = message
  el.classList.toggle('error', isError)
  el.classList.remove('hidden')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.add('hidden'), isError ? 9000 : 4500)
}

// ------------------------------------------------------------ 进度浮层

function showProgress({ fraction, message }) {
  $('overlay').classList.remove('hidden')
  $('progressMessage').textContent = message ?? ''
  const fill = $('barFill')
  if (typeof fraction === 'number') {
    fill.classList.remove('indeterminate')
    fill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`
  } else {
    fill.classList.add('indeterminate')
    fill.style.width = ''
  }
}

function hideProgress() {
  $('overlay').classList.add('hidden')
  $('barFill').style.width = '0%'
}

// ------------------------------------------------------------ 地图列表

function element(tag, className, text) {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (text !== undefined) el.textContent = text
  return el
}

function statSpan(label, value) {
  if (typeof value !== 'number') return null
  const span = element('span')
  span.append(`${label} `, element('b', '', numberFormat.format(value)))
  return span
}

function button(label, className, handler) {
  const el = element('button', `btn small ${className ?? ''}`.trim(), label)
  el.type = 'button'
  el.addEventListener('click', event => { event.stopPropagation(); handler(el) })
  return el
}

function renderMap(entry) {
  const item = element('article', 'item')

  const info = element('div')
  const title = element('div', 'item-title')
  title.append(element('span', 'name', entry.name))
  if (entry.open) title.append(element('span', 'badge', '已打开'))
  info.append(title)

  const stats = element('div', 'item-stats')
  for (const node of [
    statSpan('建筑', entry.stats?.buildings), statSpan('道路', entry.stats?.roads),
    statSpan('兴趣点', entry.stats?.pois), statSpan('线路', entry.stats?.routes),
  ]) if (node) stats.append(node)
  if (stats.childElementCount) info.append(stats)

  info.append(element('div', 'item-meta',
    `${formatBytes(entry.bytes)} · 导入于 ${dateFormat.format(new Date(entry.importedAt))} · ID ${entry.id}`))

  const actions = element('div', 'item-actions')
  actions.append(
    button('打开', 'primary', async el => {
      el.disabled = true
      el.textContent = '正在打开…'
      const result = await api.open(entry.id)
      if (result.error) toast(result.error, true)
      await refresh()
    }),
    button('重命名', '', async () => {
      const name = await askName(entry.name)
      if (name === null) return
      const result = await api.rename(entry.id, name)
      if (result.error) toast(result.error, true)
      await refresh()
    }),
    button('打开文件夹', '', async () => {
      const result = await api.reveal(entry.id)
      if (result.error) toast(result.error, true)
    }),
    button('删除', 'danger', async () => {
      const result = await api.remove(entry.id)
      if (result.error) toast(result.error, true)
      await refresh()
    }),
  )

  item.append(info, actions)
  item.addEventListener('dblclick', () => api.open(entry.id).then(result => result.error ? toast(result.error, true) : refresh()))
  return item
}

async function refresh() {
  const maps = await api.list()
  const list = $('list')
  list.replaceChildren(...maps.map(renderMap))
  $('empty').classList.toggle('hidden', maps.length > 0)
  $('count').textContent = maps.length ? `${maps.length} 张` : ''
}

// ------------------------------------------------------------ 重命名

function askName(current) {
  return new Promise(resolve => {
    const dialog = $('renameDialog')
    const input = $('renameInput')
    input.value = current
    dialog.returnValue = ''
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok' ? input.value : null), { once: true })
    dialog.showModal()
    input.select()
  })
}

$('renameInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); $('renameDialog').close('ok') }
})

// ------------------------------------------------------------ 导入

async function runImport(task) {
  if (busy) return
  busy = true
  try {
    const result = await task()
    if (result?.canceled) return
    if (result?.error) toast(result.error, true)
    else if (result?.imported) {
      const names = result.imported.map(entry => `“${entry.name}”`).join('、')
      toast(`已导入 ${result.imported.length} 张地图：${names}`)
    }
  } catch (error) {
    toast(String(error?.message ?? error), true)
  } finally {
    busy = false
    hideProgress()
    await refresh()
  }
}

api.onProgress(showProgress)
api.onMenuPick(kind => runImport(() => api.pick(kind)))
$('pickFolder').addEventListener('click', () => runImport(() => api.pick('folder')))
$('pickZip').addEventListener('click', () => runImport(() => api.pick('zip')))
$('changeLibrary').addEventListener('click', async () => {
  if (busy) return
  busy = true
  showProgress({ fraction: null, message: '请选择新位置，地图文件将复制到该文件夹。' })
  try {
    const result = await api.changeLibraryLocation()
    if (result?.error) toast(result.error, true)
    else if (result?.libraryDir) {
      $('libraryDir').textContent = `地图库位置：${result.libraryDir}`
      toast('地图库已迁移。旧位置的数据仍保留，可确认新位置正常后自行清理。')
    }
  } catch (error) {
    toast(String(error?.message ?? error), true)
  } finally {
    busy = false
    hideProgress()
    await refresh()
  }
})

// 拖放：整个窗口都可以接收，落点高亮导入区域
const drop = $('drop')
let dragDepth = 0
window.addEventListener('dragenter', event => { event.preventDefault(); dragDepth += 1; drop.classList.add('over') })
window.addEventListener('dragover', event => event.preventDefault())
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.classList.remove('over') })
window.addEventListener('drop', event => {
  event.preventDefault()
  dragDepth = 0
  drop.classList.remove('over')
  const paths = Array.from(event.dataTransfer?.files ?? []).map(file => api.pathForFile(file)).filter(Boolean)
  if (!paths.length) { toast('没有读取到文件路径，请改用“选择文件夹…”按钮。', true); return }
  runImport(() => api.importPaths(paths))
})

window.addEventListener('focus', () => { if (!busy) refresh() })

api.info().then(info => { $('libraryDir').textContent = `地图库位置：${info.libraryDir}` })
refresh()
