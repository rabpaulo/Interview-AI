const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('interviewaiDesktop', {
  isElectron: true,
  platform: process.platform,

  // Window Controls
  minimize: () => ipcRenderer.send('interviewai:minimize'),
  close: () => ipcRenderer.send('interviewai:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('interviewai:toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('interviewai:get-always-on-top'),
  setMode: (mode) => ipcRenderer.send('interviewai:set-mode', mode),
  setOpacity: (value) => ipcRenderer.send('interviewai:set-opacity', value),
  usesCssOpacity: process.platform === 'linux',

  // Events from Main Process (shortcuts, etc.)
  onShortcut: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('interviewai:shortcut', handler);
    return () => ipcRenderer.removeListener('interviewai:shortcut', handler);
  },
});
