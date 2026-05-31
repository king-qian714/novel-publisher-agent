const { contextBridge, ipcRenderer } = require('electron');
const qimao = require('../platforms/qimao');

contextBridge.exposeInMainWorld('novelPublisher', {
  // 平台脚本构建器
  qimaoBuildPageDetectionScript: qimao.buildPageDetectionScript,
  qimaoBuildClickNewChapterScript: qimao.buildClickNewChapterScript,
  qimaoBuildUploadScript: qimao.buildUploadScript,
  qimaoBuildClickPublishScript: qimao.buildClickPublishScript,
  qimaoBuildClickConfirmPublishScript: qimao.buildClickConfirmPublishScript,
  qimaoBuildPublishCompletionDetectionScript: qimao.buildPublishCompletionDetectionScript,
  qimaoBuildWaitForEditorReadyScript: qimao.buildWaitForEditorReadyScript,
  qimaoDefaultUrl: qimao.defaultUrl,
  qimaoSessionPartition: qimao.sessionPartition,
  qimaoDisplayName: qimao.displayName,
  qimaoAppName: qimao.appName,
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
  },

  // 七猫平台 API
  openQimaoWriterWindow: (payload) => ipcRenderer.invoke('qimao:open-writer-window', payload),
  executeInQimaoWindow: (script) => ipcRenderer.invoke('qimao:execute-js', script),
  executeInQimaoWindowSafe: (script) => ipcRenderer.invoke('qimao:execute-js-safe', script),
  reloadQimaoWriterWindow: () => ipcRenderer.invoke('qimao:reload-writer-window'),
  controlQimaoWriterWindow: (action) => ipcRenderer.invoke('qimao:control-writer-window', action),
  getQimaoWindowState: () => ipcRenderer.invoke('qimao:get-window-state'),

  onQimaoWriterWindowClosed: (callback) => {
    ipcRenderer.removeAllListeners('qimao:writer-window-closed');
    ipcRenderer.on('qimao:writer-window-closed', (_event, payload) => callback(payload));
  },
  onQimaoWriterWindowNavigated: (callback) => {
    ipcRenderer.removeAllListeners('qimao:writer-window-navigated');
    ipcRenderer.on('qimao:writer-window-navigated', (_event, payload) => callback(payload));
  },
  onQimaoWriterWindowLoaded: (callback) => {
    ipcRenderer.removeAllListeners('qimao:writer-window-loaded');
    ipcRenderer.on('qimao:writer-window-loaded', (_event, payload) => callback(payload));
  },
  onQimaoWriterWindowResized: (callback) => {
    ipcRenderer.removeAllListeners('qimao:writer-window-resized');
    ipcRenderer.on('qimao:writer-window-resized', (_event, payload) => callback(payload));
  },
  onQimaoWriterWindowReady: (callback) => {
    ipcRenderer.removeAllListeners('qimao:writer-window-ready');
    ipcRenderer.on('qimao:writer-window-ready', (_event, payload) => callback(payload));
  },
  onQimaoWriterConsole: (callback) => {
    ipcRenderer.removeAllListeners('qimao:writer-console');
    ipcRenderer.on('qimao:writer-console', (_event, payload) => callback(payload));
  }
});
