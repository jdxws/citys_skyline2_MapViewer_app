'use strict'
const { contextBridge, ipcRenderer, webUtils } = require('electron')

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('skylens', {
  info: () => ipcRenderer.invoke('app:info'),
  changeLibraryLocation: () => ipcRenderer.invoke('library:change-location'),
  list: () => ipcRenderer.invoke('library:list'),
  open: id => ipcRenderer.invoke('library:open', id),
  rename: (id, name) => ipcRenderer.invoke('library:rename', id, name),
  remove: id => ipcRenderer.invoke('library:remove', id),
  reveal: id => ipcRenderer.invoke('library:reveal', id),
  pick: kind => ipcRenderer.invoke('import:pick', kind),
  importPaths: paths => ipcRenderer.invoke('import:paths', paths),
  pathForFile: file => webUtils.getPathForFile(file),
  onProgress: callback => subscribe('import:progress', callback),
  onMenuPick: callback => subscribe('menu:pick', callback),
})
