// 给地图网页（打包后的 index-*.js）打上"道路分级 + 固定上下叠压 + 水体平滑"补丁。
//
// 用法：node scripts/patch-road-style.mjs <网页目录>
//   桌面版：node scripts/patch-road-style.mjs app
//   安卓版：node scripts/patch-road-style.mjs ../skylens-mobile-android-source/app/src/main/assets/web
//
// 可以重复运行：道路图层和辅助函数用注释标记包起来，再次运行会整块替换，所以改完下面的配色/线宽后直接重跑即可。
// 注意：它针对的是"已包含隧道/地面/高架分层和路名标注"的网页包（即你当前的版本），不适用于上游原版。
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// ======================================================================= 可调参数
const STYLE = {
  // 四个等级（数据里的 Category）：填充色 / 地面描边 / 高架描边
  classes: {
    Highway: { name: '快速路', fill: '#ffd54f', casing: '#a98a2c', elevatedCasing: '#8c7120' },
    Large: { name: '主干道', fill: '#ffe7a3', casing: '#a89560', elevatedCasing: '#8c7a4a' },
    Medium: { name: '次干道', fill: '#fff4d2', casing: '#8a928e', elevatedCasing: '#6d7773' },
    Small: { name: '支路', fill: '#fffdf6', casing: '#6f7977', elevatedCasing: '#626c68' },
  },
  tunnelCasing: '#8d9692',
  // 线宽（像素）= a + 车道数 × b。下面是你现有的数值：9 级与 18 级之间线性渐变。
  line: { a9: 0.7, b9: 0.25, a18: 2.0, b18: 1.0 },
  // true：15 级以后每放大一级线宽翻倍（和真实道路宽度保持比例，近景下道路不再是细线）；
  // false：保持你原来的 9→18 线性渐变
  physicalHighZoom: true,
  // 描边在每一侧比填充多出的像素（9 级 / 15 级 / 19 级）
  outline: { z9: 0.4, z15: 0.6, z19: 1.2 },
  elevatedExtraOutline: 0.3, // 高架描边再加粗一点
  tiers: 3, // 高架最多分几层（需要与 road-style-helpers.js 里的 MAX_TIER 一致）
  shadow: true, // 高架下方的投影（体现高度）；不想要就改成 false
}

// ======================================================================= 图层定义
const LANE = ['to-number', ['get', 'Lane'], 1]
const LEVEL = ['case', ['has', '_lv'], ['get', '_lv'], ['match', ['get', 'Form'], 'Tunnel', -1, 'Elevated', 1, 0]]
const VU_ROAD = '__VU_ROAD__' // 注入时替换成网页里已有的 vu("Road") 过滤器
const byClass = pick => ['match', ['coalesce', ['get', '_cls'], ['get', 'Category']],
  ...['Highway', 'Large', 'Medium'].flatMap(key => [key, pick(STYLE.classes[key])]), pick(STYLE.classes.Small)]
const SORT = { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['to-number', ['get', '_rank'], 0] }

function lineStops() {
  const { a9, b9, a18, b18 } = STYLE.line
  const at = z => ({ a: a9 + (a18 - a9) * (z - 9) / 9, b: b9 + (b18 - b9) * (z - 9) / 9 })
  if (!STYLE.physicalHighZoom) return [[9, at(9).a, at(9).b, 1], [18, at(18).a, at(18).b, 1]]
  const base = at(15)
  return [[9, at(9).a, at(9).b, 1], [15, base.a, base.b, 1], ...[16, 17, 18, 19].map(z => [z, base.a * 2 ** (z - 15), base.b * 2 ** (z - 15), 1])]
}

// 描边/阴影比填充多出的像素（随缩放变化）
function extra(z, perSide, add) {
  const { z9, z15, z19 } = STYLE.outline
  const v = z <= 15 ? z9 + (z15 - z9) * (z - 9) / 6 : z15 + (z19 - z15) * (z - 15) / 4
  return 2 * (v + perSide) + add
}

// 描边 / 阴影的宽度 = 填充线宽 + 两侧各 (outline + perSide) 像素 + add
function casingWidth(perSide, add) {
  const expr = ['interpolate', ['linear'], ['zoom']]
  for (const [z, a, b] of lineStops()) expr.push(z, ['+', a + extra(z, perSide, add), ['*', LANE, b]])
  return expr
}

function lineWidth() {
  const expr = ['interpolate', ['linear'], ['zoom']]
  for (const [z, a, b] of lineStops()) expr.push(z, ['+', a, ['*', LANE, b]])
  return expr
}

const fillColor = byClass(c => c.fill)
const tierFilter = level => ['all', VU_ROAD, ['==', LEVEL, level]]

function roadLayers() {
  const layers = []
  const add = (id, filter, layout, paint) => layers.push({ id, type: 'line', source: 'network', filter, layout, paint })

  add('road-tunnel-casing', tierFilter(-1), SORT, { 'line-color': STYLE.tunnelCasing, 'line-opacity': 0.65, 'line-width': casingWidth(0, 0) })
  add('road-tunnel-line', tierFilter(-1), SORT, { 'line-dasharray': [2, 1.5], 'line-color': fillColor, 'line-opacity': 0.72, 'line-width': lineWidth() })
  add('road-casing', tierFilter(0), SORT, { 'line-color': byClass(c => c.casing), 'line-width': casingWidth(0, 0) })
  add('road-line', tierFilter(0), SORT, { 'line-color': fillColor, 'line-width': lineWidth() })
  for (let tier = 1; tier <= STYLE.tiers; tier += 1) {
    const id = tier === 1 ? 'road-elevated' : `road-elevated${tier}`
    if (STYLE.shadow) {
      add(`${id}-shadow`, tierFilter(tier), SORT, {
        'line-color': '#1b2420', 'line-opacity': 0.14 + 0.05 * tier, 'line-blur': 2.5, 'line-translate': [1.2 + tier * 0.4, 1.8 + tier * 0.6],
        'line-width': casingWidth(STYLE.elevatedExtraOutline, 2),
      })
    }
    add(`${id}-casing`, tierFilter(tier), SORT, { 'line-color': byClass(c => c.elevatedCasing), 'line-width': casingWidth(STYLE.elevatedExtraOutline, 0) })
    add(`${id}-line`, tierFilter(tier), SORT, { 'line-color': fillColor, 'line-width': lineWidth() })
  }
  return layers
}

const layers = roadLayers()
const ids = layers.map(layer => layer.id)
// 方向箭头：每个层级一个箭头图层，紧贴在该层道路线的上方，这样高架会盖住下层道路的箭头，隧道里的箭头也会被地面盖住
const tierFirst = tier => ids.find(id => id.startsWith(tier === 1 ? 'road-elevated-' : `road-elevated${tier}-`))
const ARROW_TIERS = [
  { id: 'road-direction-arrows-tunnel', lv: -1, before: 'road-casing' },
  { id: 'road-direction-arrows', lv: 0, before: tierFirst(1) },
  ...Array.from({ length: STYLE.tiers }, (_, index) => ({
    id: `road-direction-arrows-${index + 1}`, lv: index + 1,
    before: index + 1 < STYLE.tiers ? tierFirst(index + 2) : 'road-name-label',
  })),
]
const ALL_ROAD_LAYERS = [...ids, 'road-name-label', ...ARROW_TIERS.map(tier => tier.id)]
const PICK_LAYERS = ids.filter(id => id.endsWith('-line'))
const HD_HIDE = ids.filter(id => !id.startsWith('road-tunnel'))

// ======================================================================= 补丁
const MARK = {
  styleBegin: '/*skylens-road-style:begin*/', styleEnd: '/*skylens-road-style:end*/',
  helpersBegin: '/*skylens-road-helpers:begin*/', helpersEnd: '/*skylens-road-helpers:end*/',
  hdBegin: '/*skylens-road-hd:begin*/', hdEnd: '/*skylens-road-hd:end*/',
}

function occurrences(source, text) {
  let count = 0
  for (let at = source.indexOf(text); at >= 0; at = source.indexOf(text, at + text.length)) count += 1
  return count
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after) && !source.includes(before)) return source // 已经打过补丁
  const n = occurrences(source, before)
  if (n !== 1) throw new Error(`补丁点“${label}”应当恰好出现 1 次，实际 ${n} 次——网页包可能不是预期的版本`)
  return source.replace(before, () => after)
}

function replaceAll(source, before, after, expected, label) {
  const n = occurrences(source, before)
  if (n === 0 && occurrences(source, after) >= expected) return source
  if (n !== expected) throw new Error(`补丁点“${label}”应当出现 ${expected} 次，实际 ${n} 次`)
  return source.split(before).join(after)
}

// 匹配“当前的图层列表”并整体替换：不管上一次（或你手工）把列表改成了什么，都能再次更新
function replaceRegex(source, pattern, replacement, expected, label) {
  const n = (source.match(pattern) || []).length
  if (n !== expected) throw new Error(`补丁点“${label}”应当出现 ${expected} 次，实际 ${n} 次——网页包可能不是预期的版本`)
  return source.replace(pattern, () => replacement)
}

function replaceBlock(source, begin, end, startAnchor, endAnchor, block, label) {
  const wrapped = `${begin}${block}${end}`
  const b = source.indexOf(begin)
  if (b >= 0) {
    const e = source.indexOf(end, b)
    if (e < 0) throw new Error(`“${label}”的结束标记丢失`)
    return source.slice(0, b) + wrapped + source.slice(e + end.length)
  }
  const s = source.indexOf(startAnchor)
  const t = endAnchor ? source.indexOf(endAnchor, s) : s
  if (s < 0 || t < 0 || occurrences(source, startAnchor) !== 1) throw new Error(`找不到“${label}”的替换位置`)
  return source.slice(0, s) + wrapped + source.slice(endAnchor ? t : s)
}

export async function patchRoadStyle(appRoot) {
  const assets = path.join(appRoot, 'assets')
  const bundles = (await readdir(assets)).filter(name => /^index-.*\.js$/.test(name))
  if (bundles.length !== 1) throw new Error(`在 ${assets} 里应当恰好有 1 个 index-*.js`)
  const file = path.join(assets, bundles[0])
  let source = await readFile(file, 'utf8')

  // 1) 辅助函数（分层算法、水体平滑）
  const helpers = (await readFile(path.join(here, 'road-style-helpers.js'), 'utf8')).replace(/^\s*\/\/.*\n/gm, '')
  source = replaceBlock(source, MARK.helpersBegin, MARK.helpersEnd, 'function S6(e,t){t.District&&', null, helpers, '辅助函数')

  // 2) 道路图层：从“隧道描边”到“路名标注”之前整块替换
  const layerCode = JSON.stringify(layers).replaceAll('"__VU_ROAD__"', 'vu("Road")')
  source = replaceBlock(
    source, MARK.styleBegin, MARK.styleEnd,
    'e.addLayer({id:"road-tunnel-casing"', 'e.addLayer({id:"road-name-label"',
    `(${layerCode}).forEach(__l=>e.addLayer(__l)),`, '道路图层',
  )

  // 3) 数据加载后给道路写入层级/等级
  source = replaceOnce(source, 'w.addSource("network",{type:"geojson",data:a})', 'w.addSource("network",{type:"geojson",data:skylensRoadTiers(a)})', '道路数据源')

  // 4) 图层开关里的“道路”要控制全部道路图层（含高架、隧道、路名、方向箭头）
  source = replaceRegex(
    source, /layers:\[(?:"road-[a-z0-9-]+",?)+\],defaultVisible:!0,color:"#6f7977"/g,
    `layers:${JSON.stringify(ALL_ROAD_LAYERS)},defaultVisible:!0,color:"#6f7977"`, 1, '图层开关',
  )

  // 5) 点选 / 悬停要覆盖高架和隧道（图层顺序即命中优先级，上层先命中）
  source = replaceRegex(
    source, /layers:\[(?:"road-(?:tunnel-|elevated\d?-)?line",?)+\]/g,
    `layers:${JSON.stringify([...PICK_LAYERS].reverse())}`, 2, '点选/悬停',
  )

  // 6) “高精度道路”模式要隐藏全部中心线图层
  source = replaceRegex(
    source, /for\(const F of\s*\[(?:"road-[a-z0-9-]+",?)+\]\)/g,
    `for(const F of ${JSON.stringify(HD_HIDE)})`, 1, '高精度模式',
  )

  // 7) 水体图加载后做平滑，失败则回退原图
  source = replaceOnce(source, 'f.onload=()=>u(f),f.onerror=', 'f.onload=()=>skylensSmoothWater(f).then(u,()=>u(f)),f.onerror=', '水体平滑')

  // 8) “高精度道路”的多边形路面也使用四级配色（Large / Medium 只会出现在道路上，包括带自行车道的复合值）
  const hdColors = `["in","Large",["get","Category"]],${JSON.stringify(STYLE.classes.Large.fill)},["in","Medium",["get","Category"]],${JSON.stringify(STYLE.classes.Medium.fill)},`
  source = replaceBlock(source, MARK.hdBegin, MARK.hdEnd, '["in","Train",["get","Category"]],"#c9b4cf"', null, hdColors, '高精度配色')

  // 9) 方向箭头按层级绘制：给每个箭头记录所在层级，并为每个层级各建一个箭头图层
  source = replaceOnce(source, 'properties:{bearing:sample.bearing,direction}', 'properties:{bearing:sample.bearing,direction,lv:properties._lv??0}', '箭头层级属性')
  const arrowBegin = '/*skylens-road-arrows:begin*/'
  const arrowEnd = '/*skylens-road-arrows:end*/'
  const original = /e\.addLayer\(\{\s*id:"road-direction-arrows",\s*type:"symbol",\s*source:"road-direction-arrows",([\s\S]*?)\},"road-name-label"\);/
  const previous = new RegExp(`${arrowBegin.replace(/[*/]/g, '\\$&')}[\\s\\S]*?filter:\\["==",\\["get","lv"\\],__a\\.lv\\],([\\s\\S]*?)\\},__a\\.before\\);${arrowEnd.replace(/[*/]/g, '\\$&')}`)
  const spec = (source.match(previous) || source.match(original) || [])[1]
  if (!spec) throw new Error('找不到方向箭头图层的定义（installRoadDirectionArrows）——网页包可能不是预期的版本')
  const arrowCode = `${arrowBegin}for(const __a of ${JSON.stringify(ARROW_TIERS)})e.addLayer({id:__a.id,type:"symbol",source:"road-direction-arrows",filter:["==",["get","lv"],__a.lv],${spec}},__a.before);${arrowEnd}`
  source = source.includes(arrowBegin)
    ? source.replace(previous, () => arrowCode)
    : source.replace(original, () => arrowCode)

  await writeFile(file, source)
  return { file, layers: ids.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  if (!process.argv[2]) throw new Error('用法：node scripts/patch-road-style.mjs <网页目录>')
  const result = await patchRoadStyle(path.resolve(process.argv[2]))
  console.log(`已更新 ${result.file}（${result.layers} 个道路图层）`)
}
