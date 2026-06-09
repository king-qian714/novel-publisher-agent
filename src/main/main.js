const { app, BrowserWindow, ipcMain, dialog, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const windows = require('./windows');
const chapterScanner = require('./chapter-scanner');
const store = require('./store');
const fanqieHandlers = require('./fanqie-handlers');
const qimaoHandlers = require('./qimao-handlers');
const platforms = require('../platforms');

app.setName('番茄小说草稿上传助手');

let mainWindow;

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.min(1380, Math.max(1120, workAreaSize.width - 120));
  const height = Math.min(940, Math.max(760, workAreaSize.height - 90));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1040,
    minHeight: 720,
    title: '番茄小说草稿上传助手',
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#f5f6fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  windows.setMainWindow(mainWindow);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  registerIpcHandlers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpcHandlers() {
  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择小说章节文件夹',
      properties: ['openDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('chapters:scan', async (_event, payload) => {
    const { folderPath, options } = payload || {};
    if (!folderPath) throw new Error('缺少章节文件夹路径。');
    return chapterScanner.scanChapters(folderPath, options || {});
  });

  ipcMain.handle('window:control', async (_event, action) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
    switch (action) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'toggle-maximize':
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
        break;
      case 'close':
        mainWindow.close();
        break;
      default:
        throw new Error(`未知窗口控制动作：${action}`);
    }
    return { ok: true, isMaximized: mainWindow.isMaximized() };
  });

  ipcMain.handle('settings:load', async () => {
    return store.readJsonFile(store.settingsPath(), {
      removeTitleLine: true,
      recursive: false,
      uploadDelayMs: 2500,
      fanqieUrl: platforms.get('fanqie').defaultUrl,
      qimaoUrl: platforms.get('qimao').defaultUrl
    });
  });

  ipcMain.handle('settings:save', async (_event, settings) => {
    await store.writeJsonFile(store.settingsPath(), settings || {});
    return { ok: true };
  });

  ipcMain.handle('records:load', async () => {
    return store.readJsonFile(store.recordsPath(), []);
  });

  ipcMain.handle('records:mark-success', async (_event, payload) => {
    const records = await store.readJsonFile(store.recordsPath(), []);
    const now = new Date().toISOString();
    const record = {
      id: `${payload.platform || 'fanqie'}:${payload.bookName || ''}:${payload.contentHash}`,
      platform: payload.platform || 'fanqie',
      bookName: payload.bookName || '',
      chapterTitle: payload.title,
      filePath: payload.filePath,
      contentHash: payload.contentHash,
      status: '已保存草稿',
      createdAt: now,
      updatedAt: now
    };

    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      records[index] = { ...records[index], ...record, updatedAt: now };
    } else {
      records.push(record);
    }

    await store.writeJsonFile(store.recordsPath(), records);
    return record;
  });

  ipcMain.handle('report:save', async (_event, payload) => {
    const defaultName = `草稿上传报告-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.json`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存上传报告',
      defaultPath: defaultName,
      filters: [{ name: 'JSON 报告', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await fs.writeFile(result.filePath, JSON.stringify(payload || {}, null, 2), 'utf8');
    return { ok: true, filePath: result.filePath };
  });

  fanqieHandlers.register({ ipcMain, windows, chapterScanner, store });
  qimaoHandlers.register({ ipcMain, windows, chapterScanner, store });
}
