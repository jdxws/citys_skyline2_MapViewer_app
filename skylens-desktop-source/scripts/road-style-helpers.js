// 这段代码会被 patch-road-style.mjs 原样注入到地图网页的打包文件里（浏览器环境），
// 同时也被 test/road-style.test.js 直接加载测试。只能使用普通函数声明，不能用 import/export。

const SKYLENS_ROAD_RANK = { Small: 0, Medium: 1, Large: 2, Highway: 3 }

/**
 * 给每条道路写入两个仅供绘制使用的属性：
 *   _lv    上下层级：-1 隧道，0 地面，1/2/3 高架（数字越大越在上面）
 *   _cls   道路等级名：Highway / Large / Medium / Small
 *   _rank  道路等级序号：0 支路 … 3 快速路（同层内等级高的画在上面）
 *
 * 原理：高架路之间的"谁压着谁"由交叉处的高程差决定。道路坐标自带高程（[经度, 纬度, 高程]），
 * 在两条道路的线段真正交叉（不是在路口节点相接）且高差 ≥ 3 米的地方，高的一条必须画在上面。
 * 在一份真实城市数据上验证过：高架与地面交叉的 226 处全部与 Form 字段一致，多层立交共需 3 层。
 * 任何一步出错都会退回到只按 Form 分层（0/1/-1），不会影响地图显示。
 */
function skylensRoadTiers(collection) {
  const features = collection && collection.features
  if (!Array.isArray(features)) return collection
  const elevated = []
  for (const feature of features) {
    const p = feature && feature.properties
    if (!p) continue
    const types = Array.isArray(p._objectTypes) ? p._objectTypes : String(p.Object == null ? '' : p.Object).split(',').map(s => s.trim())
    if (!types.includes('Road')) continue
    p._lv = p.Form === 'Tunnel' ? -1 : p.Form === 'Elevated' ? 1 : 0
    // Category 可能是 "Medium, Bicycle" 这种带自行车道的复合值，取第一个词作为道路等级
    const first = String(p.Category == null ? '' : p.Category).split(',')[0].trim()
    p._cls = Object.prototype.hasOwnProperty.call(SKYLENS_ROAD_RANK, first) ? first : 'Small'
    p._rank = SKYLENS_ROAD_RANK[p._cls]
    if (p._lv === 1 && feature.geometry && feature.geometry.type === 'LineString' && feature.geometry.coordinates.length > 1) {
      elevated.push(feature)
    }
  }
  if (elevated.length < 2) return collection

  try {
    const MAX_TIER = 3 // 最多区分 3 层高架
    const MIN_DZ = 3 // 交叉处高差小于 3 米视为同一高度（数据里 2–4 米之间没有样本）
    const CELL = 60 // 空间网格边长（米）
    const EPS = 1e-6

    let latSum = 0
    for (const f of elevated) latSum += f.geometry.coordinates[0][1]
    const kx = 111320 * Math.cos((latSum / elevated.length) * Math.PI / 180)
    const ky = 110574
    const lines = elevated.map(f => f.geometry.coordinates.map(c => [c[0] * kx, c[1] * ky, c.length > 2 ? c[2] : 0]))

    const grid = new Map()
    for (let li = 0; li < lines.length; li += 1) {
      const pts = lines[li]
      for (let si = 0; si < pts.length - 1; si += 1) {
        const a = pts[si]
        const b = pts[si + 1]
        const x0 = Math.floor(Math.min(a[0], b[0]) / CELL)
        const x1 = Math.floor(Math.max(a[0], b[0]) / CELL)
        const y0 = Math.floor(Math.min(a[1], b[1]) / CELL)
        const y1 = Math.floor(Math.max(a[1], b[1]) / CELL)
        for (let cx = x0; cx <= x1; cx += 1) {
          for (let cy = y0; cy <= y1; cy += 1) {
            const key = cx + ',' + cy
            let cell = grid.get(key)
            if (!cell) { cell = []; grid.set(key, cell) }
            cell.push(li, si)
          }
        }
      }
    }

    const constraints = new Map() // "低*N+高" → [低, 高]
    const count = lines.length
    for (const cell of grid.values()) {
      for (let i = 0; i < cell.length; i += 2) {
        for (let j = i + 2; j < cell.length; j += 2) {
          const la = cell[i]
          const lb = cell[j]
          if (la === lb) continue
          const a = lines[la][cell[i + 1]]
          const b = lines[la][cell[i + 1] + 1]
          const c = lines[lb][cell[j + 1]]
          const d = lines[lb][cell[j + 1] + 1]
          const rx = b[0] - a[0]
          const ry = b[1] - a[1]
          const sx = d[0] - c[0]
          const sy = d[1] - c[1]
          const den = rx * sy - ry * sx
          if (Math.abs(den) < 1e-9) continue
          const qx = c[0] - a[0]
          const qy = c[1] - a[1]
          const t = (qx * sy - qy * sx) / den
          const u = (qx * ry - qy * rx) / den
          // 只看真正的交叉；落在线段端点上的是路口/连接，不算
          if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) continue
          const dz = (a[2] + (b[2] - a[2]) * t) - (c[2] + (d[2] - c[2]) * u)
          if (Math.abs(dz) < MIN_DZ) continue
          const lower = dz > 0 ? lb : la
          const upper = dz > 0 ? la : lb
          constraints.set(lower * count + upper, [lower, upper])
        }
      }
    }

    // 迭代：上面的路至少比下面的路高一层（有上限，所以即使出现环也一定会结束）
    const list = Array.from(constraints.values())
    for (let pass = 0; pass < 8; pass += 1) {
      let changed = false
      for (const pair of list) {
        const need = Math.min(MAX_TIER, elevated[pair[0]].properties._lv + 1)
        if (elevated[pair[1]].properties._lv < need) {
          elevated[pair[1]].properties._lv = need
          changed = true
        }
      }
      if (!changed) break
    }
  } catch (error) {
    // 保持按 Form 的基础分层
  }
  return collection
}

/**
 * 让水体边缘更平滑：游戏导出的水体遮罩是约 7 米一个像素的二值图，放大后岸线呈长长的台阶。
 * 做法：先在原分辨率上做 2 像素的高斯模糊（把长台阶抹成斜线），再用浏览器自带的双线性插值放大约 2 倍，
 * 最后对透明度做 smoothstep 取等值线（边缘重新变得清晰且带抗锯齿）。
 * 对比过 1.5 / 2.5 / 3.5 像素：1.5 仍有轻微起伏，3.5 开始变糊且窄水带变细，所以取 2。
 *
 * 取等值线这一步优先用 SVG 滤镜（feComponentTransfer）在画布上直接完成，不需要把 64 MB 的像素读回 JS
 * （读回在软件渲染下要几秒）；浏览器不支持时回退到逐像素循环。
 * 返回一个 canvas（地图的图片源可直接使用）。失败时由调用方回退到原图。
 */
function skylensSmoothWater(image) {
  return new Promise((resolve, reject) => {
    try {
      const w = image.naturalWidth
      const h = image.naturalHeight
      if (!w || !h) { reject(new Error('empty water image')); return }
      const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent || '')
      const budget = mobile ? 9.5e6 : 16.8e6 // 输出像素预算，避免手机上占用过多显存
      const k = Math.min(2, Math.sqrt(budget / (w * h)))
      if (k < 1.25) { resolve(image); return }
      const BLUR = 2 // 模糊半径（原图像素）
      const LO = 0.45 // 透明度从 LO 到 LO+SPAN 之间平滑过渡成 0→1
      const SPAN = 0.1

      // 1) 原分辨率模糊
      const blurred = document.createElement('canvas')
      blurred.width = w
      blurred.height = h
      const bctx = blurred.getContext('2d')
      bctx.filter = 'blur(' + BLUR + 'px)'
      bctx.drawImage(image, 0, 0)
      bctx.filter = 'none'

      // 2) 双线性放大
      const W = Math.round(w * k)
      const H = Math.round(h * k)
      const scaled = document.createElement('canvas')
      scaled.width = W
      scaled.height = H
      const sctx = scaled.getContext('2d')
      sctx.imageSmoothingEnabled = true
      sctx.imageSmoothingQuality = 'high'
      sctx.drawImage(blurred, 0, 0, W, H)

      // 3) 对透明度取等值线：先试 SVG 滤镜，自检通过才使用
      const table = []
      for (let i = 0; i < 256; i += 1) {
        const x = Math.min(1, Math.max(0, (i / 255 - LO) / SPAN))
        table.push((x * x * (3 - 2 * x)).toFixed(4))
      }
      const filterId = 'skylens-water-threshold'
      if (!document.getElementById(filterId)) {
        const ns = 'http://www.w3.org/2000/svg'
        const svg = document.createElementNS(ns, 'svg')
        svg.setAttribute('width', '0')
        svg.setAttribute('height', '0')
        svg.setAttribute('aria-hidden', 'true')
        svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
        const filter = document.createElementNS(ns, 'filter')
        filter.setAttribute('id', filterId)
        filter.setAttribute('color-interpolation-filters', 'sRGB')
        const transfer = document.createElementNS(ns, 'feComponentTransfer')
        const func = document.createElementNS(ns, 'feFuncA')
        func.setAttribute('type', 'table')
        func.setAttribute('tableValues', table.join(' '))
        transfer.appendChild(func)
        filter.appendChild(transfer)
        svg.appendChild(filter)
        document.body.appendChild(svg)
      }
      let filtered = null
      try {
        const probe = document.createElement('canvas')
        probe.width = 1
        probe.height = 1
        const pctx = probe.getContext('2d', { willReadFrequently: true })
        pctx.fillStyle = 'rgba(166,208,221,0.3)' // 低于 LO，滤镜生效的话透明度应变成 0
        pctx.fillRect(0, 0, 1, 1)
        const check = document.createElement('canvas')
        check.width = 1
        check.height = 1
        const cctx = check.getContext('2d', { willReadFrequently: true })
        cctx.filter = 'url(#' + filterId + ')'
        cctx.drawImage(probe, 0, 0)
        if (cctx.getImageData(0, 0, 1, 1).data[3] < 20) {
          filtered = document.createElement('canvas')
          filtered.width = W
          filtered.height = H
          const fctx = filtered.getContext('2d')
          fctx.filter = 'url(#' + filterId + ')'
          fctx.drawImage(scaled, 0, 0)
          fctx.filter = 'none'
        }
      } catch (error) {
        filtered = null
      }
      if (filtered) { resolve(filtered); return }

      // 回退：逐像素循环（需要读回像素，较慢）
      const pixels = sctx.getImageData(0, 0, W, H)
      const data = pixels.data
      const lut = new Uint8ClampedArray(256)
      for (let i = 0; i < 256; i += 1) lut[i] = Math.round(255 * Number(table[i]))
      for (let i = 3; i < data.length; i += 4) data[i] = lut[data[i]]
      sctx.putImageData(pixels, 0, 0)
      resolve(scaled)
    } catch (error) {
      reject(error)
    }
  })
}
