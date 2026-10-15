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

  // Native folder picker (Obsidian vault); resolves to a path or null.
  pickDirectory: (title) => ipcRenderer.invoke('interviewai:pick-directory', title),

  // Events from Main Process (shortcuts, etc.)
  onShortcut: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('interviewai:shortcut', handler);
    return () => ipcRenderer.removeListener('interviewai:shortcut', handler);
  },

  // Screenshot shortcut: settings hold the monitor ("cursor" or an output name) and the connected monitors.
  getScreenshotSettings: () => ipcRenderer.invoke('interviewai:get-screenshot-settings'),
  setScreenshotMonitor: (monitor) => ipcRenderer.invoke('interviewai:set-screenshot-monitor', monitor),

  // Screen captures from the screenshot shortcut: { image } or { error }.
  onScreenshot: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('interviewai:screenshot', handler);
    return () => ipcRenderer.removeListener('interviewai:screenshot', handler);
  },
});
