const { contextBridge, ipcRenderer } = require('electron');

try {
    contextBridge.exposeInMainWorld('electronAPI', {
        onNewCircuit: (callback) => ipcRenderer.on('new-circuit', callback),
        onClearAll: (callback) => ipcRenderer.on('clear-all', callback),
        onSetMode: (callback) => ipcRenderer.on('set-mode', callback),
        onToggleLegend: (callback) => ipcRenderer.on('toggle-legend', callback),
        onShowAbout: (callback) => ipcRenderer.on('show-about', callback)
    });
} catch (err) {
    console.error('[PRELOAD] Error exposing electronAPI:', err);
}