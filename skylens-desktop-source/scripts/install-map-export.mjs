// Install the shared, offline export UI in both clients; run again after replacing web assets.
import { readFile, writeFile, readdir, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function browserMetroSource(source) {
  const start = source.indexOf('// ======================================================================= 可调参数')
  const end = source.indexOf('// ======================================================================= 主程序')
  if (start < 0 || end < 0) throw new Error('地铁生成器结构已变化，请更新浏览器构建入口')
  return '// Generated from scripts/generate-metro-map.mjs; do not edit.\n' + source.slice(start, end)
    .replace(/^const readJson = .*\r?\n/m, '')
    // File IO stays in the CLI. Browser exports use layout + renderSvg, with no terrain scene.
    .replace(/async function loadWaterPolygons\([\s\S]*?(?=async function detectMountain\()/, '')
    .replace(/async function detectMountain\([\s\S]*?(?=\/\/ 水面由)/, '')
}

export async function installMapExport(target) {
  await mkdir(path.join(target, 'export'), { recursive: true })
  for (const name of await readdir(path.join(root, 'web-export'))) {
    await copyFile(path.join(root, 'web-export', name), path.join(target, 'export', name))
  }
  const core = browserMetroSource(await readFile(path.join(root, 'scripts/generate-metro-map.mjs'), 'utf8'))
  await writeFile(path.join(target, 'export/metro-core.mjs'), core)
  const assets = path.join(target, 'assets')
  const bundle = (await readdir(assets)).find(name => /^index-.*\.js$/.test(name))
  if (!bundle) throw new Error(`找不到地图网页包：${target}`)
  let source = await readFile(path.join(assets, bundle), 'utf8')
  const mark = '/*skylens-export-bridge*/'
  if (!source.includes(mark)) {
    const anchor = 's(oe.map),h("ready")'
    if (source.split(anchor).length !== 2) throw new Error('找不到唯一的地图初始化位置，未修改网页包')
    source = source.replace(anchor, `${mark}window.skylensMap=oe.map,window.dispatchEvent(new Event("skylens:map-ready")),${anchor}`)
    await writeFile(path.join(assets, bundle), source)
  }
  const htmlFile = path.join(target, 'index.html')
  let html = await readFile(htmlFile, 'utf8')
  if (!html.includes('./export/export-ui.mjs')) {
    html = html.replace('</head>', '  <link rel="stylesheet" href="./export/export.css">\n  <script type="module" src="./export/export-ui.mjs"></script>\n</head>')
    await writeFile(htmlFile, html)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2)
  for (const target of targets.length ? targets : [path.join(root, 'app'), path.resolve(root, '../skylens-mobile-android-source/app/src/main/assets/web')]) {
    await installMapExport(path.resolve(target))
    console.log(`已安装地图导出：${target}`)
  }
}
