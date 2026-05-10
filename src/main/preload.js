const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('novelPublisher', {
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  scanChapters: (payload) => ipcRenderer.invoke('chapters:scan', payload),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  loadRecords: () => ipcRenderer.invoke('records:load'),
  markSuccess: (payload) => ipcRenderer.invoke('records:mark-success', payload),
  saveReport: (payload) => ipcRenderer.invoke('report:save', payload),
  controlMainWindow: (action) => ipcRenderer.invoke('window:control', action),

  openFanqieWriterWindow: (payload) => ipcRenderer.invoke('fanqie:open-writer-window', payload),
  executeInFanqieWindow: (script) => ipcRenderer.invoke('fanqie:execute-js', script),
  executeInFanqieWindowSafe: (script) => ipcRenderer.invoke('fanqie:execute-js-safe', script),
  reloadFanqieWriterWindow: () => ipcRenderer.invoke('fanqie:reload-writer-window'),
  controlFanqieWriterWindow: (action) => ipcRenderer.invoke('fanqie:control-writer-window', action),
  getFanqieWindowState: () => ipcRenderer.invoke('fanqie:get-window-state'),
  clickFanqieSaveDraft: (action) => ipcRenderer.invoke('fanqie:click-save-draft', action),
  clickFanqieWorkflowAction: (action) => ipcRenderer.invoke('fanqie:click-workflow-action', action),

  // 兼容上一版命名。
  openFanqieLoginPopup: (payload) => ipcRenderer.invoke('fanqie:open-login-popup', payload),
  onFanqieLoginPopupClosed: (callback) => {
    ipcRenderer.removeAllListeners('fanqie:login-popup-closed');
    ipcRenderer.on('fanqie:login-popup-closed', (_event, payload) => callback(payload));
  },

  onFanqieWriterWindowClosed: (callback) => {
    ipcRenderer.removeAllListeners('fanqie:writer-window-closed');
    ipcRenderer.on('fanqie:writer-window-closed', (_event, payload) => callback(payload));
  },
  onFanqieWriterWindowNavigated: (callback) => {
    ipcRenderer.removeAllListeners('fanqie:writer-window-navigated');
    ipcRenderer.on('fanqie:writer-window-navigated', (_event, payload) => callback(payload));
  },
  onFanqieWriterWindowLoaded: (callback) => {
    ipcRenderer.removeAllListeners('fanqie:writer-window-loaded');
    ipcRenderer.on('fanqie:writer-window-loaded', (_event, payload) => callback(payload));
  },
  onFanqieWriterWindowResized: (callback) => {
    ipcRenderer.removeAllListeners('fanqie:writer-window-resized');
    ipcRenderer.on('fanqie:writer-window-resized', (_event, payload) => callback(payload));
  },
  onFanqieWriterWindowReady: (callback) => {
    ipcRenderer.removeAllListeners('fanqie:writer-window-ready');
    ipcRenderer.on('fanqie:writer-window-ready', (_event, payload) => callback(payload));
  },
  onFanqieWriterConsole: (callback) => {
    ipcRenderer.removeAllListeners('fanqie:writer-console');
    ipcRenderer.on('fanqie:writer-console', (_event, payload) => callback(payload));
  }
});
