const api = window.novelPublisher;
const DEFAULT_FANQIE_URL = 'https://fanqienovel.com/main/writer/book-manage';
const DEFAULT_QIMAO_URL = 'https://zuozhe.qimao.com/front/index';

let currentPlatform = 'fanqie';

const els = {
  selectFolderBtn: document.getElementById('selectFolderBtn'),
  rescanBtn: document.getElementById('rescanBtn'),
  folderPath: document.getElementById('folderPath'),
  removeTitleLine: document.getElementById('removeTitleLine'),
  recursiveScan: document.getElementById('recursiveScan'),
  uploadDelay: document.getElementById('uploadDelay'),
  publishAction: document.getElementById('publishAction'),
  bookName: document.getElementById('bookName'),
  chapterSearchInput: document.getElementById('chapterSearchInput'),
  chapterJumpBtn: document.getElementById('chapterJumpBtn'),
  minimizeWriterWindowBtn: document.getElementById('minimizeWriterWindowBtn'),
  toggleMaxWriterWindowBtn: document.getElementById('toggleMaxWriterWindowBtn'),
  reloadWriterWindowBtn: document.getElementById('reloadWriterWindowBtn'),
  loginReadyBtn: document.getElementById('loginReadyBtn'),
  chapterPageReadyBtn: document.getElementById('chapterPageReadyBtn'),
  testPageBtn: document.getElementById('testPageBtn'),
  startBtn: document.getElementById('startBtn'),
  uploadSelectedBtn: document.getElementById('uploadSelectedBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  skipCurrentBtn: document.getElementById('skipCurrentBtn'),
  stopBtn: document.getElementById('stopBtn'),
  openWriterBtn: document.getElementById('openWriterBtn'),
  saveReportBtn: document.getElementById('saveReportBtn'),
  minimizeMainWindowBtn: document.getElementById('minimizeMainWindowBtn'),
  toggleMainWindowBtn: document.getElementById('toggleMainWindowBtn'),
  closeMainWindowBtn: document.getElementById('closeMainWindowBtn'),
  selectAllChapters: document.getElementById('selectAllChapters'),
  selectAllVisibleBtn: document.getElementById('selectAllVisibleBtn'),
  clearSelectedBtn: document.getElementById('clearSelectedBtn'),
  invertSelectedBtn: document.getElementById('invertSelectedBtn'),
  chapterTableBody: document.getElementById('chapterTableBody'),
  chapterCount: document.getElementById('chapterCount'),
  writerWindowState: document.getElementById('writerWindowState'),
  writerWindowUrl: document.getElementById('writerWindowUrl'),
  loginState: document.getElementById('loginState'),
  pageState: document.getElementById('pageState'),
  taskState: document.getElementById('taskState'),
  previewModal: document.getElementById('previewModal'),
  previewTitle: document.getElementById('previewTitle'),
  previewMeta: document.getElementById('previewMeta'),
  previewBody: document.getElementById('previewBody'),
  closePreviewBtn: document.getElementById('closePreviewBtn'),
  logBox: document.getElementById('logBox'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  platformSelector: document.getElementById('platformSelector'),
  appTitle: document.getElementById('appTitle'),
  appSubtitle: document.getElementById('appSubtitle'),
  pageTitle: document.getElementById('pageTitle'),
  windowTitle: document.getElementById('windowTitle'),
  windowCaption: document.getElementById('windowCaption'),
  appMark: document.getElementById('appMark')
};

const PLATFORM_INFO = {
  fanqie: {
    name: 'fanqie',
    displayName: '番茄小说',
    defaultUrl: DEFAULT_FANQIE_URL,
    mark: '番',
    appName: '番茄小说草稿上传助手',
    windowCaption: '自动草稿 / 直接发布工作台'
  },
  qimao: {
    name: 'qimao',
    displayName: '七猫小说',
    defaultUrl: DEFAULT_QIMAO_URL,
    mark: '七',
    appName: '七猫小说草稿上传助手',
    windowCaption: '自动草稿 / 完整发布工作台'
  }
};

let settings = {
  removeTitleLine: true,
  recursive: false,
  uploadDelayMs: 2500,
  publishAction: 'draft',
  fanqieUrl: DEFAULT_FANQIE_URL,
  qimaoUrl: DEFAULT_QIMAO_URL,
  platform: 'fanqie'
};

let folderPath = '';
let chapters = [];
let records = [];
let selectedIndex = -1;
let loginConfirmed = false;
let pageConfirmed = false;
let taskRunning = false;
let pauseRequested = false;
let stopRequested = false;
let waitResumeResolve = null;
let skipCurrentRequested = false;

function platformInfo() {
  return PLATFORM_INFO[currentPlatform] || PLATFORM_INFO.fanqie;
}

function platformUrl() {
  return currentPlatform === 'qimao' ? (settings.qimaoUrl || DEFAULT_QIMAO_URL) : (settings.fanqieUrl || DEFAULT_FANQIE_URL);
}

function updatePlatformUI() {
  const info = platformInfo();
  document.title = info.appName;
  if (els.appTitle) els.appTitle.textContent = `${info.displayName}草稿上传助手`;
  if (els.appMark) els.appMark.textContent = info.mark;
  if (els.windowTitle) els.windowTitle.textContent = info.appName;
  if (els.windowCaption) els.windowCaption.textContent = info.windowCaption;
  if (els.appSubtitle) {
    els.appSubtitle.textContent = `先打开${info.displayName}作家助手工作台 → 进入作品章节管理 → 扫描本地章节 → 勾选上传草稿或完整发布`;
  }
  if (els.platformSelector) els.platformSelector.value = currentPlatform;
  log(`切换到${info.displayName}平台`);
}

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function log(message) {
  const line = `[${nowTime()}] ${message}`;
  els.logBox.textContent += `${line}\n`;
  els.logBox.scrollTop = els.logBox.scrollHeight;
}

function setTaskState(text) {
  els.taskState.textContent = `任务：${text}`;
  updateTaskControls();
}

function updateTaskControls() {
  if (!els.startBtn) return;
  els.startBtn.disabled = taskRunning;
  els.uploadSelectedBtn.disabled = taskRunning;
  els.pauseBtn.disabled = !taskRunning || pauseRequested || stopRequested;
  els.resumeBtn.disabled = !taskRunning || !pauseRequested || stopRequested;
  els.skipCurrentBtn.disabled = !taskRunning || stopRequested;
  els.stopBtn.disabled = !taskRunning || stopRequested;
}

function setLoginState(text) {
  els.loginState.textContent = `登录：${text}`;
}

function setPageState(text) {
  els.pageState.textContent = `章节页：${text}`;
}

function currentOptions() {
  return {
    removeTitleLine: els.removeTitleLine.checked,
    recursive: els.recursiveScan.checked
  };
}

function currentSettingsFromUi() {
  return {
    ...settings,
    removeTitleLine: els.removeTitleLine.checked,
    recursive: els.recursiveScan.checked,
    uploadDelayMs: Math.max(500, Number(els.uploadDelay.value || 2500)),
    publishAction: els.publishAction.value || 'draft',
    fanqieUrl: settings.fanqieUrl || DEFAULT_FANQIE_URL,
    qimaoUrl: settings.qimaoUrl || DEFAULT_QIMAO_URL,
    platform: currentPlatform
  };
}

async function persistSettings() {
  settings = currentSettingsFromUi();
  await api.saveSettings(settings);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function statusClass(status) {
  if (status === '已保存草稿' || status === '已发布') return 'status-ok';
  if (status === '上传中') return 'status-busy';
  if (status === '需要人工处理' || status === '已跳过') return 'status-warn';
  if (status === '失败') return 'status-error';
  return '';
}

function textFormatStats(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blankLines = lines.filter((line) => !line.trim()).length;
  let maxContinuousBlank = 0;
  let currentBlank = 0;
  for (const line of lines) {
    if (!line.trim()) {
      currentBlank += 1;
      maxContinuousBlank = Math.max(maxContinuousBlank, currentBlank);
    } else {
      currentBlank = 0;
    }
  }
  return {
    lines: lines.length,
    blankLines,
    blankRatio: lines.length ? blankLines / lines.length : 0,
    maxContinuousBlank
  };
}

function renderChapters() {
  els.chapterCount.textContent = `${chapters.length} 章`;
  const rows = chapters.map((chapter, index) => {
    const selected = index === selectedIndex ? 'selected' : '';
    const statusTitle = chapter.errorMessage ? `${chapter.status}：${chapter.errorMessage}` : chapter.status;
    const checked = chapter.checked === true ? 'checked' : '';
    return `
      <tr class="${selected}" data-index="${index}">
        <td class="check-col"><input class="chapter-check" data-index="${index}" type="checkbox" ${checked} /></td>
        <td class="narrow">${chapter.index}</td>
        <td class="file-col" title="${escapeHtml(chapter.filePath)}">${escapeHtml(chapter.fileName)}</td>
        <td class="title-col"><input class="title-editor" data-index="${index}" type="text" value="${escapeHtml(chapter.title)}" /></td>
        <td class="narrow">${chapter.wordCount}</td>
        <td class="status-col ${statusClass(chapter.status)}" title="${escapeHtml(statusTitle)}">${escapeHtml(chapter.status)}</td>
        <td class="action-col"><button class="tiny view-chapter-btn" data-index="${index}" type="button">查看</button></td>
      </tr>
    `;
  });
  els.chapterTableBody.innerHTML = rows.join('');

  if (els.selectAllChapters) {
    const checkedCount = chapters.filter((chapter) => chapter.checked === true).length;
    els.selectAllChapters.checked = chapters.length > 0 && checkedCount === chapters.length;
    els.selectAllChapters.indeterminate = checkedCount > 0 && checkedCount < chapters.length;
  }
}

function showChapterPreview(index) {
  const chapter = chapters[index];
  if (!chapter) return;
  selectedIndex = index;
  renderChapters();
  const stats = textFormatStats(chapter.body || '');
  els.previewTitle.textContent = chapter.title || chapter.fileName || '章节预览';
  els.previewMeta.textContent = `文件：${chapter.fileName} ｜ 字数：${chapter.wordCount} ｜ 行数：${stats.lines} ｜ 空行：${stats.blankLines} ｜ 最多连续空行：${stats.maxContinuousBlank} ｜ 路径：${chapter.filePath}`;
  els.previewBody.textContent = chapter.body || '';
  els.previewModal.classList.remove('hidden');
}

function hideChapterPreview() {
  els.previewModal.classList.add('hidden');
}

function applyHistoricalRecords() {
  const bookName = els.bookName.value.trim();
  const recordMap = new Map();
  for (const record of records) {
    if (record.platform && record.platform !== currentPlatform) continue;
    if (bookName && record.bookName && record.bookName !== bookName) continue;
    recordMap.set(record.contentHash, record);
  }

  chapters = chapters.map((chapter) => {
    if (recordMap.has(chapter.contentHash)) {
      return { ...chapter, status: '已保存草稿', errorMessage: '历史记录显示该章已保存草稿' };
    }
    return chapter;
  });
}

async function scanCurrentFolder() {
  if (!folderPath) {
    log('请先选择章节文件夹。');
    return;
  }

  await persistSettings();
  setTaskState('扫描章节');
  log(`开始扫描章节文件夹：${folderPath}`);
  try {
    chapters = (await api.scanChapters({ folderPath, options: currentOptions() })).map((chapter) => ({
      ...chapter,
      checked: false
    }));
    selectedIndex = chapters.length ? 0 : -1;
    applyHistoricalRecords();
    renderChapters();
    log(`扫描完成：共 ${chapters.length} 个 .txt/.md 章节文件。默认不勾选，需手动选择要上传的章节。`);
    log('说明：本工具只读扫描本地文件，不会修改原文件；.md 会按发布平台正文格式转换，自动去掉 Markdown 段落空行、标题符号和 frontmatter。');
    const suspiciousSpacing = chapters.filter((chapter) => {
      const stats = textFormatStats(chapter.body || '');
      return stats.lines > 20 && (stats.blankRatio > 0.35 || stats.maxContinuousBlank >= 4);
    });
    if (suspiciousSpacing.length) {
      log(`检测到 ${suspiciousSpacing.length} 章源文件空行偏多，可点击“查看”确认是否原文自带多余换行。`);
    }
    if (!chapters.length) {
      log('没有发现章节文件，请确认文件扩展名是 .txt、.md 或 .markdown。');
    }
  } catch (error) {
    log(`扫描失败：${error.message}`);
  } finally {
    setTaskState('空闲');
  }
}

function updateWriterWindowState(state) {
  if (!state || !state.open) {
    els.writerWindowState.textContent = '作家窗口：未打开';
    els.writerWindowUrl.textContent = '当前作家窗口地址：尚未打开';
    return;
  }

  const windowMode = state.isMinimized ? '已最小化' : (state.isMaximized ? '已最大化' : '已打开');
  els.writerWindowState.textContent = `作家窗口：${windowMode}`;
  els.writerWindowUrl.textContent = `当前作家窗口地址：${state.url || '加载中'}`;
}

async function openWriterWindow(url) {
  const info = platformInfo();
  const target = url || platformUrl();
  if (currentPlatform === 'qimao') {
    await api.openQimaoWriterWindow({ url: target });
  } else {
    await api.openFanqieWriterWindow({ url: target });
  }
  updateWriterWindowState({ open: true, url: target, title: `${info.displayName}作家助手工作台` });
  log(`已打开${info.displayName}作家助手工作台：${target}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureTaskNotStopped() {
  if (stopRequested) throw new Error('用户已请求停止任务');
}

async function sleepWithStop(ms, step = 250) {
  const endAt = Date.now() + ms;
  while (Date.now() < endAt) {
    ensureTaskNotStopped();
    await sleep(Math.min(step, Math.max(0, endAt - Date.now())));
  }
}

function writerApi() {
  return currentPlatform === 'qimao' ? {
    executeJs: api.executeInQimaoWindow,
    executeJsSafe: api.executeInQimaoWindowSafe,
    clickSaveDraft: null,
    clickWorkflowAction: null,
    getWindowState: api.getQimaoWindowState,
    controlWindow: api.controlQimaoWriterWindow,
    reloadWindow: api.reloadQimaoWriterWindow
  } : {
    executeJs: api.executeInFanqieWindow,
    executeJsSafe: api.executeInFanqieWindowSafe,
    clickSaveDraft: api.clickFanqieSaveDraft,
    clickWorkflowAction: api.clickFanqieWorkflowAction,
    getWindowState: api.getFanqieWindowState,
    controlWindow: api.controlFanqieWriterWindow,
    reloadWindow: api.reloadFanqieWriterWindow
  };
}

async function executeInWriterWindow(script) {
  return writerApi().executeJs(script);
}

async function executeInWriterWindowSafe(script) {
  const safe = writerApi().executeJsSafe;
  if (!safe) return executeInWriterWindow(script);
  const result = await safe(script);
  if (result?.ok) return result.value;
  const message = result?.message || '脚本暂时无法执行';
  throw new Error(`${message}；当前地址：${result?.url || '未知'}`);
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function waitForWriterDomStable(stableMs = 1000, timeout = 12000) {
  const start = Date.now();
  let lastSignature = '';
  let stableStart = 0;

  while (Date.now() - start < timeout) {
    ensureTaskNotStopped();
    try {
      const info = await withTimeout(
        executeInWriterWindowSafe(`(() => {
          const text = document.body ? document.body.innerText || '' : '';
          const buttons = document.querySelectorAll('button,a,[role="button"],label,[role="radio"]').length;
          const masks = document.querySelectorAll('.semi-modal,.semi-modal-content,.semi-toast,.semi-spin,.byte-modal,.arco-modal').length;
          return {
            readyState: document.readyState,
            url: location.href,
            textLength: text.length,
            buttons,
            masks
          };
        })()`),
        3500,
        '等待页面稳定超时'
      );
      if (info?.readyState && info.readyState !== 'loading') {
        const signature = `${info.url}|${info.textLength}|${info.buttons}|${info.masks}`;
        if (signature === lastSignature) {
          if (!stableStart) stableStart = Date.now();
          if (Date.now() - stableStart >= stableMs) return info;
        } else {
          lastSignature = signature;
          stableStart = Date.now();
        }
      }
    } catch (_) {
      lastSignature = '';
      stableStart = 0;
    }
    await sleepWithStop(450);
  }
  return null;
}

async function getWriterStateSafe() {
  try {
    const state = await writerApi().getWindowState();
    updateWriterWindowState(state);
    return state;
  } catch (_) {
    return null;
  }
}

async function waitForWriterPageReady(urlPattern = /\/publish\//, timeout = 45000) {
  const start = Date.now();
  let lastUrl = '';
  while (Date.now() - start < timeout) {
    ensureTaskNotStopped();
    const state = await getWriterStateSafe();
    lastUrl = state?.url || lastUrl;
    if (state?.open && (!urlPattern || urlPattern.test(state.url || ''))) {
      try {
        const ready = await withTimeout(
          executeInWriterWindowSafe('({ readyState: document.readyState, url: location.href, hasBody: Boolean(document.body) })'),
          3500,
          '等待页面脚本环境超时'
        );
        if (ready?.hasBody && ready.readyState !== 'loading') {
          await sleepWithStop(700);
          return { ...state, url: ready.url || state.url };
        }
      } catch (_) {
        // 页面仍在跳转或脚本环境暂不可用，继续轮询。
      }
    }
    await sleepWithStop(500);
  }
  throw new Error(`等待作家页面加载超时，最后地址：${lastUrl || '未知'}`);
}

async function clickFinalActionWithRetry(action = 'draft', timeout = 16000) {
  if (action === 'none') {
    log('完成后动作设置为“只填写不点击”，已跳过存草稿/发布按钮点击。');
    return { ok: true, skipped: true, text: '只填写不点击' };
  }

  const label = action === 'next' ? '下一步/直接发布' : '存草稿';
  const start = Date.now();
  let lastMessage = '';
  while (Date.now() - start < timeout) {
    await waitForWriterDomStable(900, 9000);
    const result = await api.clickFanqieSaveDraft(action);
    if (result?.ok) {
      log(`已点击${label}按钮：${result.text || label}`);
      await sleepWithStop(action === 'next' ? 2800 : 3600);
      await waitForWriterDomStable(1000, 12000);
      return result;
    }
    lastMessage = result?.message || `未找到可点击的${label}按钮`;
    if (result?.candidates?.length) {
      log(`按钮候选：${result.candidates.map((item) => `${item.text}@${item.x},${item.y},${item.score}`).join(' / ')}`);
    }
    await sleepWithStop(900);
  }
  throw new Error(lastMessage || `点击${label}超时`);
}

function buildWorkflowSnapshotScript() {
  return `
    (() => {
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
      function human(el) { return normalize(el ? (el.innerText || el.textContent || el.value || '') : ''); }
      const visibleElements = Array.from(document.querySelectorAll('button,a,label,[role="button"],[role="radio"],input,span,div')).filter(visible);
      const controls = visibleElements.map((el) => ({
        text: human(el),
        tag: el.tagName ? el.tagName.toLowerCase() : '',
        className: classNameOf(el),
        role: el.getAttribute ? el.getAttribute('role') || '' : ''
      })).filter((item) => item.text && item.text.length <= 80);
      const buttonTexts = controls
        .filter((item) => /button|a|label/.test(item.tag) || item.role === 'button' || item.role === 'radio' || /btn|button|radio/.test(item.className))
        .map((item) => item.text);
      const allText = normalize(visibleElements.map((el) => human(el)).filter(Boolean).join(' '));
      const riskVisible = /内容风险|风险检测|风险提示|安全检测|AI生成/.test(allText) && /取消|确定|仅基础检测/.test(allText);
      const publishSettingVisible = /发布设置/.test(allText) && /是否使用\\s*AI/.test(allText);
      const typoContextVisible = /错别字|错字|病句|语病|校对|纠错|错词|别字/.test(allText) && !riskVisible;
      const typoSubmitVisible = typoContextVisible && buttonTexts.some((text) => /^(提交|确认提交|确定提交)$/.test(text));
      const confirmPublishVisible = buttonTexts.some((text) => /确认发布|确定发布|立即发布|提交发布/.test(text));
      let useAiYesFound = false;
      let useAiChecked = false;
      const labels = Array.from(document.querySelectorAll('label.arco-radio,label,[role="radio"]')).filter(visible);
      for (const label of labels) {
        const labelText = human(label);
        const input = label.querySelector ? label.querySelector('input[type="radio"]') : null;
        const isYes = /^是$/.test(labelText) || (input && String(input.value) === '1' && /是/.test(labelText));
        if (!isYes) continue;
        useAiYesFound = true;
        const checked = Boolean((input && input.checked) || label.getAttribute('aria-checked') === 'true' || /checked/i.test(classNameOf(label)));
        if (checked) useAiChecked = true;
      }
      return {
        url: location.href,
        readyState: document.readyState,
        riskVisible,
        publishSettingVisible,
        typoContextVisible,
        typoSubmitVisible,
        confirmPublishVisible,
        useAiYesFound,
        useAiChecked,
        buttonTexts: buttonTexts.slice(0, 30)
      };
    })();
  `;
}

async function getWorkflowSnapshot() {
  try {
    return await withTimeout(executeInWriterWindowSafe(buildWorkflowSnapshotScript()), 4000, '读取发布流程状态超时');
  } catch (error) {
    return { error: error.message || String(error) };
  }
}

function isWorkflowActionSettled(action, snapshot) {
  if (!snapshot || snapshot.error) return false;
  if (action === 'submit') return !snapshot.typoSubmitVisible || snapshot.riskVisible || snapshot.publishSettingVisible;
  if (action === 'risk_cancel') return !snapshot.riskVisible || snapshot.publishSettingVisible;
  if (action === 'use_ai') return snapshot.publishSettingVisible && snapshot.useAiYesFound && snapshot.useAiChecked;
  if (action === 'confirm_publish') return !snapshot.confirmPublishVisible;
  return true;
}

async function waitAfterWorkflowAction(action, timeout = 16000) {
  const start = Date.now();
  let lastSnapshot = null;
  while (Date.now() - start < timeout) {
    ensureTaskNotStopped();
    lastSnapshot = await getWorkflowSnapshot();
    if (isWorkflowActionSettled(action, lastSnapshot)) {
      return { ok: true, snapshot: lastSnapshot };
    }
    await sleepWithStop(900);
  }
  return { ok: false, snapshot: lastSnapshot };
}

async function clickWorkflowActionWithRetry(action, label, timeout = 12000, options = {}) {
  const {
    optional = false,
    waitAfterMs = 2600,
    minWaitBeforeSkipMs = 5000,
    stableMs = 900,
    clickOnce = action === 'submit'
  } = options;
  const start = Date.now();
  let lastMessage = '';
  let lastCandidates = [];

  while (Date.now() - start < timeout) {
    try {
      await waitForWriterDomStable(stableMs, 10000);
      const result = await api.clickFanqieWorkflowAction(action);
      if (result?.ok) {
        log(`已处理发布流程：${label}（${result.text || result.label || label}）`);
        await sleepWithStop(waitAfterMs);
        await waitForWriterDomStable(900, 12000);
        const settled = await waitAfterWorkflowAction(action, Math.max(9000, waitAfterMs + 8000));
        if (settled.ok) return result;

        if (clickOnce) {
          log(`已点击${label}一次，为避免重复弹窗/重复提交，不再二次点击，继续等待后续流程。`);
          await waitAfterWorkflowAction(action, 6000);
          return result;
        }

        if (action !== 'use_ai') return result;

        lastMessage = '已点击“是”前面的单选圆点，但页面未显示“是”已选中，准备重试';
        lastCandidates = result?.candidates || lastCandidates;
        await sleepWithStop(1100);
        continue;
      }

      lastMessage = result?.message || `未找到${label}`;
      lastCandidates = result?.candidates || lastCandidates;
      if (optional && /(未检测到.*所需弹窗上下文|未找到.*弹窗中的.*按钮|已禁止点击其他按钮)/.test(lastMessage) && Date.now() - start >= minWaitBeforeSkipMs) break;
    } catch (error) {
      lastMessage = error.message || String(error);
    }
    await sleepWithStop(1100);
  }

  if (optional) {
    log(`未检测到可选步骤：${label}，已跳过。${lastMessage ? `原因：${lastMessage}` : ''}`);
    return { ok: true, skipped: true, optional: true, message: lastMessage };
  }

  if (lastCandidates.length) {
    log(`发布流程候选：${lastCandidates.map((item) => `${item.text}@${item.x},${item.y},${item.score}`).join(' / ')}`);
  }
  throw new Error(lastMessage || `${label}处理超时`);
}

async function dismissLingeringTypoDialog(reason = '检测到残留错别字提示') {
  try {
    const result = await api.clickFanqieWorkflowAction('typo_cancel');
    if (result?.ok) {
      log(`${reason}，已点击取消。`);
      await sleepWithStop(700);
      await waitForWriterDomStable(400, 3000);
      return true;
    }
  } catch (_) {
    // 页面跳转瞬间可能暂时无法执行脚本，忽略即可。
  }
  return false;
}

function isChapterManageCompletion(info) {
  return Boolean(
    info?.hardChapterManageUrl
    || info?.isManageLike
    || (info?.hasNewChapter && !info?.stillInPublishStep)
    || (info?.hasSuccess && info?.manageTextLike && !info?.stillInPublishStep)
  );
}

function buildPublishCompletionDetectionScript() {
  return `
    (() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      function visible(el) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0
          && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.opacity !== '0'
          && rect.bottom >= 0
          && rect.right >= 0
          && rect.top <= window.innerHeight
          && rect.left <= window.innerWidth;
      }
      const human = (el) => normalize(el ? (el.innerText || el.textContent || el.value || '') : '');
      const visibleElements = Array.from(document.querySelectorAll('body *')).filter(visible);
      const text = normalize(visibleElements.map((el) => human(el)).filter(Boolean).join(' '));
      const buttons = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'))
        .filter(visible)
        .map((el) => normalize(el.innerText || el.textContent || ''))
        .filter((value) => value && value.length <= 60)
        .slice(0, 160);
      const modalTexts = Array.from(document.querySelectorAll('.arco-modal,.semi-modal,.byte-modal,[role="dialog"],.modal,.dialog'))
        .filter(visible)
        .map((el) => human(el));
      const url = location.href;
      const isEditor = /\/publish\//.test(url);
      const hardChapterManageUrl = /\/chapter-manage\//.test(url);
      const hasNewChapter = buttons.some((value) => /新建章节|新增章节|创建章节|写新章节|添加章节|发布章节|新建章/.test(value));
      const hasSuccess = /发布成功|提交成功|发布完成|章节发布成功|已成功发布|操作成功|已发布/.test(text);
      const hasRisk = modalTexts.some((value) => /内容风险|风险检测|风险提示|安全检测|AI生成|违规|敏感|存在风险/.test(value));
      const hasTypoConfirm = modalTexts.some((value) => /检测到你还有错别字未修改|错别字未修改|是否确定提交/.test(value) && /取消/.test(value) && /提交/.test(value));
      const publishSettingVisible = modalTexts.some((value) => /发布设置/.test(value) && /是否使用\\s*AI/.test(value));
      const hasConfirmPublish = publishSettingVisible && buttons.some((value) => /^确认发布$|^确定发布$/.test(value));
      const manageTextLike = /作品目录|作品管理|章节管理|章节目录|目录管理|章节列表|分卷|卷名|新建章节|新增章节|新建章|已发布|草稿箱|草稿/.test(text)
        || (/章节/.test(text) && /目录|新建|分卷|卷|已发布|草稿|字数|更新时间|操作/.test(text));
      const manageUrlLike = /book-manage|chapter-manage|chapter|volume|catalog|directory|目录|章节管理/.test(url);
      const stillInPublishStep = hasRisk || hasTypoConfirm || hasConfirmPublish || publishSettingVisible;
      const isManageLike = !stillInPublishStep && (hardChapterManageUrl || manageTextLike || hasNewChapter || manageUrlLike || (hasSuccess && /章节|目录|作品/.test(text)));
      return {
        url,
        title: document.title,
        isEditor,
        hardChapterManageUrl,
        isManageLike,
        manageTextLike,
        manageUrlLike,
        stillInPublishStep,
        hasNewChapter,
        hasSuccess,
        hasRisk,
        hasTypoConfirm,
        publishSettingVisible,
        hasConfirmPublish,
        sampleButtons: buttons.slice(0, 24),
        sampleModals: modalTexts.slice(0, 4)
      };
    })();
  `;
}

async function detectPublishCompletion() {
  let state = null;
  try {
    state = await getWriterStateSafe();
    const info = await withTimeout(
      executeInWriterWindowSafe(buildPublishCompletionDetectionScript()),
      4000,
      '检测发布完成状态超时'
    );
    const url = info?.url || state?.url || '';
    if (/\/chapter-manage\//.test(url) && !info?.stillInPublishStep) {
      return { ...(info || {}), url, hardChapterManageUrl: true, isManageLike: true };
    }
    return { ...(info || {}), url };
  } catch (error) {
    const url = state?.url || '';
    if (/\/chapter-manage\//.test(url)) {
      return {
        error: error.message || String(error),
        url,
        hardChapterManageUrl: true,
        isManageLike: true,
        stillInPublishStep: false,
        sampleButtons: []
      };
    }
    return { error: error.message || String(error), url };
  }
}

async function waitForDirectPublishCompletion(timeout = 70000) {
  const start = Date.now();
  let successLogged = false;
  let lastInfo = null;

  while (Date.now() - start < timeout) {
    ensureTaskNotStopped();
    const info = await detectPublishCompletion();
    lastInfo = info;

    if (info?.hasSuccess && !successLogged) {
      successLogged = true;
      log('检测到发布成功/提交成功提示，等待返回章节管理页。');
      await clickWorkflowActionWithRetry('back_manage', '返回章节管理/关闭成功提示', 5000, { optional: true, waitAfterMs: 1500 });
    }

    if (isChapterManageCompletion(info)) {
      await dismissLingeringTypoDialog('章节管理页上检测到残留错别字提示');
      log(`已回到章节管理相关页面：${info.url || '未知地址'}`);
      return { ok: true, info };
    }

    if (info?.hasTypoConfirm) {
      await dismissLingeringTypoDialog('发布流程中检测到错别字取消提示');
      const afterDismiss = await detectPublishCompletion();
      if (isChapterManageCompletion(afterDismiss)) {
        log(`已回到章节管理相关页面：${afterDismiss.url || '未知地址'}`);
        return { ok: true, info: afterDismiss };
      }
      return {
        ok: false,
        needRetryNext: true,
        info: afterDismiss,
        message: '已取消错别字提示，需要重新点击下一步继续发布流程'
      };
    }

    if (info?.hasRisk) {
      await clickWorkflowActionWithRetry('risk_cancel', '内容风险检测取消', 14000, { optional: true, waitAfterMs: 3200, minWaitBeforeSkipMs: 9000 });
    }

    await sleepWithStop(1200);
  }

  throw new Error(`等待发布完成并返回章节管理页超时，最后地址：${lastInfo?.url || '未知'}，最后按钮：${(lastInfo?.sampleButtons || []).slice(0, 8).join(' / ')}`);
}

async function runDirectPublishFlow() {
  log('开始执行完整发布流程：下一步 → 可选错别字提交 → 可选风险取消 → 使用AI → 确认发布。');
  let lastMessage = '';
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    ensureTaskNotStopped();
    if (attempt > 1) {
      log(`未检测到发布设置或流程被弹窗取消，重新点击下一步继续发布流程（第 ${attempt}/${maxAttempts} 次）。`);
    }

    await clickFinalActionWithRetry('next', attempt === 1 ? 26000 : 14000);
    await clickWorkflowActionWithRetry('submit', '错别字检测提交', 6500, { optional: true, waitAfterMs: 1500, minWaitBeforeSkipMs: 2600, clickOnce: true, stableMs: 450 });
    await clickWorkflowActionWithRetry('risk_cancel', '内容风险检测取消', 8500, { optional: true, waitAfterMs: 1500, minWaitBeforeSkipMs: 3200, stableMs: 450 });

    const useAiResult = await clickWorkflowActionWithRetry('use_ai', '发布设置选择“使用AI-是”', 9000, { optional: true, waitAfterMs: 1400, minWaitBeforeSkipMs: 3600, stableMs: 600 });
    if (useAiResult?.skipped) {
      lastMessage = useAiResult.message || '未检测到发布设置弹窗';
      const currentInfo = await detectPublishCompletion();
      if (isChapterManageCompletion(currentInfo)) return { ok: true, info: currentInfo };
      await dismissLingeringTypoDialog('未检测到发布设置前发现错别字取消提示');
      continue;
    }

    await clickWorkflowActionWithRetry('confirm_publish', '确认发布', 16000, { waitAfterMs: 1600, stableMs: 650 });

    try {
      const completion = await waitForDirectPublishCompletion(attempt === maxAttempts ? 75000 : 26000);
      if (completion?.ok) return completion;
      if (completion?.needRetryNext) {
        lastMessage = completion.message || '发布流程需要重新点击下一步';
        continue;
      }
    } catch (error) {
      lastMessage = error.message || String(error);
      const currentInfo = await detectPublishCompletion();
      if (isChapterManageCompletion(currentInfo)) return { ok: true, info: currentInfo };
      if (attempt === maxAttempts) throw error;
    }
  }

  throw new Error(lastMessage || '多次重新点击下一步后仍未完成发布流程');
}

function buildPageDetectionScript() {
  return `
    (() => {
      const text = document.body ? document.body.innerText : '';
      const buttons = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'))
        .map(el => (el.innerText || el.textContent || '').trim())
        .filter(t => t && t.length <= 30)
        .slice(0, 120);
      const hasNewChapter = buttons.some(t => /新建章节|新增章节|创建章节|写新章节|添加章节|发布章节/.test(t));
      const hasDraft = /草稿|保存/.test(text);
      const mayNeedLogin = /登录|扫码|验证码|验证/.test(text) && !hasNewChapter;
      return {
        url: location.href,
        title: document.title,
        hasNewChapter,
        hasDraft,
        mayNeedLogin,
        editableCount: document.querySelectorAll('[contenteditable="true"]').length,
        textareaCount: document.querySelectorAll('textarea').length,
        inputCount: document.querySelectorAll('input').length,
        sampleButtons: buttons.slice(0, 30)
      };
    })();
  `;
}

function buildClickNewChapterScript() {
  return `(${function clickNewChapterInWriterPage() {
    function normalize(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }
    function visible(el) {
      if (!el || typeof el.getBoundingClientRect !== 'function') return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }
    function textOf(el) {
      return normalize((el.innerText || el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || ''));
    }
    function clickAt(el) {
      const target = el.closest('button,a,[role="button"],[tabindex]') || el;
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
      target.click();
    }
    const candidates = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'))
      .filter(visible)
      .map((el) => {
        const text = textOf(el);
        let score = 0;
        if (text === '新建章节') score += 220;
        if (/新建章节|新增章节|创建章节|写新章节|添加章节|发布章节|新建章/.test(text)) score += 160;
        if (/章节管理|章节列表|作品管理|草稿|发布记录/.test(text)) score -= 120;
        return { el, text, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!candidates.length) {
      return { ok: false, message: '未找到“新建章节”按钮', url: location.href };
    }
    clickAt(candidates[0].el);
    return { ok: true, message: '已点击新建章节', buttonText: candidates[0].text, url: location.href };
  }.toString()})();`;
}

function chineseNumberToArabic(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (/^\d+$/.test(source)) return source;
  const digitMap = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (/^[零〇一二两三四五六七八九]+$/.test(source)) {
    return Array.from(source).map((char) => digitMap[char] ?? '').join('');
  }
  let total = 0;
  let section = 0;
  let number = 0;
  const unitMap = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  for (const char of source) {
    if (digitMap[char] !== undefined) {
      number = digitMap[char];
    } else if (unitMap[char]) {
      const unit = unitMap[char];
      if (unit === 10000) {
        section = (section + number) * unit;
        total += section;
        section = 0;
      } else {
        section += (number || 1) * unit;
      }
      number = 0;
    }
  }
  const value = total + section + number;
  return value > 0 ? String(value) : source;
}

function parseChapterTitleParts(title) {
  const raw = String(title || '').trim();
  const match = raw.match(/^第\s*([0-9０-９零〇一二两三四五六七八九十百千万]+)\s*[章节张回]\s*[\s、:：.．\-—]*(.*)$/u);
  if (!match) return { titleNumber: '', titleText: raw };
  const numberText = match[1].replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
  const titleText = (match[2] || '').trim() || raw;
  return {
    titleNumber: chineseNumberToArabic(numberText),
    titleText
  };
}

function normalizeUploadContent(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trimEnd();
}

function buildUploadScript(title, content, options = {}) {
  const titleParts = parseChapterTitleParts(title);
  const payload = {
    title,
    titleNumber: titleParts.titleNumber,
    titleText: titleParts.titleText,
    content: normalizeUploadContent(content),
    shouldClickNew: options.clickNew !== false,
    saveDraft: options.saveDraft !== false
  };

  return `(${function runNovelPublisherUpload(payload) {
    return (async () => {
      const { title, titleNumber, titleText, content, shouldClickNew, saveDraft } = payload;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const result = { ok: false, step: '初始化', message: '', details: {} };

      function stage(name) {
        result.step = name;
        try { console.log('[小说上传助手] ' + name); } catch (_) {}
      }

      function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
      }

      function compactText(value) {
        return String(value || '').replace(/\s+/g, '').trim();
      }

      function shortText(value, length) {
        const text = compactText(value);
        return text.slice(0, Math.min(length, text.length));
      }

      function rectCenter(rect) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }

      function allDocuments() {
        const docs = [document];
        for (const frame of Array.from(document.querySelectorAll('iframe,frame'))) {
          try {
            if (frame.contentDocument) docs.push(frame.contentDocument);
          } catch (_) {}
        }
        return docs;
      }

      function queryAll(selector) {
        const nodes = [];
        for (const doc of allDocuments()) {
          try { nodes.push(...Array.from(doc.querySelectorAll(selector))); } catch (_) {}
        }
        return nodes;
      }

      function ownerWindow(el) {
        return el && el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView : window;
      }

      function visible(el) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const win = ownerWindow(el);
        const style = win.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }

      function isEditableElement(el) {
        if (!el || !el.tagName) return false;
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (tag === 'textarea') return true;
        if (tag === 'input' && !['hidden', 'button', 'submit', 'checkbox', 'radio', 'file'].includes(type)) return true;
        const editableAttr = el.getAttribute('contenteditable');
        if (editableAttr !== null && editableAttr !== 'false') return true;
        if (el.isContentEditable) return true;
        if ((el.getAttribute('role') || '').toLowerCase() === 'textbox') return true;
        return false;
      }

      function disabled(el) {
        return Boolean(el && (el.disabled || el.getAttribute('aria-disabled') === 'true' || String(el.className || '').includes('disabled')));
      }

      function nodeText(el) {
        return normalizeText(el && (el.innerText || el.textContent || ''));
      }

      function ownText(el) {
        if (!el) return '';
        const parts = [
          el.getAttribute && (el.getAttribute('placeholder') || ''),
          el.getAttribute && (el.getAttribute('data-placeholder') || ''),
          el.getAttribute && (el.getAttribute('aria-placeholder') || ''),
          el.getAttribute && (el.getAttribute('aria-label') || ''),
          el.getAttribute && (el.getAttribute('name') || ''),
          el.getAttribute && (el.getAttribute('id') || '')
        ];
        const text = nodeText(el);
        if (text && text.length <= 180) parts.push(text);
        return normalizeText(parts.filter(Boolean).join(' '));
      }

      function surroundingText(el) {
        const texts = [];
        let node = el;
        for (let i = 0; node && i < 5; i += 1) {
          const text = nodeText(node);
          if (text && text.length <= 500) texts.push(text);
          node = node.parentElement;
        }
        return normalizeText(texts.join(' '));
      }

      function inputMeta(el) {
        return normalizeText([
          ownText(el),
          String(el && el.className || ''),
          surroundingText(el)
        ].join(' '));
      }

      function clickableElement(el) {
        if (!el) return null;
        return el.closest && (el.closest('button,a,[role="button"],[tabindex]') || el);
      }

      function clickAtElement(el) {
        if (!el || disabled(el)) return false;
        const rect = el.getBoundingClientRect();
        const x = rect.left + Math.min(Math.max(rect.width * 0.45, 8), Math.max(rect.width - 4, 8));
        const y = rect.top + Math.min(Math.max(rect.height * 0.55, 8), Math.max(rect.height - 4, 8));
        return clickAtPoint(el.ownerDocument || document, x, y, el);
      }

      function clickAtPoint(doc, x, y, fallbackEl) {
        const win = doc.defaultView || window;
        const target = doc.elementFromPoint(x, y) || fallbackEl;
        if (!target) return false;
        try { fallbackEl && fallbackEl.scrollIntoView && fallbackEl.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
        try { target.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'mouse' })); } catch (_) {}
        target.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        target.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
        target.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
        try { target.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'mouse' })); } catch (_) {}
        try { target.click(); } catch (_) {}
        try { target.focus && target.focus(); } catch (_) {}
        return true;
      }

      function clickElement(el) {
        const target = clickableElement(el) || el;
        if (!target || disabled(target)) return false;
        return clickAtElement(target);
      }

      function findByTexts(texts, excludes = []) {
        const candidates = queryAll('button,a,[role="button"],span,div');
        const exact = [];
        const fuzzy = [];
        for (const el of candidates) {
          if (!visible(el)) continue;
          const text = ownText(el) || nodeText(el);
          if (!text || text.length > 120) continue;
          if (excludes.some((ex) => text.includes(ex))) continue;
          if (texts.some((t) => text === t)) exact.push(el);
          else if (texts.some((t) => text.includes(t))) fuzzy.push(el);
        }
        return exact[0] || fuzzy[0] || null;
      }

      function nearestEditable(el) {
        if (!el) return null;
        if (isEditableElement(el) && visible(el)) return el;
        const descendant = Array.from(el.querySelectorAll && el.querySelectorAll('input,textarea,[contenteditable],[role="textbox"],.ProseMirror,.ql-editor,.public-DraftEditor-content') || [])
          .find((node) => visible(node) && isEditableElement(node));
        if (descendant) return descendant;
        let node = el.parentElement;
        for (let i = 0; node && i < 8; i += 1) {
          if (isEditableElement(node) && visible(node)) return node;
          node = node.parentElement;
        }
        return null;
      }

      function candidateInputs() {
        return queryAll('input,textarea,[contenteditable],[role="textbox"],[placeholder],[data-placeholder],[aria-placeholder],.ProseMirror,.ql-editor,.public-DraftEditor-content').filter((el) => {
          if (!visible(el)) return false;
          const tag = el.tagName.toLowerCase();
          const type = (el.getAttribute('type') || '').toLowerCase();
          if (['hidden', 'button', 'submit', 'checkbox', 'radio', 'file'].includes(type)) return false;
          if (el.closest && el.closest('button,a,[role="button"]')) return false;
          if (tag === 'input' && /search|搜索/.test(inputMeta(el))) return false;
          return true;
        });
      }

      function largestEditor() {
        const scored = candidateInputs().map((el) => {
          const rect = el.getBoundingClientRect();
          let score = rect.width * rect.height;
          const meta = inputMeta(el);
          if (/editor|ProseMirror|正文|内容|写作|chapter|title|标题/i.test(meta)) score += 250000;
          if (isEditableElement(el)) score += 120000;
          return { el, score };
        }).sort((a, b) => b.score - a.score);
        return scored[0] && scored[0].score > 10000 ? scored[0].el : null;
      }

      function findMarkerByText(regex, excludeRegex) {
        const candidates = queryAll('input,textarea,[contenteditable],[role="textbox"],[placeholder],[data-placeholder],[aria-placeholder],span,div,p');
        const scored = [];
        for (const el of candidates) {
          if (!visible(el)) continue;
          const own = ownText(el);
          const meta = inputMeta(el);
          const ownMatched = regex.test(own);
          const metaMatched = regex.test(meta);
          if (!ownMatched && !metaMatched) continue;
          if (excludeRegex && excludeRegex.test(own) && !ownMatched) continue;
          const rect = el.getBoundingClientRect();
          let score = ownMatched ? 150 : 30;
          if (isEditableElement(el)) score += 80;
          if ((el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || el.getAttribute('aria-placeholder') || '').trim()) score += 70;
          if (rect.width > 80) score += 10;
          if (rect.height > 16) score += 5;
          if (nodeText(el).length > 260) score -= 60;
          scored.push({ el, score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored[0] ? scored[0].el : null;
      }

      function findTitleField() {
        const selectors = [
          'input[placeholder*="请输入标题"]',
          'input[placeholder*="标题"]',
          'textarea[placeholder*="标题"]',
          '[data-placeholder*="请输入标题"]',
          '[data-placeholder*="标题"]',
          '[aria-placeholder*="标题"]',
          '[aria-label*="标题"]',
          '[contenteditable][placeholder*="标题"]',
          '[contenteditable][data-placeholder*="标题"]'
        ];
        for (const selector of selectors) {
          const found = queryAll(selector).find(visible);
          if (found) return { el: found, marker: found, mode: 'field' };
        }
        const marker = findMarkerByText(/请输入标题|章节标题|章节名称|章节名|章名|标题/, /正文|内容|搜索|作者|简介/);
        if (marker) return { el: nearestEditable(marker) || marker, marker, mode: nearestEditable(marker) ? 'field' : 'marker' };
        const scored = candidateInputs().map((el) => {
          const meta = inputMeta(el);
          const rect = el.getBoundingClientRect();
          let score = 0;
          if (/章节标题|章节名称|章节名|标题|名称|章名|请输入标题/.test(meta)) score += 140;
          if (/正文|内容|搜索|作者|作品名|简介/.test(meta)) score -= 130;
          if (el.tagName.toLowerCase() === 'input') score += 35;
          if (rect.height <= 120 && rect.width >= 100) score += 20;
          if (isEditableElement(el)) score += 35;
          if (rect.height > 180) score -= 80;
          return { el, score };
        }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
        return scored[0] ? { el: scored[0].el, marker: scored[0].el, mode: 'field' } : null;
      }

      function findChapterNumberField(titleField) {
        if (!titleNumber) return null;
        const titleMarker = titleField && titleField.marker;
        const titleRect = titleMarker && typeof titleMarker.getBoundingClientRect === 'function' ? titleMarker.getBoundingClientRect() : null;
        const candidates = candidateInputs().map((el) => {
          if (titleField && (el === titleField.el || el === titleField.marker)) return null;
          const meta = inputMeta(el);
          const rect = el.getBoundingClientRect();
          let score = 0;
          if (/章号|章节号|章节序号|序号|chapter.*num|chapter.*no/i.test(meta)) score += 180;
          if (/第|章/.test(surroundingText(el))) score += 70;
          if (el.tagName.toLowerCase() === 'input') score += 50;
          if (rect.width <= 140 && rect.height <= 80) score += 55;
          if (rect.width > 180 || rect.height > 120) score -= 90;
          if (/标题|正文|内容|搜索|请输入正文|请输入标题/.test(meta)) score -= 80;
          if (titleRect && Math.abs((rect.top + rect.height / 2) - (titleRect.top + titleRect.height / 2)) < 45 && rect.left < titleRect.left) score += 120;
          return { el, score };
        }).filter(Boolean).filter((item) => item.score > 60).sort((a, b) => b.score - a.score);
        if (candidates[0]) return { el: candidates[0].el, marker: candidates[0].el, mode: 'field' };
        if (titleMarker && titleRect) return { el: nearestEditable(titleMarker) || titleMarker, marker: titleMarker, mode: 'title-number-coordinate' };
        return null;
      }

      function functionTitleNumberPoint(field) {
        const marker = field && field.marker;
        if (!marker || typeof marker.getBoundingClientRect !== 'function') return null;
        const doc = marker.ownerDocument || document;
        const rect = marker.getBoundingClientRect();
        const container = marker.closest && marker.closest('[contenteditable],textarea,input,.ProseMirror,.ql-editor,[role="textbox"]');
        const containerRect = container && typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : rect;
        const x = Math.max(containerRect.left + 48, rect.left - 88);
        const y = rect.top + rect.height / 2;
        return { doc, x, y, fallbackEl: marker };
      }

      function sameOrNested(a, b) {
        return Boolean(a && b && (a === b || (a.contains && a.contains(b)) || (b.contains && b.contains(a))));
      }

      function isTitleRelatedElement(el, titleField) {
        if (!el || !titleField) return false;
        return sameOrNested(el, titleField.el) || sameOrNested(el, titleField.marker);
      }

      function isTitleLikeInput(el) {
        if (!el) return false;
        const tag = el.tagName && el.tagName.toLowerCase();
        const meta = inputMeta(el);
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { height: 0, width: 0 };
        return (/请输入标题|章节标题|章节名称|章节名|章名|标题/.test(meta) && !/正文|内容|编辑器|ProseMirror|正文内容/.test(meta))
          || (tag === 'input' && rect.height <= 80 && !/正文|内容/.test(meta));
      }

      function findContentField(titleField) {
        const titleRect = titleField && titleField.marker && typeof titleField.marker.getBoundingClientRect === 'function'
          ? titleField.marker.getBoundingClientRect()
          : (titleField && titleField.el && typeof titleField.el.getBoundingClientRect === 'function' ? titleField.el.getBoundingClientRect() : null);
        const selectors = [
          'textarea[placeholder*="正文"]',
          'textarea[placeholder*="内容"]',
          '[data-placeholder*="正文"]',
          '[data-placeholder*="内容"]',
          '[aria-placeholder*="正文"]',
          '[aria-label*="正文"]',
          '.ProseMirror',
          '.ql-editor',
          '.public-DraftEditor-content',
          '.DraftEditor-editorContainer [contenteditable]',
          '[role="textbox"][contenteditable]',
          '[contenteditable]',
          'textarea'
        ];
        const candidates = [];
        const marker = findMarkerByText(/请输入正文|正文|内容|空格|AI写作小助手/, /请输入标题|章节标题|章节名称|章名/);
        if (marker) candidates.push(marker);
        for (const selector of selectors) candidates.push(...queryAll(selector).filter(visible));
        const unique = Array.from(new Set(candidates)).filter((el) => {
          if (!el) return false;
          const editable = nearestEditable(el) || el;
          if (isTitleRelatedElement(el, titleField) || isTitleRelatedElement(editable, titleField)) return false;
          if (el.closest && el.closest('button,a,[role="button"]')) return false;
          if (isTitleLikeInput(el) || isTitleLikeInput(editable)) return false;
          return true;
        });
        const scored = unique.map((el) => {
          const editable = nearestEditable(el) || el;
          const rect = el.getBoundingClientRect();
          const editableRect = editable.getBoundingClientRect ? editable.getBoundingClientRect() : rect;
          const meta = normalizeText([inputMeta(el), inputMeta(editable)].join(' '));
          let score = Math.min((Math.max(rect.width * rect.height, editableRect.width * editableRect.height)) / 900, 220);
          if (/正文|内容|编辑器|请输入正文|请输入内容|AI写作小助手|空格/.test(meta)) score += 220;
          if (/ProseMirror|ql-editor|DraftEditor|editor|rich|content/i.test(meta)) score += 130;
          if (isEditableElement(editable)) score += 70;
          if (editable.tagName && editable.tagName.toLowerCase() === 'textarea') score += 45;
          if (editable.tagName && editable.tagName.toLowerCase() === 'input') score -= 220;
          if (editableRect.height >= 120 && editableRect.width >= 300) score += 120;
          if (editableRect.height < 70 && !/正文|内容|空格|AI写作|ProseMirror|editor/i.test(meta)) score -= 180;
          if (titleRect && editableRect.top <= titleRect.bottom + 24 && !/正文|内容|ProseMirror|editor/i.test(meta)) score -= 160;
          if (/请输入标题|章节标题|章节名称|章节名|章名/.test(meta) && !/正文|内容/.test(meta)) score -= 260;
          return { el: editable, marker: el, mode: isEditableElement(editable) ? 'field' : 'marker', kind: 'content', score };
        }).filter((item) => item.score > 35).sort((a, b) => b.score - a.score);
        return scored[0] || null;
      }

      function findEditorFields() {
        const titleField = findTitleField();
        const contentField = findContentField(titleField);
        if (titleField && contentField) return { titleField: { ...titleField, kind: 'title' }, contentField, mode: 'two-fields' };

        const titleMarker = findMarkerByText(/请输入标题|章节标题|章节名称|章节名|章名|标题/, /搜索|作者|简介/);
        const contentMarker = findMarkerByText(/请输入正文|正文|内容|空格|AI写作小助手/, /请输入标题|章节标题|章节名称|章名/);
        if (titleMarker && contentMarker) {
          const fallbackTitleField = { el: nearestEditable(titleMarker) || titleMarker, marker: titleMarker, mode: 'marker', kind: 'title' };
          const preciseContentField = findContentField(fallbackTitleField);
          return {
            titleField: fallbackTitleField,
            contentField: preciseContentField || { el: nearestEditable(contentMarker) || contentMarker, marker: contentMarker, mode: 'marker', kind: 'content' },
            mode: 'markers'
          };
        }

        const editor = largestEditor();
        if (editor && !isTitleLikeInput(editor)) {
          return {
            titleField: { el: editor, marker: titleMarker || editor, mode: titleMarker ? 'marker' : 'field', kind: 'title' },
            contentField: { el: editor, marker: contentMarker || editor, mode: contentMarker ? 'marker' : 'field', kind: 'content' },
            mode: 'single-editor'
          };
        }
        return null;
      }

      async function waitFor(getter, timeout = 15000, interval = 400) {
        const start = Date.now();
        let value = null;
        while (Date.now() - start < timeout) {
          value = getter();
          if (value) return value;
          await sleep(interval);
        }
        return null;
      }

      function getEditableText(el) {
        if (!el) return '';
        const tag = el.tagName && el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return el.value || '';
        return el.innerText || el.textContent || '';
      }

      function setNativeValue(el, value) {
        const win = ownerWindow(el);
        const tag = el.tagName.toLowerCase();
        const proto = tag === 'textarea' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
        const nativeSetter = (Object.getOwnPropertyDescriptor(proto, 'value') || {}).set;

        try { el.focus(); } catch (_) {}
        try { el.select(); } catch (_) {}

        const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = el[fiberKey];
          while (fiber) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props && typeof props.onChange === 'function') {
              if (nativeSetter) nativeSetter.call(el, value);
              else el.value = value;
              try { props.onChange({ target: el, currentTarget: el }); } catch (_) {}
              if (el.value === value) return;
            }
            fiber = fiber.return;
          }
        }

        const ownDesc = Object.getOwnPropertyDescriptor(el, 'value');
        if (ownDesc && ownDesc.set) {
          ownDesc.set.call(el, value);
          el.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          el.dispatchEvent(new win.Event('change', { bubbles: true }));
          if (el.value === value) return;
        }

        if (nativeSetter) {
          nativeSetter.call(el, value);
          el.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          el.dispatchEvent(new win.Event('change', { bubbles: true }));
          if (el.value === value) return;
        }

        try { el.select(); } catch (_) {}
        try { win.document.execCommand('insertText', false, value); } catch (_) {}
        if (el.value === value) return;

        el.value = value;
        try { el.setAttribute('value', value); } catch (_) {}
        el.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        el.dispatchEvent(new win.Event('change', { bubbles: true }));
      }

      async function insertTextIntoEditable(el, value, replaceAll) {
        if (!el) return null;
        const doc = el.ownerDocument || document;
        const win = doc.defaultView || window;
        const tag = el.tagName && el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') {
          setNativeValue(el, value);
          return el;
        }

        try { el.focus && el.focus(); } catch (_) {}
        await sleep(80);
        if (replaceAll) {
          try {
            const selection = win.getSelection();
            const range = doc.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (_) {}
        }

        const beforePasteLength = normalizeText(getEditableText(el)).length;
        let inserted = false;
        try {
          const data = new win.DataTransfer();
          data.setData('text/plain', value);
          const event = new win.ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
          el.dispatchEvent(event);
        } catch (_) {}
        await sleep(180);

        const afterPasteLength = normalizeText(getEditableText(el)).length;
        inserted = afterPasteLength > beforePasteLength + Math.min(2, normalizeText(value).length);
        if (!inserted) {
          try { inserted = doc.execCommand('insertText', false, value) || inserted; } catch (_) {}
        }
        await sleep(220);

        if (replaceAll && normalizeText(getEditableText(el)).length < Math.min(20, normalizeText(value).length)) {
          const html = value
            .split(/\n{2,}/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean)
            .map((paragraph) => '<p>' + paragraph.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>')
            .join('');
          if (isEditableElement(el)) el.innerHTML = html || value;
          else el.textContent = value;
        }

        try { el.dispatchEvent(new win.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value })); } catch (_) {}
        try { el.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })); } catch (_) { el.dispatchEvent(new win.Event('input', { bubbles: true })); }
        el.dispatchEvent(new win.Event('change', { bubbles: true }));
        return el;
      }

      async function pasteAtMarker(field, value) {
        const marker = field.marker || field.el;
        const doc = marker && marker.ownerDocument || document;
        try { marker && marker.scrollIntoView && marker.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
        if (marker) clickAtElement(marker);
        await sleep(220);
        let active = doc.activeElement;
        if (field.kind === 'content' && active && isTitleLikeInput(active)) active = null;
        if (!active || !isEditableElement(active)) active = nearestEditable(marker) || field.el || largestEditor();
        if (field.kind === 'content' && active && isTitleLikeInput(active)) active = largestEditor();
        if (!active || !isEditableElement(active) || (field.kind === 'content' && isTitleLikeInput(active))) return null;
        return insertTextIntoEditable(active, value, false);
      }

      async function pasteAtPoint(point, value) {
        if (!point) return null;
        clickAtPoint(point.doc, point.x, point.y, point.fallbackEl);
        await sleep(220);
        let active = point.doc.activeElement;
        if (!active || !isEditableElement(active)) active = nearestEditable(point.fallbackEl) || largestEditor();
        if (!active || !isEditableElement(active)) return null;
        return insertTextIntoEditable(active, value, false);
      }

      async function fillChapterNumber(field) {
        if (!field || !titleNumber) return null;
        if (field.mode === 'title-number-coordinate') {
          return pasteAtPoint(functionTitleNumberPoint(field), titleNumber);
        }
        return fillField(field, titleNumber, true);
      }

      async function fillField(field, value, replaceAll) {
        if (!field) return null;
        if (field.mode === 'marker') return pasteAtMarker(field, value);
        let target = field.el;
        if (field.kind === 'content' && target && isTitleLikeInput(target)) target = null;
        if (!target || !isEditableElement(target)) {
          clickAtElement(field.marker || target);
          await sleep(180);
          let active = (field.marker && field.marker.ownerDocument || document).activeElement;
          if (field.kind === 'content' && active && isTitleLikeInput(active)) active = null;
          if (active && isEditableElement(active)) target = active;
          else target = nearestEditable(field.marker || target) || target;
          if (field.kind === 'content' && target && isTitleLikeInput(target)) target = largestEditor();
        }
        if (!target || !isEditableElement(target) || (field.kind === 'content' && isTitleLikeInput(target))) return pasteAtMarker(field, value);
        if (field.marker && field.marker !== target && field.marker !== field.el && field.kind !== 'content') return pasteAtMarker(field, value);
        return insertTextIntoEditable(target, value, replaceAll);
      }

      function detectBlockingText() {
        const body = allDocuments().map((doc) => doc.body ? doc.body.innerText : '').join('\n');
        const blockers = ['验证码', '滑块验证', '短信验证', '扫码登录', '请先登录', '登录已过期', '操作频繁', '账号异常', '风险验证', '人机验证', '保存失败', '网络错误'];
        return blockers.find((item) => body.includes(item)) || '';
      }

      function inputSamples() {
        return candidateInputs().slice(0, 24).map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            editable: isEditableElement(el),
            placeholder: el.getAttribute('placeholder') || '',
            dataPlaceholder: el.getAttribute('data-placeholder') || '',
            aria: el.getAttribute('aria-label') || el.getAttribute('aria-placeholder') || '',
            role: el.getAttribute('role') || '',
            contenteditable: el.getAttribute('contenteditable') || '',
            className: String(el.className || '').slice(0, 120),
            text: nodeText(el).slice(0, 120),
            meta: inputMeta(el).slice(0, 180),
            size: Math.round(rect.width) + 'x' + Math.round(rect.height)
          };
        });
      }

      try {
        stage('检测页面');
        const blockerBefore = detectBlockingText();
        if (blockerBefore && /验证码|登录|验证|操作频繁|账号异常/.test(blockerBefore)) {
          result.message = '当前页面需要人工处理：' + blockerBefore;
          return result;
        }

        let fields = findEditorFields();
        if (!fields && shouldClickNew) {
          stage('点击新建章节');
          const newChapterButton = findByTexts(['新建章节', '新增章节', '创建章节', '写新章节', '添加章节', '发布章节', '新建章'], ['章节管理', '章节列表']);
          if (!newChapterButton) {
            result.message = '未找到“新建章节/新增章节”按钮，请确认已进入目标作品的章节管理页。';
            result.details.inputSamples = inputSamples();
            result.details.url = location.href;
            return result;
          }
          clickElement(newChapterButton);
          await sleep(700);
        }

        stage('等待编辑器');
        fields = await waitFor(findEditorFields, shouldClickNew ? 14000 : 10000, 400);
        if (!fields) {
          result.message = '已进入新建章节页面，但没有识别到标题/正文编辑区。';
          result.details.inputSamples = inputSamples();
          result.details.url = location.href;
          return result;
        }
        result.details.editorMode = fields.mode;

        stage('填写章节号');
        const numberField = findChapterNumberField(fields.titleField);
        let filledNumberEl = null;
        if (titleNumber && numberField) {
          filledNumberEl = await fillChapterNumber(numberField);
          await sleep(260);
        }

        stage('填写标题');
        const filledTitleEl = await fillField(fields.titleField, titleText || title, true);
        await sleep(500);

        stage('填写正文');
        const refreshedContentField = findContentField(fields.titleField);
        if (refreshedContentField) {
          fields.contentField = refreshedContentField;
        }
        if (!fields.contentField || (fields.contentField.el && isTitleLikeInput(fields.contentField.el))) {
          result.message = '没有识别到独立正文编辑区，已阻止把正文写入标题框。';
          result.details.inputSamples = inputSamples();
          result.details.url = location.href;
          return result;
        }
        const filledContentEl = await fillField(fields.contentField, content, fields.mode !== 'markers' && fields.mode !== 'single-editor');
        await sleep(900);

        stage('校验内容');
        const pageText = allDocuments().map((doc) => doc.body ? doc.body.innerText : '').join('\n');
        const actualTitle = filledTitleEl ? normalizeText(getEditableText(filledTitleEl)) : '';
        const actualNumber = filledNumberEl ? normalizeText(getEditableText(filledNumberEl)) : '';
        const actualContentText = filledContentEl ? normalizeText(getEditableText(filledContentEl)) : '';
        const actualContentLen = actualContentText.length;
        const expectedContentLen = normalizeText(content).length;
        const compactPageText = compactText(pageText);
        const pageHasTitle = shortText(titleText || title, 6) ? compactPageText.includes(shortText(titleText || title, 6)) : compactPageText.includes(shortText(title, 6));
        const pageHasNumber = !titleNumber || compactPageText.includes(compactText(titleNumber)) || compactText(actualNumber).includes(compactText(titleNumber));
        const pageHasContent = compactPageText.includes(shortText(content, 20));
        result.details = {
          ...result.details,
          titleNumber,
          titleText,
          actualNumber,
          actualTitle,
          actualContentLen,
          expectedContentLen,
          pageHasNumber,
          pageHasTitle,
          pageHasContent,
          url: location.href,
          inputSamples: inputSamples().slice(0, 8)
        };
        if (!pageHasTitle && actualTitle.length < 1) {
          result.message = '标题写入后仍为空。';
          return result;
        }
        if (!pageHasNumber) {
          result.message = '章节号写入后仍未识别到，请检查“第 _ 章”的数字输入框。';
          return result;
        }
        if (filledTitleEl && filledContentEl && filledTitleEl === filledContentEl) {
          result.message = '检测到标题框和正文框是同一个元素，已停止以避免正文写入标题。';
          return result;
        }
        if (filledTitleEl && normalizeText(getEditableText(filledTitleEl)).length > Math.max(80, expectedContentLen * 0.25)) {
          result.message = '检测到标题框内容异常变长，疑似正文被写入标题，已停止。';
          return result;
        }
        if (expectedContentLen > 50 && !pageHasContent && actualContentLen < expectedContentLen * 0.25) {
          result.message = '正文写入后字数差异过大，建议人工检查编辑器内容。';
          return result;
        }

        if (!saveDraft) {
          result.ok = true;
          stage('已填写');
          result.message = '标题和正文已写入，等待主程序点击存草稿。';
          return result;
        }

        stage('保存草稿');
        const saveButton = await waitFor(() => findByTexts(['存草稿', '保存草稿', '存为草稿', '保存为草稿', '暂存草稿', '保存'], ['发布', '提交审核', '立即发布', '下一步']), 9000, 400);
        if (!saveButton) {
          result.message = '未找到“保存草稿”按钮。';
          return result;
        }
        clickElement(saveButton);
        await sleep(2600);

        const blockerAfter = detectBlockingText();
        if (blockerAfter && /失败|错误|验证码|登录|验证|操作频繁|账号异常/.test(blockerAfter)) {
          result.message = '保存后页面提示需要人工处理：' + blockerAfter;
          return result;
        }

        result.ok = true;
        stage('完成');
        result.message = '已尝试保存草稿。请以番茄后台实际草稿状态为准。';
        return result;
      } catch (error) {
        result.ok = false;
        result.message = error && error.message ? error.message : String(error);
        try {
          result.details.url = location.href;
          result.details.inputSamples = inputSamples();
        } catch (_) {}
        return result;
      }
    })();
  }.toString()})(${JSON.stringify(payload)});`;
}

async function detectCurrentPage() {
  try {
    const pageScript = currentPlatform === 'qimao' ? api.qimaoBuildPageDetectionScript() : buildPageDetectionScript();
    const info = await executeInWriterWindowSafe(pageScript);
    log(`当前页面：${info.title || '无标题'}，地址：${info.url}`);
    log(`页面检测：新建章节按钮=${info.hasNewChapter ? '可能存在' : '未发现'}，编辑器=${info.editableCount}，文本框=${info.textareaCount}，输入框=${info.inputCount}`);
    if (info.mayNeedLogin) {
      log('检测到页面可能仍在登录/验证阶段，请先人工完成扫码或验证。');
    }
    if (info.sampleButtons?.length) {
      log(`页面按钮采样：${info.sampleButtons.slice(0, 12).join(' / ')}`);
    }
    return info;
  } catch (error) {
    log(`页面检测失败：${error.message}`);
    return null;
  }
}

function buildPlatformClickNewChapterScript() {
  if (currentPlatform === 'qimao') return api.qimaoBuildClickNewChapterScript();
  return buildClickNewChapterScript();
}

function buildPlatformUploadScript(title, body, options) {
  if (currentPlatform === 'qimao') return api.qimaoBuildUploadScript(title, body, options);
  return buildUploadScript(title, body, options);
}

function platformEditorUrlPattern() {
  if (currentPlatform === 'qimao') return /\/chapter-editor|\/edit|\/chapter\//;
  return /\/publish\//;
}

async function uploadOneChapter(chapter) {
  if (!chapter) throw new Error('没有选择章节。');
  if (!chapter.title || !chapter.body) {
    return { ok: false, message: '章节标题或正文为空。' };
  }

  chapter.status = '上传中';
  chapter.errorMessage = '';
  renderChapters();
  log(`开始上传：${chapter.index}. ${chapter.title}（${chapter.wordCount} 字）`);

  const stateBeforeUpload = await getWriterStateSafe();
  if (currentPlatform === 'fanqie') {
    await dismissLingeringTypoDialog('开始下一章前检测到残留错别字提示');
  }
  const stateAfterCleanup = await getWriterStateSafe();
  const editorPattern = platformEditorUrlPattern();
  const alreadyInEditor = editorPattern.test(stateAfterCleanup?.url || stateBeforeUpload?.url || '');

  let result;
  try {
    if (!alreadyInEditor) {
      log('当前在章节管理页，先点击“新建章节”，等待编辑页加载完成后再填写。');
      try {
        const clickResult = await withTimeout(
          executeInWriterWindow(buildPlatformClickNewChapterScript()),
          8000,
          '点击新建章节脚本超时'
        );
        if (!clickResult?.ok) {
          result = {
            ok: false,
            step: '点击新建章节',
            message: clickResult?.message || '未能点击新建章节按钮',
            details: { url: clickResult?.url || stateBeforeUpload?.url || '' }
          };
        } else {
          log(`已点击新建章节：${clickResult.buttonText || '新建章节'}`);
        }
      } catch (clickError) {
        log(`点击新建章节后页面可能正在跳转：${clickError.message}`);
      }

      if (!result) {
        const readyState = await waitForWriterPageReady(editorPattern, 45000);
        log(`新建章节编辑页已就绪：${readyState.url || '未知地址'}`);
      }
    } else {
      log('检测到当前已在新建章节编辑页，直接执行自动填写。');
    }

    if (!result) {
      const finalAction = els.publishAction.value || settings.publishAction || 'draft';
      if (currentPlatform === 'qimao' && finalAction === 'none') {
        log('完成后动作设置为“只填写不点击”，跳过七猫编辑页填写。');
        result = { ok: true, skipped: true };
      } else {
        const qimaoSaveDraft = currentPlatform === 'qimao' ? (finalAction !== 'next') : false;
        const platformOptions = { clickNew: false, saveDraft: qimaoSaveDraft };
        result = await withTimeout(
          executeInWriterWindow(buildPlatformUploadScript(chapter.title, chapter.body, platformOptions)),
          finalAction === 'next' ? 90000 : 45000,
          '当前编辑页填写脚本执行超时'
        );
      }
    }

    if (result?.ok) {
      const finalAction = els.publishAction.value || settings.publishAction || 'draft';
      const label = finalAction === 'next' ? '完整发布流程' : (finalAction === 'none' ? '只填写不点击' : '存草稿');
      log(`标题和正文已写入，完成后动作：${label}。`);
      if (finalAction === 'next') {
        if (currentPlatform === 'qimao') {
          log('七猫发布流程由脚本内部完成，等待发布完成...');
          await sleepWithStop(3000);
        } else {
          const publishResult = await runDirectPublishFlow();
          result.publishInfo = publishResult.info || publishResult;
        }
      } else if (currentPlatform === 'fanqie' && finalAction !== 'none') {
        await clickFinalActionWithRetry(finalAction);
      } else if (currentPlatform === 'qimao') {
        log('七猫存草稿流程由脚本内部完成。');
      }
      result.finalAction = finalAction;
      result.step = '完成';
      const platformName = PLATFORM_INFO[currentPlatform]?.displayName || '平台';
      result.message = finalAction === 'none'
        ? '已填写标题和正文，未点击存草稿/发布。'
        : (finalAction === 'next' ? '已完成直接发布流程，并返回章节管理页。' : `已通过主程序点击${label}。请以${platformName}后台实际状态为准。`);
    }
  } catch (error) {
    const message = error.message || String(error);
    result = {
      ok: false,
      stopped: /用户已请求停止任务/.test(message),
      step: /用户已请求停止任务/.test(message) ? '已停止' : '上传流程',
      message,
      details: {}
    };
  }

  if (result.ok) {
    const finalAction = result.finalAction || els.publishAction.value || settings.publishAction || 'draft';
    chapter.status = finalAction === 'next' ? '已发布' : '已保存草稿';
    chapter.errorMessage = '';
    await api.markSuccess({
      platform: currentPlatform,
      bookName: els.bookName.value.trim(),
      title: chapter.title,
      filePath: chapter.filePath,
      contentHash: chapter.contentHash
    });
    log(`${finalAction === 'next' ? '直接发布完成' : '保存草稿成功'}：${chapter.title}`);
  } else if (result.stopped) {
    chapter.status = '已停止';
    chapter.errorMessage = '用户请求停止任务';
    log(`上传已停止：${chapter.title}`);
  } else {
    chapter.status = '需要人工处理';
    chapter.errorMessage = `${result.step || '未知步骤'}：${result.message || '未知错误'}`;
    log(`上传暂停：${chapter.title}；${chapter.errorMessage}`);
    if (result.details?.url) {
      log(`失败时页面地址：${result.details.url}`);
    }
    if (result.details?.inputSamples?.length) {
      log(`失败时输入框采样：${JSON.stringify(result.details.inputSamples).slice(0, 1000)}`);
    }
  }
  renderChapters();
  return result;
}

function resumeTask() {
  pauseRequested = false;
  setTaskState(stopRequested ? '正在停止' : (taskRunning ? '运行中' : '空闲'));
  if (waitResumeResolve) {
    const resolve = waitResumeResolve;
    waitResumeResolve = null;
    resolve();
  }
}

async function waitIfPaused() {
  if (!pauseRequested) return;
  setTaskState('已暂停');
  log('任务已暂停，等待用户点击“继续”。');
  await new Promise((resolve) => {
    waitResumeResolve = resolve;
  });
}

async function runBatchUpload() {
  if (taskRunning) {
    log('已有上传任务正在运行。');
    return;
  }
  if (!chapters.length) {
    log('没有可上传章节，请先选择文件夹并扫描。');
    return;
  }
  const checkedChapters = chapters.filter((chapter) => chapter.checked === true);
  if (!checkedChapters.length) {
    log('没有勾选任何章节，请先在章节列表中勾选要上传的章节。');
    return;
  }
  if (!pageConfirmed) {
    const name = platformInfo().displayName;
    const ok = window.confirm(`还没有确认已进入${name}作品章节管理页。是否仍然开始？`);
    if (!ok) return;
  }

  await persistSettings();
  taskRunning = true;
  stopRequested = false;
  pauseRequested = false;
  skipCurrentRequested = false;
  setTaskState('运行中');
  log(`开始批量上传草稿，本次勾选 ${checkedChapters.length} 章。`);

  try {
    for (let index = 0; index < chapters.length; index += 1) {
      if (stopRequested) break;
      await waitIfPaused();
      if (stopRequested) break;

      const chapter = chapters[index];
      if (chapter.checked !== true) {
        continue;
      }
      selectedIndex = index;
      renderChapters();

      if (chapter.status === '已保存草稿') {
        log(`跳过已保存草稿章节：${chapter.title}`);
        continue;
      }

      const result = await uploadOneChapter(chapter);
      if (result.stopped) break;
      if (!result.ok) {
        pauseRequested = true;
        await waitIfPaused();
        if (stopRequested) break;
        if (skipCurrentRequested) {
          chapter.status = '已跳过';
          chapter.errorMessage = '用户选择跳过';
          skipCurrentRequested = false;
          renderChapters();
          continue;
        }
        index -= 1;
        continue;
      }

      const delay = Math.max(500, Number(els.uploadDelay.value || 2500));
      await sleepWithStop(delay);
    }
  } finally {
    taskRunning = false;
    pauseRequested = false;
    waitResumeResolve = null;
    setTaskState(stopRequested ? '已停止' : '空闲');
    log(stopRequested ? '上传任务已停止。' : '批量上传流程结束。');
  }
}

async function uploadSelectedChapter() {
  if (!chapters.length) {
    log('没有可上传章节，请先选择文件夹并扫描。');
    return;
  }
  if (taskRunning) {
    log('批量任务运行中，不能单独上传。');
    return;
  }

  const checkedIndexes = chapters
    .map((chapter, index) => (chapter.checked === true ? index : -1))
    .filter((index) => index >= 0);
  const targetIndexes = checkedIndexes.length ? checkedIndexes : (selectedIndex >= 0 && chapters[selectedIndex] ? [selectedIndex] : []);
  if (!targetIndexes.length) {
    log('请先勾选要上传的章节，或点击表格行选中一章。');
    return;
  }

  await persistSettings();
  taskRunning = true;
  stopRequested = false;
  pauseRequested = false;
  skipCurrentRequested = false;
  setTaskState(checkedIndexes.length ? '上传勾选章节' : '上传选中章');
  log(checkedIndexes.length ? `开始上传勾选章节，共 ${targetIndexes.length} 章。` : `开始上传当前选中章：${chapters[targetIndexes[0]].title}`);
  try {
    for (const index of targetIndexes) {
      if (stopRequested) break;
      selectedIndex = index;
      renderChapters();
      const result = await uploadOneChapter(chapters[index]);
      if (result.stopped || !result.ok) break;
      const delay = Math.max(500, Number(els.uploadDelay.value || 2500));
      await sleepWithStop(delay);
    }
  } catch (error) {
    log(`上传勾选/选中章节失败：${error.message}`);
  } finally {
    taskRunning = false;
    pauseRequested = false;
    waitResumeResolve = null;
    setTaskState(stopRequested ? '已停止' : '空闲');
    log(stopRequested ? '上传任务已停止。' : '上传勾选/选中章节流程结束。');
  }
}

async function saveReport() {
  const payload = {
    generatedAt: new Date().toISOString(),
    folderPath,
    bookName: els.bookName.value.trim(),
    summary: chapters.reduce((acc, chapter) => {
      acc[chapter.status] = (acc[chapter.status] || 0) + 1;
      return acc;
    }, {}),
    chapters: chapters.map(({ body, ...rest }) => rest)
  };
  const result = await api.saveReport(payload);
  if (result.ok) log(`报告已保存：${result.filePath}`);
  else if (!result.canceled) log('报告保存失败。');
}

function setupPlatformEventListeners(platform) {
  const isQimao = platform === 'qimao';
  api[isQimao ? 'onQimaoWriterWindowNavigated' : 'onFanqieWriterWindowNavigated']((state) => {
    updateWriterWindowState(state);
  });
  api[isQimao ? 'onQimaoWriterWindowLoaded' : 'onFanqieWriterWindowLoaded']((state) => {
    updateWriterWindowState(state);
    log(`作家窗口页面加载完成：${state.url || '未知地址'}`);
  });
  api[isQimao ? 'onQimaoWriterWindowResized' : 'onFanqieWriterWindowResized']((state) => {
    updateWriterWindowState(state);
  });
  api[isQimao ? 'onQimaoWriterWindowReady' : 'onFanqieWriterWindowReady']((state) => {
    updateWriterWindowState(state);
  });
  const consoleApi = isQimao ? api.onQimaoWriterConsole : api.onFanqieWriterConsole;
  if (typeof consoleApi === 'function') {
    consoleApi((payload) => {
      if (payload?.message) log(payload.message);
    });
  }
  api[isQimao ? 'onQimaoWriterWindowClosed' : 'onFanqieWriterWindowClosed'](() => {
    updateWriterWindowState({ open: false });
    const name = PLATFORM_INFO[platform]?.displayName || '作家助手';
    log(`${name}作家助手窗口已关闭。Cookie 会继续保存在本机，有效期内重新打开通常无需重复扫码。`);
  });
}

async function init() {
  try {
    settings = { ...settings, ...(await api.loadSettings()) };
    if (settings.platform && ['fanqie', 'qimao'].includes(settings.platform)) {
      currentPlatform = settings.platform;
    }
    if (!settings.fanqieUrl || settings.fanqieUrl === 'https://fanqienovel.com/main/writer/') {
      settings.fanqieUrl = DEFAULT_FANQIE_URL;
    }
    if (!settings.qimaoUrl) {
      settings.qimaoUrl = DEFAULT_QIMAO_URL;
    }
    records = await api.loadRecords();
    if (!['draft', 'next', 'none'].includes(settings.publishAction)) settings.publishAction = 'draft';
  } catch (error) {
    log(`加载本地配置失败：${error.message}`);
  }

  els.removeTitleLine.checked = settings.removeTitleLine !== false;
  els.recursiveScan.checked = Boolean(settings.recursive);
  els.uploadDelay.value = String(settings.uploadDelayMs || 2500);
  els.publishAction.value = settings.publishAction || 'draft';
  setLoginState('未确认');
  setPageState('未确认');
  setTaskState('空闲');
  updateWriterWindowState({ open: false });
  renderChapters();
  updatePlatformUI();

  setupPlatformEventListeners(currentPlatform);

  try {
    const state = await writerApi().getWindowState();
    updateWriterWindowState(state);
  } catch (_) {
    updateWriterWindowState({ open: false });
  }

  const info = platformInfo();
  log(`工具已启动。当前平台：${info.displayName}。先打开${info.displayName}作家助手工作台并进入目标作品章节管理页，再选择本地章节文件夹并上传草稿。`);
}

els.selectFolderBtn.addEventListener('click', async () => {
  const selected = await api.selectFolder();
  if (!selected) return;
  folderPath = selected;
  els.folderPath.textContent = folderPath;
  await scanCurrentFolder();
});

els.rescanBtn.addEventListener('click', scanCurrentFolder);
els.removeTitleLine.addEventListener('change', scanCurrentFolder);
els.recursiveScan.addEventListener('change', scanCurrentFolder);
els.uploadDelay.addEventListener('change', persistSettings);
els.publishAction.addEventListener('change', persistSettings);
els.bookName.addEventListener('change', () => {
  applyHistoricalRecords();
  renderChapters();
});

els.chapterTableBody.addEventListener('click', (event) => {
  const viewButton = event.target.closest('.view-chapter-btn');
  if (viewButton) {
    showChapterPreview(Number(viewButton.dataset.index));
    return;
  }
  if (event.target.closest('input')) return;
  const row = event.target.closest('tr[data-index]');
  if (!row) return;
  selectedIndex = Number(row.dataset.index);
  renderChapters();
});

els.chapterTableBody.addEventListener('change', (event) => {
  if (!event.target.classList.contains('chapter-check')) return;
  const index = Number(event.target.dataset.index);
  if (chapters[index]) {
    chapters[index].checked = event.target.checked;
    renderChapters();
  }
});

els.selectAllChapters.addEventListener('change', () => {
  const checked = els.selectAllChapters.checked;
  chapters = chapters.map((chapter) => ({ ...chapter, checked }));
  renderChapters();
});

els.selectAllVisibleBtn.addEventListener('click', () => {
  chapters = chapters.map((chapter) => ({ ...chapter, checked: true }));
  renderChapters();
});

els.clearSelectedBtn.addEventListener('click', () => {
  chapters = chapters.map((chapter) => ({ ...chapter, checked: false }));
  renderChapters();
});

els.invertSelectedBtn.addEventListener('click', () => {
  chapters = chapters.map((chapter) => ({ ...chapter, checked: chapter.checked !== true }));
  renderChapters();
});

function jumpToChapter() {
  const target = parseInt(els.chapterSearchInput.value, 10);
  if (isNaN(target) || target < 1) {
    log('请输入有效的章节号（正整数）。');
    return;
  }
  const index = chapters.findIndex((ch) => ch.index === target);
  if (index === -1) {
    log(`未找到第 ${target} 章。`);
    return;
  }
  selectedIndex = index;
  renderChapters();
  const row = els.chapterTableBody.querySelector(`tr[data-index="${index}"]`);
  if (row) row.scrollIntoView({ block: 'start', behavior: 'smooth' });
  log(`已跳转到第 ${target} 章（${chapters[index].title || chapters[index].fileName}）。`);
}

els.chapterSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') jumpToChapter();
});
els.chapterJumpBtn.addEventListener('click', jumpToChapter);

els.closePreviewBtn.addEventListener('click', hideChapterPreview);
els.previewModal.addEventListener('click', (event) => {
  if (event.target === els.previewModal) hideChapterPreview();
});

els.chapterTableBody.addEventListener('input', (event) => {
  if (!event.target.classList.contains('title-editor')) return;
  const index = Number(event.target.dataset.index);
  if (chapters[index]) {
    chapters[index].title = event.target.value;
    chapters[index].status = chapters[index].status === '已保存草稿' ? chapters[index].status : '未上传';
  }
});

async function handleOpenWriterWindow() {
  await persistSettings();
  try {
    const targetUrl = platformUrl();
    if (currentPlatform === 'qimao') {
      await api.openQimaoWriterWindow({ url: targetUrl });
    } else {
      await api.openFanqieWriterWindow({ url: targetUrl });
    }
  } catch (error) {
    log(`打开作家助手窗口失败：${error.message}`);
  }
}

async function controlWriterWindow(action, successText) {
  try {
    const state = await writerApi().controlWindow(action);
    updateWriterWindowState(state);
    log(successText);
  } catch (error) {
    log(`控制作家窗口失败：${error.message}`);
  }
}

async function controlMainWindow(action) {
  try {
    await api.controlMainWindow(action);
  } catch (error) {
    log(`控制主窗口失败：${error.message}`);
  }
}

els.minimizeMainWindowBtn?.addEventListener('click', () => controlMainWindow('minimize'));
els.toggleMainWindowBtn?.addEventListener('click', () => controlMainWindow('toggle-maximize'));
els.closeMainWindowBtn?.addEventListener('click', () => controlMainWindow('close'));

els.openWriterBtn.addEventListener('click', handleOpenWriterWindow);
els.minimizeWriterWindowBtn.addEventListener('click', () => controlWriterWindow('minimize', '已最小化作家窗口。'));
els.toggleMaxWriterWindowBtn.addEventListener('click', () => controlWriterWindow('toggle-maximize', '已切换作家窗口最大化/还原状态。'));
els.reloadWriterWindowBtn.addEventListener('click', async () => {
  try {
    await writerApi().reloadWindow();
    const name = platformInfo().displayName;
    log(`已刷新${name}作家助手窗口。`);
  } catch (error) {
    log(`刷新作家助手窗口失败：${error.message}`);
  }
});
els.loginReadyBtn.addEventListener('click', async () => {
  loginConfirmed = true;
  setLoginState('用户已确认');
  const name = platformInfo().displayName;
  log(`用户确认已登录${name}作家助手工作台。`);
  await detectCurrentPage();
});
els.chapterPageReadyBtn.addEventListener('click', async () => {
  pageConfirmed = true;
  setPageState('用户已确认');
  log('用户确认已进入目标作品章节管理页。');
  await detectCurrentPage();
});
els.testPageBtn.addEventListener('click', detectCurrentPage);
els.startBtn.addEventListener('click', runBatchUpload);
els.uploadSelectedBtn.addEventListener('click', uploadSelectedChapter);
els.pauseBtn.addEventListener('click', () => {
  if (!taskRunning || stopRequested) return;
  pauseRequested = true;
  setTaskState('请求暂停');
  log('已请求暂停，当前章节动作完成后会暂停。');
});
els.resumeBtn.addEventListener('click', () => {
  if (!taskRunning || stopRequested) return;
  log('用户点击继续。');
  resumeTask();
});
els.skipCurrentBtn.addEventListener('click', () => {
  if (!taskRunning || stopRequested) return;
  skipCurrentRequested = true;
  log('用户选择跳过当前章节。');
  resumeTask();
});
els.stopBtn.addEventListener('click', () => {
  if (!taskRunning) {
    log('当前没有正在运行的上传任务。');
    return;
  }
  stopRequested = true;
  pauseRequested = false;
  skipCurrentRequested = false;
  setTaskState('正在停止');
  log('已请求停止任务，当前自动化步骤会尽快中断。');
  resumeTask();
});
els.platformSelector.addEventListener('change', async () => {
  const newPlatform = els.platformSelector.value;
  if (newPlatform === currentPlatform) return;
  if (taskRunning) {
    log('上传任务运行中，请先停止任务再切换平台。');
    els.platformSelector.value = currentPlatform;
    return;
  }
  currentPlatform = newPlatform;
  await persistSettings();
  updatePlatformUI();
  setupPlatformEventListeners(currentPlatform);
  try {
    const state = await writerApi().getWindowState();
    updateWriterWindowState(state);
  } catch (_) {
    updateWriterWindowState({ open: false });
  }
  applyHistoricalRecords();
  renderChapters();

  handleOpenWriterWindow();
});

els.saveReportBtn.addEventListener('click', saveReport);
els.clearLogBtn.addEventListener('click', () => {
  els.logBox.textContent = '';
});

init();
