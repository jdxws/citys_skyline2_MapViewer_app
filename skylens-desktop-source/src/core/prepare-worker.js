'use strict'
// 子进程入口：node prepare-worker.js <inputRoot> <outputDir>
// 通过 IPC 汇报进度，避免把几百 MB 的 GeoJSON 载入主进程。
const { prepareSnapshot } = require('./prepare')

const [inputRoot, outputDir] = process.argv.slice(2)
prepareSnapshot(inputRoot, outputDir, (fraction, message) => process.send?.({ type: 'progress', fraction, message }))
  .then(manifest => process.send?.({ type: 'done', datasetId: manifest.datasetId }, () => process.exit(0)))
  .catch(error => process.send?.({ type: 'error', message: error instanceof Error ? error.message : String(error) }, () => process.exit(1)))
