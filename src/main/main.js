const { app, BrowserWindow, ipcMain, dialog, screen, Menu } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { TextDecoder } = require('util');

app.setName('番茄小说草稿上传助手');

let mainWindow;
let writerWindow;
let writerPlatform = '';

const FANQIE_PARTITION = 'persist:fanqie-writer';
const QIMAO_PARTITION = 'persist:qimao-writer';
// 直接进入番茄作家助手 PC 工作台/作品管理，而不是番茄小说阅读站首页。
const DEFAULT_FANQIE_URL = 'https://fanqienovel.com/main/writer/book-manage';
const DEFAULT_QIMAO_URL = 'https://zuozhe.qimao.com/front/index';

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
    throw new Error('番茄作家助手窗口尚未打开，请先点击“打开作家助手工作台”。');
  }
  return writerWindow;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function getStoreDir() {
  return app.getPath('userData');
}

async function ensureStoreDir() {
  await fs.mkdir(getStoreDir(), { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await ensureStoreDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function recordsPath() {
  return path.join(getStoreDir(), 'publish-records.json');
}

function settingsPath() {
  return path.join(getStoreDir(), 'settings.json');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function decodeText(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (_) {
    // 国内小说 TXT 常见 GBK/GB18030。GB18030 可兼容 GBK。
    try {
      return new TextDecoder('gb18030').decode(buffer);
    } catch (error) {
      return buffer.toString('utf8');
    }
  }
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
}

function stripMarkdownHeading(line) {
  return line.replace(/^\s{0,3}#{1,6}\s+/, '').trim();
}

function isMarkdownFile(fileName) {
  return ['.md', '.markdown'].includes(path.extname(fileName).toLowerCase());
}

function stripMarkdownFrontMatter(lines) {
  if (!lines.length || lines[0].trim() !== '---') return lines;
  for (let index = 1; index < Math.min(lines.length, 80); index += 1) {
    const marker = lines[index].trim();
    if (marker === '---' || marker === '...') {
      return lines.slice(index + 1);
    }
  }
  return lines;
}

function isMarkdownSceneBreak(line) {
  return /^\s{0,3}([*\-_])(?:\s*\1){2,}\s*$/.test(line) || /^\s*[※＊*]{3,}\s*$/.test(line);
}

function normalizeMarkdownBody(body) {
  const sourceLines = normalizeLineEndings(body)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .split('\n');

  const output = [];
  let pendingBlank = false;
  for (const rawLine of sourceLines) {
    let line = rawLine.replace(/^\s{0,3}>\s?/, '').trimEnd();
    if (/^\s*<!--.*-->\s*$/.test(line)) continue;
    if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) continue;
    if (/^\s*$/.test(line)) {
      pendingBlank = true;
      continue;
    }

    line = stripMarkdownHeading(line);
    if (!line) {
      pendingBlank = true;
      continue;
    }

    const previous = output.length ? output[output.length - 1] : '';
    if (pendingBlank && previous && (isMarkdownSceneBreak(previous) || isMarkdownSceneBreak(line))) {
      output.push('');
    }
    output.push(line);
    pendingBlank = false;
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function looksLikeChapterTitle(line) {
  const text = stripMarkdownHeading(line).trim();
  if (!text || text.length > 80) return false;

  const chapterNumber = '[0-9０-９零〇一二两三四五六七八九十百千万]+';
  const patterns = [
    new RegExp(`^第\\s*${chapterNumber}\\s*[章节张回]\\s*[\\s、:：.．\\-—]*.*$`, 'u'),
    new RegExp(`^第\\s*${chapterNumber}\\s*卷.*$`, 'u'),
    /^(序章|楔子|引子|尾声|后记)(\s+.*)?$/u,
    /^(番外|番外篇)([\s\d０-９一二三四五六七八九十零〇、:：.．\-—].*)?$/u
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function extractTitleAndBody(rawText, fileName, options = {}) {
  const removeTitleLine = options.removeTitleLine !== false;
  const markdown = isMarkdownFile(fileName);
  const text = normalizeLineEndings(rawText);
  const lines = markdown ? stripMarkdownFrontMatter(text.split('\n')) : text.split('\n');
  const scanLimit = Math.min(lines.length, 20);
  let titleLineIndex = -1;
  let title = '';

  for (let index = 0; index < scanLimit; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (looksLikeChapterTitle(line)) {
      titleLineIndex = index;
      title = stripMarkdownHeading(line);
      break;
    }
  }

  if (!title) {
    title = path.basename(fileName, path.extname(fileName)).replace(/^\d+[\s._-]*/, '').trim();
  }

  if (!title) {
    title = path.basename(fileName, path.extname(fileName)).trim();
  }

  let bodyLines = [...lines];
  if (removeTitleLine && titleLineIndex >= 0) {
    bodyLines.splice(titleLineIndex, 1);
    // 如果标题后一行是空行，去掉一个空行，避免正文开头多空一行。
    if (bodyLines[titleLineIndex] !== undefined && bodyLines[titleLineIndex].trim() === '') {
      bodyLines.splice(titleLineIndex, 1);
    }
  }

  let body = bodyLines.join('\n').replace(/^\uFEFF/, '').trimEnd();
  if (markdown) {
    body = normalizeMarkdownBody(body);
  }
  return { title, body, titleLineIndex };
}

function countWords(text) {
  const withoutWhitespace = text.replace(/\s+/g, '');
  return Array.from(withoutWhitespace).length;
}

async function walkChapterFiles(folderPath, recursive) {
  const result = [];
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        const childFiles = await walkChapterFiles(fullPath, recursive);
        result.push(...childFiles);
      }
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (['.txt', '.md', '.markdown'].includes(ext)) {
      result.push(fullPath);
    }
  }
  return result;
}

function naturalSortFiles(files) {
  const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
  return files.sort((a, b) => collator.compare(path.basename(a), path.basename(b)));
}

async function scanChapters(folderPath, options = {}) {
  const stat = await fs.stat(folderPath);
  if (!stat.isDirectory()) {
    throw new Error('请选择一个章节文件夹，而不是单个文件。');
  }

  const files = naturalSortFiles(await walkChapterFiles(folderPath, Boolean(options.recursive)));
  const chapters = [];

  for (let index = 0; index < files.length; index += 1) {
    const filePath = files[index];
    const buffer = await fs.readFile(filePath);
    const rawText = decodeText(buffer);
    const { title, body, titleLineIndex } = extractTitleAndBody(rawText, path.basename(filePath), options);
    const contentHash = sha256(`${title}\n${body}`);

    chapters.push({
      id: contentHash.slice(0, 16),
      index: index + 1,
      filePath,
      fileName: path.basename(filePath),
      title,
      body,
      titleLineIndex,
      wordCount: countWords(body),
      contentHash,
      status: '未上传',
      errorMessage: ''
    });
  }

  return chapters;
}

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
  return scanChapters(folderPath, options || {});
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

ipcMain.handle('fanqie:open-writer-window', async (_event, payload) => {
  const targetUrl = payload?.url || DEFAULT_FANQIE_URL;
  openWriterWindow('fanqie', targetUrl);
  return { ok: true };
});

// 兼容上一版命名。
ipcMain.handle('fanqie:open-login-popup', async (_event, payload) => {
  const targetUrl = payload?.url || DEFAULT_FANQIE_URL;
  openWriterWindow('fanqie', targetUrl);
  return { ok: true };
});

ipcMain.handle('qimao:open-writer-window', async (_event, payload) => {
  const targetUrl = payload?.url || DEFAULT_QIMAO_URL;
  openWriterWindow('qimao', targetUrl);
  return { ok: true };
});

ipcMain.handle('fanqie:execute-js', async (_event, script) => {
  const targetWindow = getWriterWindowOrThrow();
  try {
    return await targetWindow.webContents.executeJavaScript(script, true);
  } catch (error) {
    const url = targetWindow.webContents.getURL();
    const message = error && error.message ? error.message : String(error);
    throw new Error(`${message}; url: ${url || 'unknown'}`);
  }
});

ipcMain.handle('fanqie:execute-js-safe', async (_event, script) => {
  const targetWindow = getWriterWindowOrThrow();
  try {
    const value = await targetWindow.webContents.executeJavaScript(script, true);
    return { ok: true, value, url: targetWindow.webContents.getURL() };
  } catch (error) {
    const url = targetWindow.webContents.getURL();
    const message = error && error.message ? error.message : String(error);
    return { ok: false, message, url: url || '' };
  }
});

ipcMain.handle('fanqie:reload-writer-window', async () => {
  const targetWindow = getWriterWindowOrThrow();
  targetWindow.reload();
  return { ok: true };
});

ipcMain.handle('qimao:execute-js', async (_event, script) => {
  const targetWindow = getWriterWindowOrThrow();
  try {
    return await targetWindow.webContents.executeJavaScript(script, true);
  } catch (error) {
    const url = targetWindow.webContents.getURL();
    const message = error && error.message ? error.message : String(error);
    throw new Error(`${message}; url: ${url || 'unknown'}`);
  }
});

ipcMain.handle('qimao:execute-js-safe', async (_event, script) => {
  const targetWindow = getWriterWindowOrThrow();
  try {
    const value = await targetWindow.webContents.executeJavaScript(script, true);
    return { ok: true, value, url: targetWindow.webContents.getURL() };
  } catch (error) {
    const url = targetWindow.webContents.getURL();
    const message = error && error.message ? error.message : String(error);
    return { ok: false, message, url: url || '' };
  }
});

ipcMain.handle('qimao:reload-writer-window', async () => {
  const targetWindow = getWriterWindowOrThrow();
  targetWindow.reload();
  return { ok: true };
});

ipcMain.handle('fanqie:click-save-draft', async (_event, action = 'draft') => {
  const targetWindow = getWriterWindowOrThrow();
  const clickAction = action === 'next' ? 'next' : 'draft';
  const rect = await targetWindow.webContents.executeJavaScript(`
    (() => {
      const action = ${JSON.stringify(clickAction)};
      function normalize(value) { return String(value || '').replace(/\\s+/g, ' ').trim(); }
      function visible(el) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
      }
      function textOf(el) {
        return normalize((el.innerText || el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('data-e2e') || '') + ' ' + (el.className || ''));
      }
      function disabledOf(el) {
        return Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true' || /disabled/i.test(String(el.className || '')) || getComputedStyle(el).pointerEvents === 'none');
      }
      const draftRegex = /^(存草稿|保存草稿|存为草稿|暂存草稿)$/;
      const nextRegex = /^(下一步|直接发布|发布|提交审核|立即发布)$/;
      const looseDraftRegex = /存草稿|保存草稿|存为草稿|暂存草稿/;
      const looseNextRegex = /下一步|直接发布|提交审核|立即发布|[^已]发布$/;
      const candidates = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'))
        .filter(visible)
        .map((el) => {
          const text = textOf(el);
          const button = el.closest('button,a,[role="button"]') || el;
          const rect = button.getBoundingClientRect();
          const buttonText = textOf(button) || text;
          let score = 0;
          if (action === 'next') {
            if (nextRegex.test(text) || nextRegex.test(buttonText)) score += 260;
            if (looseNextRegex.test(text) || looseNextRegex.test(buttonText)) score += 160;
            if (looseDraftRegex.test(text) || looseDraftRegex.test(buttonText)) score -= 260;
          } else {
            if (draftRegex.test(text) || draftRegex.test(buttonText)) score += 260;
            if (looseDraftRegex.test(text) || looseDraftRegex.test(buttonText)) score += 170;
            if (looseNextRegex.test(text) || looseNextRegex.test(buttonText)) score -= 260;
          }
          if (rect.top < 120) score += 80;
          if (rect.left > window.innerWidth * 0.70) score += 60;
          if (rect.width >= 60 && rect.width <= 150 && rect.height >= 28 && rect.height <= 60) score += 45;
          if (button.tagName && button.tagName.toLowerCase() === 'button') score += 35;
          if (disabledOf(button)) score -= 100;
          return { el: button, text: buttonText || text, rect, score, disabled: disabledOf(button) };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      const compact = candidates.slice(0, 8).map((item) => ({
        text: item.text.slice(0, 50),
        x: Math.round(item.rect.left + item.rect.width / 2),
        y: Math.round(item.rect.top + item.rect.height / 2),
        score: Math.round(item.score),
        disabled: item.disabled
      }));

      let best = candidates.find((item) => !item.disabled) || candidates[0];
      if (!best) {
        const y = 34;
        const x = action === 'next' ? Math.round(window.innerWidth - 78) : Math.round(window.innerWidth - 190);
        return { ok: true, fallback: true, text: action === 'next' ? '下一步坐标兜底' : '存草稿坐标兜底', x, y, candidates: compact };
      }
      const x = Math.round(best.rect.left + best.rect.width / 2);
      const y = Math.round(best.rect.top + best.rect.height / 2);
      return {
        ok: !best.disabled,
        message: best.disabled ? '目标按钮仍处于禁用状态' : '',
        text: best.text,
        x,
        y,
        width: Math.round(best.rect.width),
        height: Math.round(best.rect.height),
        candidates: compact
      };
    })();
  `, true);

  if (!rect || !rect.ok) {
    return rect || { ok: false, message: '没有找到可点击的存草稿/下一步按钮' };
  }

  try {
    await targetWindow.webContents.executeJavaScript(`
      (() => {
        const x = ${JSON.stringify(rect.x)};
        const y = ${JSON.stringify(rect.y)};
        const el = document.elementFromPoint(x, y);
        const target = el && (el.closest('button,a,[role="button"]') || el);
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        try { target.focus && target.focus(); } catch (_) {}
        try { target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: cx, clientY: cy })); } catch (_) {}
        target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
        try { target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: cx, clientY: cy })); } catch (_) {}
        target.click();
        return true;
      })();
    `, true);
  } catch (_) {}

  await new Promise((resolve) => setTimeout(resolve, 120));
  targetWindow.webContents.sendInputEvent({ type: 'mouseMove', x: rect.x, y: rect.y });
  targetWindow.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  targetWindow.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  return { ...rect, ok: true };
});

ipcMain.handle('fanqie:click-workflow-action', async (_event, action) => {
  const targetWindow = getWriterWindowOrThrow();
  const actionConfigs = {
    submit: {
      label: '错别字检测提交',
      actionKey: 'typo_submit',
      exact: ['^(提交|确认提交|确定提交)$'],
      loose: ['提交'],
      negative: ['确认发布|确定发布|直接发布|立即发布|发布成功|存草稿|保存草稿|取消|下一步|上一步'],
      requiredContext: ['错别字|错字|病句|语病|校对|纠错|错词|别字'],
      contextBoost: ['错别字|错字|病句|语病|校对|纠错|错词|别字']
    },
    risk_cancel: {
      label: '风险检测取消/仅基础检测',
      actionKey: 'risk_cancel',
      exact: ['^(取消|暂不处理|继续修改|返回修改|稍后检测|不检测|仅基础检测)$'],
      loose: ['取消|暂不处理|返回修改|继续修改|稍后检测|不检测|仅基础检测'],
      negative: ['确认发布|确定发布|直接发布|立即发布|存草稿|保存草稿|下一步|上一步'],
      requiredContext: ['内容风险|风险检测|风险提示|安全检测|违规|敏感|审核提示|存在风险|AI生成'],
      contextBoost: ['内容风险|风险检测|风险提示|安全检测|违规|敏感|审核提示|存在风险|AI生成']
    },
    typo_cancel: {
      label: '错别字检测取消',
      actionKey: 'typo_cancel',
      exact: ['^(取消)$'],
      loose: ['取消'],
      negative: ['确认发布|确定发布|直接发布|立即发布|存草稿|保存草稿|下一步|上一步|提交|确定'],
      contextBoost: ['发布提示|错别字未修改|是否确定提交']
    },
    use_ai: {
      label: '使用AI',
      actionKey: 'use_ai',
      exact: ['^(是|使用\\s*AI|使用AI|AI\\s*润色|AI辅助)$'],
      loose: ['使用\\s*AI|AI\\s*辅助|AI润色|智能辅助'],
      negative: ['^(否)$|不使用|无需|不用|取消|关闭|手动|自行'],
      requiredContext: ['发布设置|是否使用\\s*AI|使用\\s*AI'],
      contextBoost: ['发布设置|发布方式|是否使用\\s*AI|使用\\s*AI|AI']
    },
    confirm_publish: {
      label: '确认发布',
      actionKey: 'confirm_publish',
      exact: ['^(确认发布|确定发布|确认提交|确认)$'],
      loose: ['确认发布|确定发布|立即发布|提交发布'],
      negative: ['取消|存草稿|保存草稿|上一步|下一步|直接发布|关闭|返回'],
      contextBoost: ['发布设置|确认发布|确定发布|使用\\s*AI|发布方式|立即发布']
    },
    back_manage: {
      label: '返回章节管理',
      exact: ['^(返回章节管理|返回章节列表|返回目录|完成|我知道了)$'],
      loose: ['返回章节|章节管理|返回目录|完成|我知道了'],
      negative: ['取消|删除|发布|存草稿|保存草稿']
    }
  };
  const config = actionConfigs[action];
  if (!config) throw new Error(`未知发布流程动作：${action}`);

  const rect = await targetWindow.webContents.executeJavaScript(`
    (() => {
      const config = ${JSON.stringify(config)};
      function normalize(value) { return String(value || '').replace(/\\s+/g, ' ').trim(); }
      function classNameOf(el) {
        const value = el && el.className;
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (value.baseVal) return value.baseVal;
        return String(value);
      }
      function visible(el) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
      }
      function textOf(el) {
        if (!el) return '';
        const aria = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('data-e2e') || '');
        return normalize((el.innerText || el.textContent || el.value || '') + ' ' + aria + ' ' + classNameOf(el));
      }
      function disabledOf(el) {
        return Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true' || /disabled/i.test(classNameOf(el)) || getComputedStyle(el).pointerEvents === 'none');
      }
      function testAny(patterns, text) {
        return (patterns || []).some((pattern) => new RegExp(pattern, 'i').test(text));
      }
      function humanOnly(el) {
        return normalize(el ? (el.innerText || el.textContent || el.value || '') : '');
      }
      function rectCenterPayload(rect, text, reason, candidates) {
        return {
          ok: true,
          text,
          reason,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          candidates: candidates || [{ text, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), score: 999, disabled: false }],
          url: location.href
        };
      }
      function uniqueElements(list) {
        const seen = new Set();
        return list.filter((el) => {
          if (!el || seen.has(el)) return false;
          seen.add(el);
          return true;
        });
      }
      function modalRootOf(el) {
        if (!el) return null;
        return el.closest && (el.closest('.arco-modal,.semi-modal,.byte-modal,[role="dialog"],.modal,.dialog') || el.closest('.arco-modal-wrapper,.semi-modal-wrapper,.byte-modal-wrapper')) || el;
      }
      function findModalByText(requiredPattern, forbiddenPattern) {
        const roots = uniqueElements([
          ...Array.from(document.querySelectorAll('.arco-modal,.semi-modal,.byte-modal,[role="dialog"],.modal,.dialog')),
          ...Array.from(document.querySelectorAll('.arco-modal-header,.arco-modal-title,.arco-modal-content,.arco-modal-footer,.semi-modal-header,.semi-modal-content,.semi-modal-footer')).map(modalRootOf)
        ]).filter(visible);
        return roots
          .map((el) => ({ el, rect: el.getBoundingClientRect(), text: humanOnly(el), zIndex: Number.parseInt(getComputedStyle(el).zIndex, 10) || 0 }))
          .filter((item) => requiredPattern.test(item.text) && (!forbiddenPattern || !forbiddenPattern.test(item.text)))
          .sort((a, b) => (b.zIndex - a.zIndex) || ((a.rect.width * a.rect.height) - (b.rect.width * b.rect.height)))[0]?.el || null;
      }
      function modalFooterOf(scope) {
        return scope && (scope.querySelector('.arco-modal-footer,.semi-modal-footer,.byte-modal-footer') || scope);
      }
      function buttonTextOf(el) {
        return humanOnly(el).replace(/\s+/g, '');
      }
      function findModalFooterButton(scope, pattern, preferPrimary = false) {
        const footer = modalFooterOf(scope);
        const candidates = Array.from(footer.querySelectorAll('button,a,[role="button"]'))
          .filter(visible)
          .map((el) => ({
            el,
            rect: el.getBoundingClientRect(),
            text: buttonTextOf(el),
            classText: classNameOf(el),
            disabled: disabledOf(el)
          }))
          .filter((item) => pattern.test(item.text))
          .map((item) => ({
            ...item,
            score: 800
              + (item.el.tagName && item.el.tagName.toLowerCase() === 'button' ? 120 : 0)
              + (preferPrimary && /primary/i.test(item.classText) ? 120 : 0)
              + (!preferPrimary && /secondary/i.test(item.classText) ? 80 : 0)
              - (item.disabled ? 1000 : 0)
          }))
          .sort((a, b) => b.score - a.score);
        return candidates.find((item) => !item.disabled) || candidates[0] || null;
      }
      function findUseAiYesRadio() {
        const publishModal = findModalByText(/发布设置/, null);
        const scope = publishModal && /是否使用\\s*AI/.test(humanOnly(publishModal)) ? publishModal : document.body;
        const aiLine = Array.from(scope.querySelectorAll('.card-content-line'))
          .filter(visible)
          .find((line) => /是否使用\\s*AI/.test(humanOnly(line)) && /是/.test(humanOnly(line)) && /否/.test(humanOnly(line)));
        const radioScope = aiLine || scope;
        const exactArcoLabels = Array.from(radioScope.querySelectorAll('label.arco-radio'))
          .filter(visible)
          .map((label) => ({
            label,
            input: label.querySelector('input[type="radio"]'),
            mask: label.querySelector('div.arco-radio-mask') || label.querySelector('.arco-radio-mask'),
            text: buttonTextOf(label)
          }))
          .filter((item) => item.input && String(item.input.value) === '1' && /^是$/.test(item.text));
        if (exactArcoLabels[0]) {
          const target = exactArcoLabels[0].mask || exactArcoLabels[0].label;
          return rectCenterPayload(target.getBoundingClientRect(), '发布设置：是否使用AI=是（arco-radio-mask）', 'use_ai_arco_value_1_mask');
        }
        return null;
      }
      function findTypoSubmitButton() {
        const typoModal = findModalByText(/发布提示|检测到你还有错别字未修改|是否确定提交|错别字未修改/, /内容风险|风险检测|风险提示|发布设置|确认发布/);
        if (!typoModal) return null;
        const modalText = humanOnly(typoModal);
        if (!/检测到你还有错别字未修改/.test(modalText) || !/是否确定提交/.test(modalText)) return null;
        const best = findModalFooterButton(typoModal, /^提交$/, true);
        if (!best) return null;
        return rectCenterPayload(best.rect, '错别字检测：提交', 'typo_submit_arco_modal_primary', [{
          text: best.text,
          x: Math.round(best.rect.left + best.rect.width / 2),
          y: Math.round(best.rect.top + best.rect.height / 2),
          score: Math.round(best.score),
          disabled: best.disabled
        }]);
      }
      function findTypoCancelButton() {
        const typoModal = findModalByText(/发布提示|检测到你还有错别字未修改|是否确定提交|错别字未修改/, /内容风险|风险检测|风险提示|发布设置|确认发布/);
        if (!typoModal) return null;
        const modalText = humanOnly(typoModal);
        if (!/检测到你还有错别字未修改/.test(modalText) || !/是否确定提交/.test(modalText)) return null;
        const best = findModalFooterButton(typoModal, /^取消$/, false);
        if (!best) return null;
        return rectCenterPayload(best.rect, '错别字检测：取消', 'typo_cancel_arco_modal_secondary', [{
          text: best.text,
          x: Math.round(best.rect.left + best.rect.width / 2),
          y: Math.round(best.rect.top + best.rect.height / 2),
          score: Math.round(best.score),
          disabled: best.disabled
        }]);
      }
      function findRiskCancelButton() {
        // 先按文案找弹窗
        let riskModal = findModalByText(/内容风险|风险检测|风险提示|安全检测|AI生成内容/, /错别字|发布设置|确认发布/);
        if (!riskModal) {
          // 文案没匹配到，改为根据"仅基础检测"按钮反查弹窗
          const btn = Array.from(document.querySelectorAll('button,a,[role="button"]'))
            .find((el) => {
              if (!visible(el)) return false;
              const t = (el.innerText || el.textContent || '').trim();
              return t === '仅基础检测';
            });
          riskModal = btn ? (btn.closest('.arco-modal,.arco-modal-wrapper,.semi-modal,.byte-modal,[role="dialog"],.modal,.dialog') || btn.closest('.arco-modal-footer,.arco-modal-body')?.closest('.arco-modal')) : null;
        }
        if (!riskModal) return null;
        let best = findModalFooterButton(riskModal, /^仅基础检测$/, false);
        if (best) return rectCenterPayload(best.rect, '内容风险检测：仅基础检测', 'risk_cancel_basic_detection', [{
          text: best.text,
          x: Math.round(best.rect.left + best.rect.width / 2),
          y: Math.round(best.rect.top + best.rect.height / 2),
          score: Math.round(best.score),
          disabled: best.disabled
        }]);
        best = findModalFooterButton(riskModal, /^取消$/, false);
        if (!best) return null;
        return rectCenterPayload(best.rect, '内容风险检测：取消', 'risk_cancel_arco_modal_secondary', [{
          text: best.text,
          x: Math.round(best.rect.left + best.rect.width / 2),
          y: Math.round(best.rect.top + best.rect.height / 2),
          score: Math.round(best.score),
          disabled: best.disabled
        }]);
      }
      function findConfirmPublishButton() {
        const publishModal = findModalByText(/发布设置/, /错别字|内容风险|风险检测/);
        if (!publishModal || !/是否使用\\s*AI/.test(humanOnly(publishModal))) return null;
        const best = findModalFooterButton(publishModal, /^确认发布$/, true);
        if (!best) return null;
        return rectCenterPayload(best.rect, '发布设置：确认发布', 'confirm_publish_arco_modal_primary', [{
          text: best.text,
          x: Math.round(best.rect.left + best.rect.width / 2),
          y: Math.round(best.rect.top + best.rect.height / 2),
          score: Math.round(best.score),
          disabled: best.disabled
        }]);
      }
      const bodyText = normalize(document.body ? document.body.innerText : '');
      if (config.requiredContext && !testAny(config.requiredContext, bodyText)) {
        return { ok: false, message: '未检测到' + config.label + '所需弹窗上下文', candidates: [], url: location.href };
      }
      if (config.actionKey === 'typo_submit') {
        const directTypoSubmit = findTypoSubmitButton();
        if (directTypoSubmit) return directTypoSubmit;
        return { ok: false, message: '未找到错别字检测弹窗中的“提交”按钮，已禁止点击其他提交按钮', candidates: [], url: location.href };
      }
      if (config.actionKey === 'typo_cancel') {
        const directTypoCancel = findTypoCancelButton();
        if (directTypoCancel) return directTypoCancel;
        return { ok: false, message: '未找到错别字检测弹窗中的“取消”按钮，已禁止点击其他按钮', candidates: [], url: location.href };
      }
      if (config.actionKey === 'risk_cancel') {
        const directRiskCancel = findRiskCancelButton();
        if (directRiskCancel) return directRiskCancel;
        return { ok: false, message: '未找到内容风险检测弹窗中的“取消”/“仅基础检测”按钮', candidates: [], url: location.href };
      }
      if (config.actionKey === 'use_ai') {
        const directUseAiRadio = findUseAiYesRadio();
        if (directUseAiRadio) return directUseAiRadio;
        return { ok: false, message: '未找到“发布设置”弹窗中“是否使用AI”的“是”单选圆点，已禁止退回点击其他按钮', candidates: [], url: location.href };
      }
      if (config.actionKey === 'confirm_publish') {
        const directConfirmPublish = findConfirmPublishButton();
        if (directConfirmPublish) return directConfirmPublish;
        return { ok: false, message: '未找到“发布设置”弹窗中的“确认发布”按钮，已禁止点击其他按钮', candidates: [], url: location.href };
      }
      const selectors = 'button,a,label,[role="button"],[role="radio"],input[type="radio"],input[type="checkbox"],span,div';
      const candidates = Array.from(document.querySelectorAll(selectors))
        .filter(visible)
        .map((el) => {
          const target = el.closest('button,a,label,[role="button"],[role="radio"],.semi-radio,.semi-radioGroup,.semi-radio-addon,.byte-radio,.arco-radio') || el;
          const rect = target.getBoundingClientRect();
          const labelText = target.closest('label') ? textOf(target.closest('label')) : '';
          const parentText = target.parentElement ? textOf(target.parentElement) : '';
          const rowText = target.closest('.semi-form-field,.semi-row,.semi-radioGroup,.byte-radio-group,.arco-radio-group') ? textOf(target.closest('.semi-form-field,.semi-row,.semi-radioGroup,.byte-radio-group,.arco-radio-group')) : '';
          const humanText = normalize([
            el.innerText || el.textContent || el.value || '',
            target.innerText || target.textContent || target.value || '',
            target.closest('label') ? (target.closest('label').innerText || target.closest('label').textContent || '') : ''
          ].join(' '));
          const text = normalize([textOf(el), textOf(target), labelText].join(' '));
          const nearText = normalize([humanText, text, parentText, rowText].join(' '));
          let score = 0;
          if (testAny(config.exact, text) || testAny(config.exact, humanText)) score += 320;
          if (testAny(config.loose, text) || testAny(config.loose, humanText)) score += 170;
          if (testAny(config.negative, text) || testAny(config.negative, humanText)) score -= 420;
          if (testAny(config.contextBoost, bodyText)) score += 30;
          if (config.actionKey === 'use_ai') {
            const yesLike = /^是$/.test(humanText) || /^是$/.test(parentText) || (/(^|\\s)是($|\\s)/.test(humanText) && !/否|是否/.test(humanText));
            const noLike = /^否$/.test(humanText) || /^否$/.test(parentText) || /不使用|不用|无需/.test(nearText);
            if (/是否使用\\s*AI|发布设置/.test(nearText) && yesLike) score += 320;
            if (/是否使用\\s*AI/.test(nearText)) score += 70;
            if (/是否使用\\s*AI.*是.*否/.test(nearText) && !yesLike) score -= 260;
            if (/定时发布|关闭定时/.test(nearText)) score -= 220;
            if (noLike) score -= 720;
          }
          if (target.tagName && target.tagName.toLowerCase() === 'button') score += 45;
          if (target.tagName && target.tagName.toLowerCase() === 'label') score += 35;
          if (target.getAttribute && (target.getAttribute('role') === 'button' || target.getAttribute('role') === 'radio')) score += 30;
          if (rect.width >= 40 && rect.width <= 240 && rect.height >= 20 && rect.height <= 70) score += 25;
          if (rect.left > window.innerWidth * 0.45 && rect.top > window.innerHeight * 0.35) score += 18;
          if (text.length > 90) score -= 30;
          if (disabledOf(target)) score -= 1000;
          return { el: target, text: humanText || text || nearText, rect, score, disabled: disabledOf(target) };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      const compact = candidates.slice(0, 10).map((item) => ({
        text: item.text.slice(0, 70),
        x: Math.round(item.rect.left + item.rect.width / 2),
        y: Math.round(item.rect.top + item.rect.height / 2),
        score: Math.round(item.score),
        disabled: item.disabled
      }));
      const best = candidates.find((item) => !item.disabled) || candidates[0];
      if (!best) return { ok: false, message: '未找到可点击的' + config.label + '按钮/选项', candidates: compact, url: location.href };
      return {
        ok: !best.disabled,
        message: best.disabled ? (config.label + '仍处于禁用状态') : '',
        text: best.text.slice(0, 80),
        x: Math.round(best.rect.left + best.rect.width / 2),
        y: Math.round(best.rect.top + best.rect.height / 2),
        width: Math.round(best.rect.width),
        height: Math.round(best.rect.height),
        candidates: compact,
        url: location.href
      };
    })();
  `, true);

  if (!rect || !rect.ok) {
    return rect || { ok: false, message: `没有找到可点击的${config.label}` };
  }

  if (action === 'use_ai') {
    try {
      await targetWindow.webContents.executeJavaScript(`
        (() => {
          const x = ${JSON.stringify(rect.x)};
          const y = ${JSON.stringify(rect.y)};
          const action = ${JSON.stringify(action)};
        const el = document.elementFromPoint(x, y);
        let target = el && (el.closest('button,a,label,[role="button"],[role="radio"],.semi-radio,.semi-radioGroup,.semi-radio-addon,.byte-radio,.arco-radio') || el);
        if (!target) return false;
        if (action === 'use_ai') {
          const label = el.closest('label') || target.closest('label');
          if (label) target = label;
        }
        const rect = target.getBoundingClientRect();
        const cx = action === 'use_ai' ? x : (rect.left + rect.width / 2);
        const cy = action === 'use_ai' ? y : (rect.top + rect.height / 2);
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        try { target.focus && target.focus(); } catch (_) {}
        try { target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: cx, clientY: cy })); } catch (_) {}
        target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
        try { target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: cx, clientY: cy })); } catch (_) {}
        target.click();
        const input = target.matches && target.matches('input[type="radio"],input[type="checkbox"]') ? target : target.querySelector && target.querySelector('input[type="radio"],input[type="checkbox"]');
        if (input) {
          input.checked = true;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.click && input.click();
        }
        return true;
      })();
      `, true);
    } catch (_) {}
  }

  await new Promise((resolve) => setTimeout(resolve, action === 'submit' ? 180 : 120));
  targetWindow.webContents.sendInputEvent({ type: 'mouseMove', x: rect.x, y: rect.y });
  targetWindow.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  targetWindow.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  return { ...rect, ok: true, action, label: config.label };
});

ipcMain.handle('fanqie:control-writer-window', async (_event, action) => {
  const targetWindow = getWriterWindowOrThrow();
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

  emitWriterWindowState('fanqie:writer-window-resized');
  return {
    ok: true,
    open: true,
    url: targetWindow.webContents.getURL(),
    title: targetWindow.webContents.getTitle(),
    isMinimized: targetWindow.isMinimized(),
    isMaximized: targetWindow.isMaximized()
  };
});

ipcMain.handle('fanqie:get-window-state', async () => {
  if (!writerWindow || writerWindow.isDestroyed()) {
    return { open: false, url: '', title: '' };
  }

  return {
    open: true,
    url: writerWindow.webContents.getURL(),
    title: writerWindow.webContents.getTitle(),
    isMinimized: writerWindow.isMinimized(),
    isMaximized: writerWindow.isMaximized()
  };
});

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
      if (targetWindow.isMinimized()) targetWindow.restore();
      else if (typeof targetWindow.showInactive === 'function') targetWindow.showInactive();
      break;
    default:
      throw new Error(`未知作家窗口控制动作：${action}`);
  }
}

ipcMain.handle('qimao:control-writer-window', async (_event, action) => {
  const targetWindow = getWriterWindowOrThrow();
  controlWriterWindow(targetWindow, action);
  emitWriterWindowState('qimao:writer-window-resized');
  return {
    ok: true,
    open: true,
    url: targetWindow.webContents.getURL(),
    title: targetWindow.webContents.getTitle(),
    isMinimized: targetWindow.isMinimized(),
    isMaximized: targetWindow.isMaximized()
  };
});

ipcMain.handle('qimao:get-window-state', async () => {
  if (!writerWindow || writerWindow.isDestroyed()) {
    return { open: false, platform: 'qimao', url: '', title: '' };
  }
  return {
    open: true,
    platform: 'qimao',
    url: writerWindow.webContents.getURL(),
    title: writerWindow.webContents.getTitle(),
    isMinimized: writerWindow.isMinimized(),
    isMaximized: writerWindow.isMaximized()
  };
});

ipcMain.handle('settings:load', async () => {
  return readJsonFile(settingsPath(), {
    removeTitleLine: true,
    recursive: false,
    uploadDelayMs: 2500,
    fanqieUrl: DEFAULT_FANQIE_URL,
    qimaoUrl: DEFAULT_QIMAO_URL
  });
});

ipcMain.handle('settings:save', async (_event, settings) => {
  await writeJsonFile(settingsPath(), settings || {});
  return { ok: true };
});

ipcMain.handle('records:load', async () => {
  return readJsonFile(recordsPath(), []);
});

ipcMain.handle('records:mark-success', async (_event, payload) => {
  const records = await readJsonFile(recordsPath(), []);
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

  await writeJsonFile(recordsPath(), records);
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
