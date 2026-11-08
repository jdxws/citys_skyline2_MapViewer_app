import { exportStyle, validateSize, routeKey, squareSvg } from './export-model.mjs'

export async function snapshotSession() {
  const response = await fetch('/session.json')
  if (!response.ok) throw new Error('无法读取当前地图快照')
  const session = await response.json()
  return { ...session, root: new URL(session.dataRoot, location.href) }
}

export async function readSnapshot(root, file, signal) {
  const response = await fetch(new URL(file, root), { signal })
  if (!response.ok) throw new Error(`快照缺少 ${file}`)
  return JSON.parse((await response.text()).replace(/^\uFEFF/, ''))
}

const pngBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片编码失败，请降低分辨率')), 'image/png'))
const abortError = () => new DOMException('已取消导出', 'AbortError')

export async function renderMap(options, { signal, progress = () => {} } = {}) {
  const size = validateSize(options.size)
  const live = window.skylensMap
  if (!live || !live.isStyleLoaded()) throw new Error('请等地图加载完成后再导出')
  if (signal?.aborted) throw abortError()
  const { root } = await snapshotSession()
  const style = exportStyle(live.getStyle(), options, root)
  if (options.routeKeys.length) {
    // Read selected routes directly: transport layers may not yet have been opened in the viewer.
    const routes = await readSnapshot(root, 'GeoJSON/Route_Centerline.json', signal)
    const keys = new Set(options.routeKeys)
    const selected = { type: 'FeatureCollection', features: routes.features.filter(f => keys.has(routeKey(f.properties)) && f.geometry?.type === 'LineString') }
    style.layers = style.layers.filter(layer => !/^transport-.*-route$/.test(layer.id))
    delete style.sources.route
    style.sources['export-routes'] = { type: 'geojson', data: selected }
    style.layers.push({ id: 'export-route-lines', type: 'line', source: 'export-routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['coalesce', ['get', 'Color'], '#2876a1'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.4, 15, 6, 19, 9], 'line-opacity': .95 } })
  }
  if (!style.layers.some(layer => layer.type !== 'background')) throw new Error('请至少选择一个图层或一条线路')
  const host = document.createElement('div')
  Object.assign(host.style, { position: 'fixed', left: '-20000px', top: '0', width: `${size}px`, height: `${size}px`, pointerEvents: 'none' })
  document.body.append(host)
  let map
  try {
    progress('正在准备独立导出画布…')
    map = new live.constructor({ container: host, style, interactive: false, attributionControl: false,
      center: live.getCenter(), zoom: live.getZoom(), bearing: 0, pitch: 0, pixelRatio: 1,
      maxCanvasSize: [size, size], canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true } })
    const canvas = map.getCanvas()
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (gl && size > Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))) throw new Error('设备不支持此分辨率，请选择更小的尺寸')
    // Copy dynamically registered POI icons. styleimagemissing runs after the style is installed.
    map.on('styleimagemissing', event => {
      const image = live.getImage(event.id)
      if (image && !map.hasImage(event.id)) map.addImage(event.id, image.data, { pixelRatio: image.pixelRatio, sdf: image.sdf })
    })
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('地图渲染超时，请降低分辨率或减少图层')), 90000)
      const abort = () => finish(abortError())
      let settled = false
      const finish = error => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve() }
      signal?.addEventListener('abort', abort, { once: true })
      map.once('error', event => finish(new Error(`导出图层加载失败：${event.error?.message ?? '未知错误'}`)))
      map.once('load', async () => {
        try {
          let bounds = live.getBounds()
          if (options.extent === 'city') {
            const manifest = await readSnapshot(root, 'manifest.json', signal)
            const b = manifest.files?.['Network_Centerline.json']?.bounds
            if (!b || b.length !== 4) throw new Error('快照没有全城范围信息')
            bounds = [[b[0], b[1]], [b[2], b[3]]]
          }
          progress('正在渲染图层和线路…')
          map.fitBounds(bounds, { padding: Math.round(size * .035), duration: 0 })
          map.once('idle', () => finish())
          map.triggerRepaint()
        } catch (error) { finish(error) }
      })
    })
    if (signal?.aborted) throw abortError()
    if (canvas.width !== size || canvas.height !== size) throw new Error('设备限制了导出画布尺寸，请降低分辨率')
    // Read in the render callback so it also works with devices that discard frame buffers.
    const output = document.createElement('canvas')
    output.width = output.height = size
    const ctx = output.getContext('2d')
    await new Promise(resolve => { map.once('render', () => { ctx.drawImage(canvas, 0, 0); resolve() }); map.triggerRepaint() })
    if (options.legend && options.routeKeys.length) {
      const routes = await readSnapshot(root, 'GeoJSON/Route_Centerline.json', signal)
      const keys = new Set(options.routeKeys)
      const lines = routes.features.filter(f => keys.has(routeKey(f.properties)))
      const font = Math.max(12, Math.round(size / 110)), row = font * 1.8, maxRows = Math.floor((size * .8) / row)
      const columns = Math.max(1, Math.ceil(lines.length / maxRows)), width = Math.min(size * .9, columns * font * 20)
      ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(size * .04, size * .04, width, Math.min(maxRows, lines.length) * row + font)
      ctx.font = `${font}px "Microsoft YaHei", sans-serif`; ctx.textBaseline = 'middle'
      lines.forEach((f, index) => {
        const col = Math.floor(index / maxRows), r = index % maxRows
        const x = size * .04 + font + col * width / columns, y = size * .04 + font + r * row
        ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(f.properties.Color) ? f.properties.Color : '#006dff'
        ctx.fillRect(x, y - 2, font * 2, 4); ctx.fillStyle = '#263b35'
        ctx.fillText(f.properties.Name || String(f.properties.Route), x + font * 2.6, y, width / columns - font * 4)
      })
    }
    progress('正在编码 PNG…')
    const blob = await pngBlob(output)
    output.width = output.height = 0
    if (signal?.aborted) throw abortError()
    return { blob, mime: 'image/png', extension: 'png', width: size, height: size, warnings: [] }
  } finally { map?.remove(); host.remove() }
}

export async function renderMetro(options, { signal, progress = () => {} } = {}) {
  const size = validateSize(options.size)
  const { root } = await snapshotSession()
  const [allRoutes, pois] = await Promise.all([readSnapshot(root, 'GeoJSON/Route_Centerline.json', signal), readSnapshot(root, 'GeoJSON/POI_Location.json', signal)])
  const keys = new Set(options.routeKeys)
  const routes = { type: 'FeatureCollection', features: allRoutes.features.filter(f => f.properties?.Transport === 'Subway' && keys.has(routeKey(f.properties))) }
  if (!routes.features.length) throw new Error('请至少选择一条地铁线路')
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./metro-worker.mjs', import.meta.url), { type: 'module' })
    const finish = (error, value) => { worker.terminate(); clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value) }
    const abort = () => finish(abortError())
    const timer = setTimeout(() => finish(new Error('地铁排布超时，请减少线路或使用标准质量')), 180000)
    if (signal?.aborted) { finish(abortError()); return }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) => data.type === 'progress' ? progress(data.message) : data.type === 'result' ? finish(null, data) : finish(new Error(data.message))
    worker.onerror = event => finish(new Error(event.message || '地铁生成器启动失败'))
    worker.postMessage({ routes, pois, quality: options.quality, seed: options.seed })
  })
  const svg = squareSvg(result.svg, size, options)
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
  if (options.format === 'svg') return { blob: svgBlob, mime: 'image/svg+xml', extension: 'svg', width: size, height: size, warnings: result.warnings }
  progress('正在转换地铁 PNG…')
  const url = URL.createObjectURL(svgBlob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (signal?.aborted) throw abortError()
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
    canvas.getContext('2d').drawImage(image, 0, 0, size, size)
    const blob = await pngBlob(canvas); canvas.width = canvas.height = 0
    if (signal?.aborted) throw abortError()
    return { blob, mime: 'image/png', extension: 'png', width: size, height: size, warnings: result.warnings }
  } finally { URL.revokeObjectURL(url) }
}

export async function saveExport(result, name) {
  if (window.skylensFiles) {
    const response = await window.skylensFiles.save({ name, mime: result.mime, bytes: new Uint8Array(await result.blob.arrayBuffer()) })
    if (response.error) throw new Error(response.error)
    return response
  }
  if (window.SkylensFiles) {
    return new Promise(async (resolve, reject) => {
      const done = event => { window.removeEventListener('skylens:file-saved', done); event.detail?.error ? reject(new Error(event.detail.error)) : resolve(event.detail) }
      window.addEventListener('skylens:file-saved', done)
      try {
        if (!window.SkylensFiles.beginFile(name, result.mime)) throw new Error('另一个文件正在保存，请先完成保存')
        const bytes = new Uint8Array(await result.blob.arrayBuffer())
        for (let offset = 0; offset < bytes.length; offset += 49152) {
          const chunk = bytes.subarray(offset, offset + 49152)
          if (!window.SkylensFiles.appendFile(btoa(String.fromCharCode(...chunk)))) throw new Error('写入图片失败，可能存储空间不足')
        }
        window.SkylensFiles.finishFile()
      } catch (error) { window.SkylensFiles.cancelFile(); window.removeEventListener('skylens:file-saved', done); reject(error) }
    })
  }
  const url = URL.createObjectURL(result.blob), link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
  return { ok: true }
}
