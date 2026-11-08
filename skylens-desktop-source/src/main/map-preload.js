'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('skylensFiles', {
  save: payload => ipcRenderer.invoke('map:save-export', payload),
})
