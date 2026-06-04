const { BrowserWindow, screen } = require('electron');

const FANQIE_PARTITION = 'persist:fanqie-writer';
const QIMAO_PARTITION = 'persist:qimao-writer';
// 直接进入番茄作家助手 PC 工作台/作品管理，而不是番茄小说阅读站首页。
const DEFAULT_FANQIE_URL = 'https://fanqienovel.com/main/writer/book-manage';
const DEFAULT_QIMAO_URL = 'https://zuozhe.qimao.com/front/index';

let writerWindow = null;
let writerPlatform = '';
let mainWindow = null;

function setMainWindow(mw) {
  mainWindow = mw;
}

function getMainWindow() {
  return mainWindow;
}

function getWriterWindow() {
  return writerWindow;
}

function getWriterPlatform() {
  return writerPlatform;
}

function setWriterPlatform(p) {
  writerPlatform = p;
}

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function emitWriterWindowState(eventName) {
  if (!writerWindow || writerWindow.isDestroyed()) {
    sendToMain(eventName, { open: false, url: '', title: '' });
    return;
  }

  sendToMain(eventName, {
    open: true,
    url: writerWindow.webContents.getURL(),
    title: writerWindow.webContents.getTitle(),
    isMinimized: writerWindow.isMinimized(),
    isMaximized: writerWindow.isMaximized()
  });
}

function platformPartition(platform) {
  return platform === 'qimao' ? QIMAO_PARTITION : FANQIE_PARTITION;
}

function platformDefaultUrl(platform) {
  return platform === 'qimao' ? DEFAULT_QIMAO_URL : DEFAULT_FANQIE_URL;
}

function platformWindowTitle(platform) {
  return platform === 'qimao' ? '七猫作家助手工作台' : '番茄作家助手工作台';
}

function openWriterWindow(platform = 'fanqie', targetUrl = null) {
  if (writerWindow && !writerWindow.isDestroyed() && writerPlatform !== platform) {
    writerWindow.close();
    writerWindow = null;
    writerPlatform = '';
  }

  if (writerWindow && !writerWindow.isDestroyed()) {
    if (writerWindow.isMinimized()) {
      if (typeof writerWindow.showInactive === 'function') writerWindow.showInactive();
      else writerWindow.restore();
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
    emitWriterWindowState(`${platform}:writer-window-ready`);
    return;
  }

  const display = mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const writerWidth = Math.min(1420, Math.max(1180, display.workArea.width - 160));
  const writerHeight = Math.min(920, Math.max(760, display.workArea.height - 120));
  const url = targetUrl || platformDefaultUrl(platform);

  writerWindow = new BrowserWindow({
    width: writerWidth,
    height: writerHeight,
    minWidth: 1100,
    minHeight: 720,
    title: platformWindowTitle(platform),
    modal: false,
    show: false,
    resizable: true,
    maximizable: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition: platformPartition(platform),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  writerWindow.setMenuBarVisibility(false);
  writerWindow.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
    if (popupUrl) writerWindow.loadURL(popupUrl);
    return { action: 'deny' };
  });

  writerWindow.once('ready-to-show', () => {
    if (writerWindow && !writerWindow.isDestroyed()) {
      if (typeof writerWindow.showInactive === 'function') {
        writerWindow.showInactive();
      } else {
        writerWindow.show();
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
      emitWriterWindowState(`${platform}:writer-window-ready`);
    }
  });

  const emitNavigate = (url) => {
    sendToMain(`${platform}:writer-window-navigated`, {
      open: true,
      url,
      title: writerWindow && !writerWindow.isDestroyed() ? writerWindow.webContents.getTitle() : '',
      isMinimized: writerWindow && !writerWindow.isDestroyed() ? writerWindow.isMinimized() : false,
      isMaximized: writerWindow && !writerWindow.isDestroyed() ? writerWindow.isMaximized() : false
    });
  };

  writerWindow.webContents.on('did-navigate', (_event, navUrl) => {
    emitNavigate(navUrl);
  });

  writerWindow.webContents.on('did-navigate-in-page', (_event, navUrl) => {
    emitNavigate(navUrl);
  });

  writerWindow.webContents.on('did-finish-load', () => {
    emitWriterWindowState(`${platform}:writer-window-loaded`);
  });

  writerWindow.webContents.on('console-message', (_event, _level, message) => {
    if (typeof message === 'string' && message.includes('[小说上传助手]')) {
      sendToMain(`${platform}:writer-console`, { message });
    }
  });

  writerWindow.on('resize', () => {
    emitWriterWindowState(`${platform}:writer-window-resized`);
  });
  writerWindow.on('minimize', () => {
    emitWriterWindowState(`${platform}:writer-window-resized`);
  });
  writerWindow.on('restore', () => {
    emitWriterWindowState(`${platform}:writer-window-resized`);
  });
  writerWindow.on('maximize', () => {
    emitWriterWindowState(`${platform}:writer-window-resized`);
  });
  writerWindow.on('unmaximize', () => {
    emitWriterWindowState(`${platform}:writer-window-resized`);
  });

  writerWindow.on('closed', () => {
    writerPlatform = '';
    writerWindow = null;
    sendToMain(`${platform}:writer-window-closed`, { open: false, url: '', title: '' });
    sendToMain('fanqie:login-popup-closed', { open: false, url: '', title: '' });
  });

  writerWindow.loadURL(url);
  writerPlatform = platform;
}

function getWriterWindowOrThrow() {
  if (!writerWindow || writerWindow.isDestroyed()) {
    throw new Error('番茄作家助手窗口尚未打开，请先点击\u201c打开作家助手工作台\u201d。');
  }
  return writerWindow;
}

function controlWriterWindow(targetWindow, action) {
  switch (action) {
    case 'minimize':
      targetWindow.minimize();
      break;
    case 'maximize':
      if (targetWindow.isMinimized()) targetWindow.restore();
      targetWindow.maximize();
      break;
    case 'toggle-maximize':
      if (targetWindow.isMinimized()) targetWindow.restore();
      if (targetWindow.isMaximized()) targetWindow.unmaximize();
      else targetWindow.maximize();
      break;
    case 'restore':
      targetWindow.restore();
      break;
    case 'focus':
      // 兼容旧版动作名：只恢复/显示窗口，不主动抢焦点。
      if (targetWindow.isMinimized()) targetWindow.restore();
      else if (typeof targetWindow.showInactive === 'function') targetWindow.showInactive();
      break;
    default:
      throw new Error(`未知作家窗口控制动作：${action}`);
  }
}

module.exports = {
  setMainWindow,
  getMainWindow,
  getWriterWindow,
  getWriterPlatform,
  setWriterPlatform,
  sendToMain,
  emitWriterWindowState,
  platformPartition,
  platformDefaultUrl,
  platformWindowTitle,
  openWriterWindow,
  getWriterWindowOrThrow,
  controlWriterWindow,
  DEFAULT_FANQIE_URL,
  DEFAULT_QIMAO_URL,
  FANQIE_PARTITION,
  QIMAO_PARTITION
};
