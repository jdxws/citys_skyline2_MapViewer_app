import { GROUPS, routeKey, isSubway, validateSize } from './export-model.mjs'
import { snapshotSession, readSnapshot, renderMap, renderMetro, saveExport } from './export-renderer.mjs'

const labels = { water: '水体', parks: '公园与绿地', buildings: '建筑', roads: '道路', tracks: '铁路轨道', paths: '步道', waterways: '航道', districts: '行政区', pois: '设施图标', stops: '交通站点', labels: '文字标注' }
const modes = { Bus: '公交', Train: '火车', Tram: '有轨电车', Subway: '地铁', Ship: '船舶', Ferry: '渡轮', Airplane: '航空' }
const element = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node }
const trigger = element('button', '导出图片', 'sk-export-trigger')
trigger.type = 'button'; trigger.disabled = !window.skylensMap
window.addEventListener('skylens:map-ready', () => { trigger.disabled = false })
document.body.append(trigger)
let current = null

async function openExport() {
  if (current) return
  const dialog = element('dialog', '', 'sk-export-dialog')
  dialog.innerHTML = `
    <header><div><h2>导出地图</h2><p>方形画布 · 本地生成</p></div><button type="button" data-action="close" aria-label="关闭导出面板">×</button></header>
    <div class="sk-export-body"><form class="sk-export-options">
      <label>导出内容<select name="kind"><option value="map">城市地图</option><option value="metro">地铁线路示意图</option></select></label>
      <label>方形分辨率<select name="preset"><option>1024</option><option selected>2048</option><option>4096</option><option>8192</option><option value="custom">自定义</option></select></label>
      <label data-custom hidden>边长（像素）<input name="size" type="number" min="256" max="8192" step="1" value="2048"></label>
      <div data-map><label>导出范围<select name="extent"><option value="view">当前视野（完整包含）</option><option value="city">全城道路范围</option></select></label>
      <fieldset><legend>地图图层</legend><div class="sk-export-checks" data-groups></div></fieldset></div>
      <div data-metro hidden><label>文件格式<select name="format"><option value="png">PNG 图片</option><option value="svg">SVG 矢量图</option></select></label>
      <label>布局质量<select name="quality"><option value="standard">标准（更快）</option><option value="detailed">精细</option></select></label>
      <label>布局种子<input name="seed" type="number" min="0" max="4294967295" step="1" value="1"></label>
      <label class="sk-export-check"><input name="labels" type="checkbox" checked>显示站名</label>
      <p class="sk-export-hint">复用现有地铁示意图算法；按站名合并站点，站间距不按实际比例。此模式只绘制线路和站点。</p></div>
      <fieldset><legend>导出线路</legend><div class="sk-export-line-actions"><button type="button" data-action="all">全选</button><button type="button" data-action="none">全不选</button></div><div data-routes class="sk-export-routes">正在读取线路…</div></fieldset>
      <label class="sk-export-check"><input name="legend" type="checkbox" checked>显示线路图例</label>
      <p class="sk-export-hint">尺寸为实际输出像素。手机建议 1024 或 2048；高分辨率需要更多内存。可关闭面板调整地图后重新预览。</p>
    </form><section class="sk-export-preview" aria-label="导出预览"><div class="sk-export-empty">生成预览后，可检查图片并保存。</div><img hidden alt="即将保存的导出图片"><p data-status role="status" aria-live="polite"></p></section></div>
    <footer><button type="button" data-action="cancel" hidden>取消生成</button><button type="button" data-action="generate" class="sk-export-primary">生成预览</button><button type="button" data-action="save" disabled>保存图片…</button></footer>`
  document.body.append(dialog); current = dialog
  const form = dialog.querySelector('form'), field = name => form.elements.namedItem(name)
  const button = action => dialog.querySelector(`[data-action="${action}"]`)
  const status = dialog.querySelector('[data-status]'), img = dialog.querySelector('img')
  const message = text => { status.textContent = text }
  let result, previewUrl, controller, routes = [], saving = false, loading = true
  const clearPreview = () => { result = null; button('save').disabled = true; img.hidden = true; img.removeAttribute('src'); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; dialog.querySelector('.sk-export-empty').hidden = false }
  const busy = value => { button('generate').disabled = value || loading; button('save').disabled = value || !result; button('cancel').hidden = !value; for (const input of form.querySelectorAll('input,select,button')) input.disabled = value }
  const close = () => { if (saving) return; controller?.abort(); clearPreview(); dialog.close(); dialog.remove(); current = null; trigger.focus() }
  button('close').onclick = close
  dialog.addEventListener('cancel', event => { event.preventDefault(); close() })
  button('cancel').onclick = () => controller?.abort()
  const defaults = new Set(['water', 'parks', 'buildings', 'roads', 'tracks', 'paths', 'pois', 'labels'])
  for (const key of GROUPS) {
    const label = element('label', '', 'sk-export-check'), input = document.createElement('input')
    input.type = 'checkbox'; input.name = 'groups'; input.value = key; input.checked = defaults.has(key)
    label.append(input, document.createTextNode(labels[key])); dialog.querySelector('[data-groups]').append(label)
  }
  const renderRoutes = () => {
    const root = dialog.querySelector('[data-routes]'); root.replaceChildren()
    const shown = routes.filter(f => field('kind').value !== 'metro' || isSubway(f))
    for (const f of shown) {
      const p = f.properties, label = element('label', '', 'sk-export-check'), input = document.createElement('input')
      input.type = 'checkbox'; input.name = 'routes'; input.value = routeKey(p); input.checked = field('kind').value === 'metro'
      const swatch = element('span', '', 'sk-export-swatch'); swatch.style.backgroundColor = /^#[0-9a-f]{6}$/i.test(p.Color) ? p.Color : '#667d73'
      label.append(input, swatch, document.createTextNode(`${modes[p.Transport] || p.Transport} · ${p.Name || p.Route}`)); root.append(label)
    }
    if (!shown.length) root.textContent = field('kind').value === 'metro' ? '这份快照没有地铁线路。' : '这份快照没有可导出的线路。'
  }
  for (const action of ['all', 'none']) button(action).onclick = () => { for (const input of form.querySelectorAll('input[name="routes"]')) input.checked = action === 'all'; clearPreview() }
  form.addEventListener('submit', event => event.preventDefault())
  form.addEventListener('change', event => {
    if (event.target.name === 'kind') {
      const metro = field('kind').value === 'metro'
      dialog.querySelector('[data-map]').hidden = metro; dialog.querySelector('[data-metro]').hidden = !metro
      renderRoutes()
    }
    if (event.target.name === 'preset') {
      dialog.querySelector('[data-custom]').hidden = field('preset').value !== 'custom'
      if (field('preset').value !== 'custom') field('size').value = field('preset').value
    }
    clearPreview(); message('选项已更新，请重新生成预览。')
  })
  form.addEventListener('input', () => clearPreview())
  button('generate').onclick = async () => {
    controller = new AbortController(); clearPreview(); busy(true)
    try {
      const options = { size: validateSize(field('size').value), extent: field('extent').value, format: field('format').value,
        quality: field('quality').value, seed: Number(field('seed').value), labels: field('labels').checked, legend: field('legend').checked,
        groups: [...form.querySelectorAll('[name="groups"]:checked')].map(n => n.value), routeKeys: [...form.querySelectorAll('[name="routes"]:checked')].map(n => n.value) }
      if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 4294967295) throw new Error('布局种子须为 0–4294967295 的整数')
      result = await (field('kind').value === 'metro' ? renderMetro : renderMap)(options, { signal: controller.signal, progress: message })
      if (!dialog.isConnected) return
      previewUrl = URL.createObjectURL(result.blob); img.src = previewUrl; img.hidden = false
      dialog.querySelector('.sk-export-empty').hidden = true
      message(`${result.width} × ${result.height} · ${(result.blob.size / 1048576).toFixed(2)} MB${result.warnings.length ? '\n' + result.warnings.join('\n') : '\n预览即为将要保存的图片。'}`)
    } catch (error) { message(error.name === 'AbortError' ? '已取消生成。' : `导出失败：${error.message}`) }
    finally { controller = null; busy(false) }
  }
  button('save').onclick = async () => {
    if (!result || saving) return
    saving = true; busy(true); button('cancel').hidden = true; message('请选择保存位置…')
    try { const response = await saveExport(result, `SKYLENS-${field('kind').value}-${result.width}.${result.extension}`); message(response.canceled ? '已取消保存，可以重新选择位置。' : '图片已保存。') }
    catch (error) { message(`保存失败：${error.message}`) }
    finally { saving = false; busy(false) }
  }
  dialog.showModal(); button('generate').disabled = true
  try {
    const { root } = await snapshotSession()
    const collection = await readSnapshot(root, 'GeoJSON/Route_Centerline.json')
    const keys = new Set()
    routes = collection.features.filter(f => {
      if (!f.properties?.Transport || f.geometry?.type !== 'LineString') return false
      const key = routeKey(f.properties); if (keys.has(key)) return false; keys.add(key); return true
    })
    renderRoutes()
  } catch (error) { dialog.querySelector('[data-routes]').textContent = error.message; message('线路数据不可用，仍可导出地图底图。') }
  finally { loading = false; button('generate').disabled = false }
}
trigger.onclick = openExport
// A small reusable browser API, also used by the export integration checks.
window.skylensExport = { open: openExport, renderMap, renderMetro, save: saveExport }
