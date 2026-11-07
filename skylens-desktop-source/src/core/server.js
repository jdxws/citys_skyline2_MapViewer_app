'use strict'
// 每个打开的地图窗口使用一个独立的本地服务器（只监听 127.0.0.1，随机端口）。
// 它做两件事：
//   1. 提供内置的 SKYLENS 网页（app/ 目录）；
//   2. 扮演游戏模组的"会话"：提供 /session.json，并把 /snapshots/<id>/… 映射到地图库中的快照目录。
const http = require('node:http')
const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')

const SNAPSHOT_ID = /^[0-9a-f]{16}$/

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.qml': 'text/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pbf': 'application/x-protobuf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

function resolveInside(base, relative) {
  if (relative.includes('\0')) return null
  const file = path.normalize(path.join(base, relative))
  return file === base || file.startsWith(base + path.sep) ? file : null
}

/**
 * @param {{ appDir: string, dataDir: string }} options
 * @returns {Promise<{ port: number, url: string, origin: string, datasetId: string, close: () => Promise<void> }>}
 */
async function createMapServer({ appDir, dataDir }) {
  const appRoot = path.resolve(appDir)
  const dataRoot = path.resolve(dataDir)
  const manifestText = await fsp.readFile(path.join(dataRoot, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestText.replace(/^\uFEFF/, ''))
  const datasetId = manifest?.datasetId
  if (typeof datasetId !== 'string' || !SNAPSHOT_ID.test(datasetId)) {
    throw new Error('manifest.json 中没有有效的快照 ID（datasetId）')
  }
  const prefix = `/snapshots/${datasetId}/`
  const sessionBody = JSON.stringify({ snapshotId: datasetId, dataRoot: `snapshots/${datasetId}/` })
  let allowedHosts = new Set()

  const server = http.createServer(async (req, res) => {
    try {
      // 防止 DNS 重绑定：只接受以本机地址访问的请求
      const host = String(req.headers.host ?? '').toLowerCase()
      if (!allowedHosts.has(host)) { res.writeHead(403).end(); return }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return }

      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)

      if (pathname === '/session.json') {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(sessionBody),
          'Cache-Control': 'no-store',
        })
        res.end(req.method === 'HEAD' ? undefined : sessionBody)
        return
      }

      let file
      if (pathname.startsWith(prefix)) {
        file = resolveInside(dataRoot, pathname.slice(prefix.length))
      } else {
        if (pathname.endsWith('/')) pathname += 'index.html'
        file = resolveInside(appRoot, pathname)
      }
      if (!file) { res.writeHead(403).end(); return }

      const info = await fsp.stat(file)
      if (!info.isFile()) throw new Error('not a file')
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
      })
      if (req.method === 'HEAD') { res.end(); return }
      const stream = fs.createReadStream(file)
      stream.on('error', () => res.destroy())
      res.on('close', () => stream.destroy())
      stream.pipe(res)
    } catch {
      if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])

  return {
    port,
    datasetId,
    origin: `http://127.0.0.1:${port}`,
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise(resolve => {
      server.closeAllConnections?.()
      server.close(() => resolve())
    }),
  }
}

module.exports = { createMapServer, SNAPSHOT_ID }
