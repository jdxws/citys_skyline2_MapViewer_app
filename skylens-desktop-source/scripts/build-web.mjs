// 用上游 SKYLENS MAPS 源码重新构建内置网页（app/ 目录）。
// 用法：node scripts/build-web.mjs <skylens-maps 源码目录>
//   或：SKYLENS_SRC=<目录> npm run build:web
import { spawnSync } from 'node:child_process'
import { cp, rm, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchChineseLocale } from './patch-chinese-locale.mjs'
import { installMapExport } from './install-map-export.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = path.resolve(process.argv[2] ?? process.env.SKYLENS_SRC ?? '')
if (!process.argv[2] && !process.env.SKYLENS_SRC) {
  console.error('请指定 skylens-maps 源码目录：node scripts/build-web.mjs <目录>')
  process.exit(1)
}
await access(path.join(source, 'package.json')).catch(() => { console.error(`找不到 ${source}/package.json`); process.exit(1) })

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (args) => {
  const result = spawnSync(npm, args, { cwd: source, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
await access(path.join(source, 'node_modules')).catch(() => run(['ci']))
run(['run', 'build:app']) // vite build --mode mod：与游戏内使用的是同一种构建

const target = path.resolve(here, '..', 'app')
await rm(target, { recursive: true, force: true })
await cp(path.join(source, 'dist'), target, { recursive: true })
await patchChineseLocale(target)
await installMapExport(target)
console.log(`已更新 ${target}`)
