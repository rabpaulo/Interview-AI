const { app, BrowserWindow, globalShortcut, ipcMain, screen, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let isAlwaysOnTop = true;
let currentMode = 'compact'; // 'compact' | 'mini'
let previousBounds = { width: 440, height: 620, x: undefined, y: undefined };
let serverProcess = null;
const managedByDevScript = process.argv.includes('--managed-backend');
const devRendererUrl = process.env.PERSSUA_DEV_URL || 'http://localhost:5173';
const managedRenderer = process.argv.includes('--managed-renderer') || managedByDevScript;

function ensureServerRunning() {
  const isBackendRunning = () => new Promise((resolve) => {
    const request = http.get('http://localhost:3001/api/status', (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 300);
    });

    request.setTimeout(1000, () => request.destroy());
    request.on('error', () => resolve(false));
  });

  const waitForBackend = async (timeoutMs = 10000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await isBackendRunning()) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Backend did not become ready on http://localhost:3001');
  };

  return (async () => {
    if (await isBackendRunning()) {
      console.log('[Electron] Backend server is already running.');
      return;
    }

    if (managedByDevScript) {
      console.log('[Electron] Waiting for the dev script backend...');
      await waitForBackend();
      console.log('[Electron] Dev backend is ready!');
      return;
    }

    console.log('[Electron] Starting local backend server...');
    const serverScript = path.join(__dirname, '../server/index.js');
    serverProcess = spawn(process.execPath || 'node', [serverScript], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env, PORT: '3001', ELECTRON_RUN_AS_NODE: '1' },
    });

    await waitForBackend();
    console.log('[Electron] Local backend server is ready!');
  })();
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const windowWidth = 440;
  const windowHeight = 620;
  const defaultX = Math.round(workArea.x + workArea.width - windowWidth - 28);
  const defaultY = Math.round(workArea.y + 40);

  const iconPath = path.join(__dirname, '../build/icon.png');

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: defaultX,
    y: defaultY,
    minWidth: 360,
    minHeight: 440,
    maxWidth: 680,
    maxHeight: 1000,
    backgroundColor: '#0c0c11',
    title: 'Perssua AI Copilot',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    frame: false, // frameless for sleek floating widget with custom draggable header
    transparent: false,
    alwaysOnTop: true, // starts pinned like the real Perssua
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Log renderer console messages to terminal
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${path.basename(sourceId || '')}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Failed Load] code=${errorCode}: ${errorDescription} at ${validatedURL}`);
  });

  // Load URL with automatic retry until server is live
  const loadTargetUrl = () => {
    if (app.isPackaged) {
      const reqBackend = http.get('http://localhost:3001', (res) => {
        res.resume();
        console.log('[Electron] Loading from Backend server http://localhost:3001');
        mainWindow.loadURL('http://localhost:3001');
      });
      reqBackend.on('error', () => {
        setTimeout(loadTargetUrl, 300);
      });
      return;
    }

    const reqVite = http.get(devRendererUrl, (res) => {
      res.resume();
      console.log(`[Electron] Loading from Vite dev server ${devRendererUrl}`);
      mainWindow.loadURL(devRendererUrl);
    });
    reqVite.on('error', () => {
      if (managedRenderer) {
        setTimeout(loadTargetUrl, 400);
        return;
      }

      const reqBackend = http.get('http://localhost:3001', (res) => {
        res.resume();
        console.log('[Electron] Loading from Backend server http://localhost:3001');
        mainWindow.loadURL('http://localhost:3001');
      });
      reqBackend.on('error', () => {
        setTimeout(loadTargetUrl, 400);
      });
    });
  };

  loadTargetUrl();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupShortcuts();
}

function setupShortcuts() {
  // Global Shortcut: Alt+Space -> Ask Copilot to assist immediately
  globalShortcut.register('Alt+Space', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('perssua:shortcut', 'ask_copilot');
    }
  });

  // Global Shortcut: CommandOrControl+D -> Analyze / Ask Copilot (Perssua keybinding)
  try {
    globalShortcut.register('CommandOrControl+D', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('perssua:shortcut', 'ask_copilot');
      }
    });
  } catch (err) {
    console.warn('[Electron] Could not register Ctrl+D:', err);
  }

  // Global Shortcut: CommandOrControl+B -> Toggle window show/hide
  try {
    globalShortcut.register('CommandOrControl+B', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.warn('[Electron] Could not register Ctrl+B:', err);
  }

  // Developer Shortcuts: Ctrl+Shift+I / F12 to toggle DevTools, Ctrl+R / F5 to reload
  try {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    });
    globalShortcut.register('F12', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.toggleDevTools();
      }
    });
    globalShortcut.register('CommandOrControl+R', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reload();
      }
    });
    globalShortcut.register('F5', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reload();
      }
    });
  } catch (err) {}

  // Global Shortcut: Alt+Shift+P -> Toggle PC audio listening
  globalShortcut.register('Alt+Shift+P', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('perssua:shortcut', 'toggle_pc_audio');
    }
  });

  // Global Shortcut: Alt+Shift+M -> Toggle mic recording
  globalShortcut.register('Alt+Shift+M', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('perssua:shortcut', 'toggle_mic');
    }
  });

  // Global Shortcut: Alt+Shift+N -> Nova Sessão
  globalShortcut.register('Alt+Shift+N', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('perssua:shortcut', 'new_session');
    }
  });
}

function setWindowMode(mode) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  currentMode = mode;
  try {
    const currentDisplay = screen.getDisplayNearestPoint(mainWindow.getBounds());
    const workArea = currentDisplay.workArea;

    if (mode === 'mini') {
      previousBounds = mainWindow.getBounds();
      const miniWidth = 380;
      const miniHeight = 220;
      const x = Math.round(workArea.x + workArea.width - miniWidth - 24);
      const y = Math.round(workArea.y + 24);

      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.setBounds({ x, y, width: miniWidth, height: miniHeight });
    } else {
      const targetWidth = Math.round(previousBounds?.width || 440);
      const targetHeight = Math.round(previousBounds?.height || 620);
      const x = previousBounds?.x !== undefined ? previousBounds.x : Math.round(workArea.x + workArea.width - targetWidth - 28);
      const y = previousBounds?.y !== undefined ? previousBounds.y : Math.round(workArea.y + 40);

      mainWindow.setAlwaysOnTop(isAlwaysOnTop, isAlwaysOnTop ? 'screen-saver' : 'normal');
      mainWindow.setBounds({ x, y, width: targetWidth, height: targetHeight });
    }
  } catch (err) {
    console.error('[Electron] Error in setWindowMode:', err);
  }
}

// IPC Handlers
ipcMain.handle('perssua:toggle-always-on-top', () => {
  if (!mainWindow) return false;
  isAlwaysOnTop = !isAlwaysOnTop;
  mainWindow.setAlwaysOnTop(isAlwaysOnTop, isAlwaysOnTop ? 'screen-saver' : 'normal');
  return isAlwaysOnTop;
});

ipcMain.handle('perssua:get-always-on-top', () => {
  if (!mainWindow) return false;
  return mainWindow.isAlwaysOnTop();
});

ipcMain.on('perssua:set-mode', (_event, mode) => {
  setWindowMode(mode);
});

ipcMain.on('perssua:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('perssua:close', () => {
  if (mainWindow) mainWindow.close();
});


app.whenReady().then(async () => {
  // Allow microphone and audio capture automatically in desktop app
  if (session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(true);
    });
  }

  try {
    await ensureServerRunning();
    createWindow();
  } catch (error) {
    console.error('[Electron] Failed to start the backend:', error.message);
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (serverProcess) {
    console.log('[Electron] Terminating local backend server...');
    try {
      serverProcess.kill();
    } catch {}
    serverProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => app.quit());
}
