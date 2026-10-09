const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('perssuaDesktop', {
  isElectron: true,
  platform: process.platform,

  // Window Controls
  minimize: () => ipcRenderer.send('perssua:minimize'),
  close: () => ipcRenderer.send('perssua:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('perssua:toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('perssua:get-always-on-top'),
  setMode: (mode) => ipcRenderer.send('perssua:set-mode', mode),

  // Events from Main Process (shortcuts, etc.)
  onShortcut: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('perssua:shortcut', handler);
    return () => ipcRenderer.removeListener('perssua:shortcut', handler);
  },
});
