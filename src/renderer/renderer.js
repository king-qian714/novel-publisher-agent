const api = window.novelPublisher;
const DEFAULT_FANQIE_URL = api.fanqieDefaultUrl;
const DEFAULT_QIMAO_URL = api.qimaoDefaultUrl;

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
  chapterTable: document.getElementById('chapterTable'),
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
  appMark: document.getElementById('appMark'),
  uploadProgressBar: document.getElementById('uploadProgressBar'),
  uploadProgressFill: document.getElementById('uploadProgressFill'),
  uploadProgressText: document.getElementById('uploadProgressText'),
  chapterEmptyState: document.getElementById('chapterEmptyState'),
  chapterSearchClear: document.getElementById('chapterSearchClear'),
  searchResultCount: document.getElementById('searchResultCount')
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
  uploadDelayMs: 3500,
  publishAction: 'next',
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
let searchFilter = '';

function platformInfo() {
  return PLATFORM_INFO[currentPlatform] || PLATFORM_INFO.fanqie;
}



function updateStepStates() {
  const step1 = document.querySelector('[data-step="1"]');
  const step2 = document.querySelector('[data-step="2"]');
  const step3 = document.querySelector('[data-step="3"]');
  if (step1) step1.classList.toggle('step-done', pageConfirmed);
  if (step2) step2.classList.toggle('step-done', chapters.length > 0);
  if (step3) step3.classList.toggle('step-done', chapters.some(function(ch) { return ch.status === '已保存草稿' || ch.status === '已发布'; }));
  updateNavStepStatus();
}

function switchStep(stepNum) {
  var panels = document.querySelectorAll(".step-content-area .step-card");
  var navItems = document.querySelectorAll(".nav-step-item");
  for (var i = 0; i < panels.length; i++) {
    panels[i].classList.toggle("hidden", panels[i].dataset.step !== String(stepNum));
  }
  for (var j = 0; j < navItems.length; j++) {
    navItems[j].classList.toggle("active", navItems[j].dataset.navStep === String(stepNum));
  }
}

function updateNavStepStatus() {
  var s1 = document.getElementById("navStep1Status");
  var s2 = document.getElementById("navStep2Status");
  var s3 = document.getElementById("navStep3Status");
  if (s1) s1.textContent = pageConfirmed ? "\u2713" : "";
  if (s2) s2.textContent = chapters.length > 0 ? chapters.length + "\u7ae0" : "";
  if (s3) {
    var done = chapters.filter(function(ch) { return ch.status === "\u5df2\u53d1\u5e03"; }).length;
    s3.textContent = done > 0 ? done + "\u5df2\u53d1\u5e03" : "";
  }
  var navItems = document.querySelectorAll(".nav-step-item");
  for (var i = 0; i < navItems.length; i++) {
    var step = navItems[i].dataset.navStep;
    var done = false;
    if (step === "1") done = pageConfirmed;
    if (step === "2") done = chapters.length > 0;
    if (step === "3") done = chapters.some(function(ch) { return ch.status === "\u5df2\u53d1\u5e03"; });
    navItems[i].classList.toggle("step-complete", done);
  }
}

function updateProgressBar(done, total) {
  if (!els.uploadProgressBar) return;
  if (total <= 0) {
    els.uploadProgressBar.classList.add('hidden');
    return;
  }
  els.uploadProgressBar.classList.remove('hidden');
  var pct = Math.round((done / total) * 100);
  els.uploadProgressFill.style.width = pct + '%';
  els.uploadProgressText.textContent = done + '/' + total + ' (' + pct + '%)';
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
  els.logBox.insertAdjacentText('beforeend', `${line}\n`);
  els.logBox.scrollTop = els.logBox.scrollHeight;
}

function setTaskState(text) {
  els.taskState.textContent = `任务：${text}`;
  const badgeClass = text === '空闲' || text === '已停止' ? 'status-idle'
    : text === '运行中' || text === '请求暂停' || text === '正在停止' || text.includes('上传') ? 'status-busy'
    : text === '已暂停' ? 'status-warn'
    : '';
  els.taskState.className = `status-badge ${badgeClass}`.trim();
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
  const badgeClass = text === '用户已确认' ? 'status-ok' : text.includes('未确认') ? 'status-idle' : 'status-warn';
  els.loginState.className = `status-badge ${badgeClass}`.trim();
  updateStepStates();
}

function setPageState(text) {
  els.pageState.textContent = `章节页：${text}`;
  const badgeClass = text === '用户已确认' ? 'status-ok' : text.includes('未确认') ? 'status-idle' : 'status-warn';
  els.pageState.className = `status-badge ${badgeClass}`.trim();
  updateStepStates();
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
    uploadDelayMs: Math.max(1500, Number(els.uploadDelay.value || 3500)),
    publishAction: els.publishAction.value || 'next',
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
  updateStepStates();
  if (els.chapterEmptyState) {
    els.chapterEmptyState.classList.toggle('hidden', chapters.length > 0);
  }
  if (els.chapterTable) {
    els.chapterTable.style.display = chapters.length > 0 ? '' : 'none';
  }
  var displayOrder = [];
  for (var si = 0; si < chapters.length; si++) displayOrder.push(si);
  const rows = displayOrder.map((originalIndex) => { const chapter = chapters[originalIndex]; const index = originalIndex;
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
    els.writerWindowState.className = 'status-badge status-idle';
    return;
  }

  const windowMode = state.isMinimized ? '已最小化' : (state.isMaximized ? '已最大化' : '已打开');
  els.writerWindowState.textContent = `作家窗口：${windowMode}`;
  els.writerWindowUrl.textContent = `当前作家窗口地址：${state.url || '加载中'}`;
  els.writerWindowState.className = 'status-badge status-ok';
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

function debounce(fn, ms) {
  let timer = null;
  return function() {
    const args = arguments;
    const self = this;
    clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(self, args); }, ms);
  };
}

async function waitForBackToManage(timeout) {
  timeout = timeout || 20000;
  var start = Date.now();
  var editorPattern = platformEditorUrlPattern();
  while (Date.now() - start < timeout) {
    ensureTaskNotStopped();
    var state = await getWriterStateSafe();
    if (!state || !state.open) return false;
    var url = state.url || "";
    if (currentPlatform === "fanqie") {
      if (/\/chapter-manage\//.test(url) || (/\/publish\//.test(url) && !editorPattern.test(url))) {
        await sleepWithStop(500);
        return true;
      }
    } else {
      if (!editorPattern.test(url)) {
        await sleepWithStop(500);
        return true;
      }
      try {
        var domInfo = await withTimeout(
          executeInWriterWindowSafe("({ hasEditor: document.querySelectorAll(\".ql-editor,[contenteditable=true],textarea\").length > 0 })"),
          3000, "DOM check timeout");
        if (domInfo && !domInfo.hasEditor) {
          await sleepWithStop(500);
          return true;
        }
      } catch (e) {}
    }
    await sleepWithStop(600);
  }
  return false;
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

/**
 * Strip "第X章" prefix from chapter titles (e.g. "第一章 开始" → "开始").
 * Supports Chinese numerals, Arabic numerals, and traditional variants.
 */
function stripChapterPrefix(title) {
  return title.replace(/^(第[0-9０-９零〇一二两三四五六七八九十百千万]+[章节张回部])\s*/, '');
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
      await sleepWithStop(action === 'next' ? 4000 : 5000);
      await waitForWriterDomStable(1000, 12000);
      return result;
    }
    lastMessage = result?.message || `未找到可点击的${label}按钮`;
    if (result?.candidates?.length) {
      log(`按钮候选：${result.candidates.map((item) => `${item.text}@${item.x},${item.y},${item.score}`).join(' / ')}`);
    }
    await sleepWithStop(1200);
  }
  throw new Error(lastMessage || `点击${label}超时`);
}


async function getWorkflowSnapshot() {
  try {
    return await withTimeout(executeInWriterWindowSafe(api.fanqieBuildWorkflowSnapshotScript()), 4000, '读取发布流程状态超时');
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
        await sleepWithStop(1500);
        continue;
      }

      lastMessage = result?.message || `未找到${label}`;
      lastCandidates = result?.candidates || lastCandidates;
      if (optional && /(未检测到.*所需弹窗上下文|未找到.*弹窗中的.*按钮|已禁止点击其他按钮)/.test(lastMessage) && Date.now() - start >= minWaitBeforeSkipMs) break;
    } catch (error) {
      lastMessage = error.message || String(error);
    }
    await sleepWithStop(1500);
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

async function dismissLingeringRiskDialog(reason = '检测到残留内容风险提示') {
  try {
    const result = await api.clickFanqieWorkflowAction('risk_cancel');
    if (result?.ok) {
      log(`${reason}，已处理。`);
      await sleepWithStop(700);
      await waitForWriterDomStable(400, 3000);
      return true;
    }
  } catch (_) {}
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


async function detectPublishCompletion() {
  let state = null;
  try {
    state = await getWriterStateSafe();
    const info = await withTimeout(
      executeInWriterWindowSafe(api.fanqieBuildPublishCompletionDetectionScript()),
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
      await dismissLingeringRiskDialog('章节管理页上检测到残留内容风险提示');
      log(`已回到章节管理相关页面：${info.url || '未知地址'}`);
      return { ok: true, info };
    }

    if (info?.hasTypoConfirm) {
      await dismissLingeringTypoDialog('发布流程中检测到错别字取消提示');
      await dismissLingeringRiskDialog('发布流程中检测到内容风险提示');
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
  log('开始执行完整发布流程：下一步 → 可选错别字提交 → 可选风险取消 → 使用AI → 选择立即发送 → 确认发布。');
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
      await dismissLingeringRiskDialog('未检测到发布设置前发现内容风险提示');
      continue;
    }

    await clickWorkflowActionWithRetry('send_immediately', '发送方式选择"立即发送"', 8000, { optional: true, waitAfterMs: 600, minWaitBeforeSkipMs: 2000, stableMs: 400 });
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


async function detectCurrentPage() {
  try {
    const pageScript = currentPlatform === 'qimao' ? api.qimaoBuildPageDetectionScript() : api.fanqieBuildPageDetectionScript();
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
  return api.fanqieBuildClickNewChapterScript();
}

function buildPlatformUploadScript(title, body, options) {
  if (currentPlatform === 'qimao') return api.qimaoBuildUploadScript(title, body, options);
  return api.fanqieBuildUploadScript(title, body, options);
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
    await dismissLingeringRiskDialog('开始下一章前检测到残留内容风险提示');
  }
  const stateAfterCleanup = await getWriterStateSafe();
  const editorPattern = platformEditorUrlPattern();
  const alreadyInEditor = editorPattern.test(stateAfterCleanup?.url || stateBeforeUpload?.url || '');
  try {
    const domConfirm = await withTimeout(
      executeInWriterWindowSafe("({ hasEditor: document.querySelectorAll('input,.ql-editor,[contenteditable=true],textarea').length > 0 })"),
      3000, "editor DOM check timeout");
    if (domConfirm && !domConfirm.hasEditor) {
      log("URL 匹配编辑器但页面未发现编辑元素，将按新建章节流程处理。");
    }
  } catch (_) {}

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
        if (currentPlatform === 'qimao') {
          // Qimao opens editor as in-page overlay/modal - URL doesn't change, use DOM-based detection
          log('等待七猫新建章节编辑区加载...');
          try {
            const editorReady = await withTimeout(
              executeInWriterWindow(api.qimaoBuildWaitForEditorReadyScript()),
              35000,
              '等待七猫编辑区加载超时'
            );
            if (editorReady?.ready) {
              log(`新建章节编辑区已就绪：${editorReady.url || '未知地址'}`);
            } else {
              log(`七猫编辑区状态：${editorReady?.message || '部分元素未就绪，尝试继续...'}`);
            }
          } catch (waitError) {
            log(`等待七猫编辑区时出错，继续尝试：${waitError.message}`);
          }
        } else {
          const readyState = await waitForWriterPageReady(editorPattern, 45000);
          log(`新建章节编辑页已就绪：${readyState.url || '未知地址'}`);
        }
      }
    } else {
      log('检测到当前已在新建章节编辑页，直接执行自动填写。');
    }

    if (!result) {
      const finalAction = els.publishAction.value || settings.publishAction || 'next';
      {
        const qimaoSaveDraft = currentPlatform === 'qimao' ? (finalAction === 'draft') : false;
        const qimaoAutoPublish = currentPlatform === 'qimao' && finalAction === 'next';
        const platformOptions = { clickNew: false, saveDraft: qimaoSaveDraft, autoPublish: qimaoAutoPublish };
        result = await withTimeout(
          executeInWriterWindow(buildPlatformUploadScript(chapter.title, chapter.body, platformOptions)),
          finalAction === 'next' ? 90000 : 45000,
          '当前编辑页填写脚本执行超时'
        );
      }
    }

    if (result?.ok) {
      const finalAction = els.publishAction.value || settings.publishAction || 'next';
      const label = '完整发布流程';
      log(`标题和正文已写入，完成后动作：${label}。`);
      if (finalAction === 'next') {
        if (currentPlatform === 'qimao') {
          // 七猫直接发布：上传脚本只填写不点击，此处分步执行发布操作
          // Step 1: click "立即发布" button on the editor page
          log('七猫：点击立即发布按钮...');
          let publishClicked = false;
          try {
            const clickResult = await withTimeout(
              executeInWriterWindow(api.qimaoBuildClickPublishScript()),
              15000,
              '点击发布按钮超时'
            );
            if (clickResult?.ok) {
              log(`七猫：已点击发布按钮：${clickResult.text || ''}`);
              publishClicked = true;
            } else {
              log(`七猫：点击发布按钮失败：${clickResult?.message || '未知错误'}`);
            }
          } catch (publishError) {
            log(`七猫：点击发布按钮异常：${publishError.message}`);
          }

          // Step 2: wait for confirmation popup and click confirm
          if (publishClicked) {
            await sleepWithStop(2000);
            log('七猫：等待发布确认弹窗并点击立即发布...');
            try {
              const confirmResult = await withTimeout(
                executeInWriterWindow(api.qimaoBuildClickConfirmPublishScript()),
                15000,
                '点击确认发布按钮超时'
              );
              if (confirmResult?.ok) {
                log(`七猫：已点击确认发布按钮：${confirmResult.text || ''}`);
              } else {
                log(`七猫：点击确认发布失败：${confirmResult?.message || '未知错误'}`);
              }
            } catch (confirmError) {
              log(`七猫：点击确认发布异常：${confirmError.message}`);
            }
          }

          // Step 3: wait for page to return to chapter manage page
          await sleepWithStop(2000);
          log('七猫：等待返回章节管理页...');
          const manageWaitStart = Date.now();
          const manageTimeout = 30000;
          let returnedToManage = false;
          while (Date.now() - manageWaitStart < manageTimeout) {
            ensureTaskNotStopped();
            try {
              const detectResult = await executeInWriterWindowSafe(
                api.qimaoBuildPublishCompletionDetectionScript()
              );
              if (detectResult?.isManage || detectResult?.hasNewChapter) {
                log('七猫已返回章节管理页，准备下一章。');
                returnedToManage = true;
                break;
              }
            } catch (_) {}
            await sleepWithStop(1000);
          }
          if (!returnedToManage) {
            log('七猫页面未检测到章节管理页（可能仍在过渡），继续...');
          }
        } else {
          const publishResult = await runDirectPublishFlow();
          result.publishInfo = publishResult.info || publishResult;
        }
      } else if (currentPlatform === 'fanqie' && finalAction !== 'none') {
        await clickFinalActionWithRetry(finalAction);
      } else if (currentPlatform === 'qimao' && finalAction === 'draft') {
        // 七猫存草稿：上传脚本只填写不点击，需在此处点击存草稿
        log('七猫：点击存草稿按钮...');
        try {
          const saveResult = await withTimeout(
            executeInWriterWindow(`(${function() {
              function visible(el) {
                if (!el || typeof el.getBoundingClientRect !== 'function') return false;
                var rect = el.getBoundingClientRect();
                var style = getComputedStyle(el);
                return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
              }
              function normalize(v) { return String(v || '').replace(/\\s+/g, ' ').trim(); }
              var btns = document.querySelectorAll('button,a,[role="button"],span');
              for (var i = 0; i < btns.length; i++) {
                var el = btns[i];
                if (!visible(el)) continue;
                var text = normalize(el.innerText || el.textContent || '');
                if (!text) continue;
                if (/存草稿|保存草稿|存为草稿/.test(text)) {
                  el.click();
                  return { ok: true, text: text };
                }
              }
              return { ok: false, message: '未找到存草稿按钮' };
            }.toString()})()`),
            15000,
            '点击存草稿超时'
          );
          if (saveResult?.ok) {
            log(`七猫：已点击存草稿按钮：${saveResult.text || ''}`);
          } else {
            log(`七猫：点击存草稿失败：${saveResult?.message || '未知错误'}`);
          }
        } catch (saveError) {
          log(`七猫：点击存草稿异常：${saveError.message}`);
        }
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
    const finalAction = result.finalAction || els.publishAction.value || settings.publishAction || 'next';
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
    if (finalAction !== "none") {
      log("等待页面返回章节管理页...");
      const backOk = await waitForBackToManage(20000);
      if (backOk) log("已确认返回章节管理页。");
      else log("等待返回章节管理页超时，下一章将重新检测页面状态。");
    }
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
  updateProgressBar(0, checkedChapters.length);
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

      const delay = Math.max(1500, Number(els.uploadDelay.value || 3500));
      await sleepWithStop(delay);
      updateProgressBar(chapters.filter(function(ch) { return ch.status === '\u5DF2\u4FDD\u5B58\u8349\u7A3F' || ch.status === '\u5DF2\u53D1\u5E03'; }).length, checkedChapters.length);
    }
  } finally {
    taskRunning = false;
    pauseRequested = false;
    waitResumeResolve = null;
    updateProgressBar(0, 0);
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
      const delay = Math.max(1500, Number(els.uploadDelay.value || 3500));
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
    if (settings.publishAction !== 'next') {
      settings.publishAction = 'next';
    }
  } catch (error) {
    log(`加载本地配置失败：${error.message}`);
  }

  els.removeTitleLine.checked = settings.removeTitleLine !== false;
  els.recursiveScan.checked = Boolean(settings.recursive);
  els.uploadDelay.value = String(settings.uploadDelayMs || 3500);
  els.publishAction.value = settings.publishAction || 'next';
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

els.selectFolderBtn.addEventListener('click', debounce(async () => {
  const selected = await api.selectFolder();
  if (!selected) return;
  folderPath = selected;
  els.folderPath.textContent = folderPath;
  await scanCurrentFolder();
  }, 500));

els.rescanBtn.addEventListener('click', debounce(scanCurrentFolder, 400));
els.removeTitleLine.addEventListener('change', debounce(scanCurrentFolder, 400));
els.recursiveScan.addEventListener('change', debounce(scanCurrentFolder, 400));
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

function applyChapterSearch() {
  var value = els.chapterSearchInput.value.trim();
  if (!value) {
    searchFilter = "";
    renderChapters();
    return;
  }
  var target = parseInt(value, 10);
  if (isNaN(target) || target < 1) {
    log("\u8bf7\u8f93\u5165\u6709\u6548\u7684\u7ae0\u8282\u53f7\uff08\u6b63\u6574\u6570\uff09\u3002");
    return;
  }
  var found = -1;
  for (var i = 0; i < chapters.length; i++) {
    if (chapters[i].index === target) { found = i; break; }
  }
  if (found === -1) {
    log("\u672a\u627e\u5230\u7b2c " + target + " \u7ae0\u3002");
    return;
  }
  searchFilter = "";
  selectedIndex = found;
  renderChapters();
  requestAnimationFrame(function() {
    var row2 = els.chapterTableBody.querySelector('tr[data-index="' + found + '"]');
    if (!row2) return;
    row2.scrollIntoView({ block: "center", behavior: "smooth" });
    var wrap = row2.closest(".table-wrap");
    if (wrap) {
      var rowRect = row2.getBoundingClientRect();
      var wrapRect = wrap.getBoundingClientRect();
      var offset = (rowRect.top - wrapRect.top) - (wrapRect.height / 2 - rowRect.height / 2);
      wrap.scrollTo({ top: wrap.scrollTop + offset, behavior: "smooth" });
    }
  });
  log("\u5df2\u8df3\u8f6c\u5230\u7b2c " + target + " \u7ae0\uff08" + (chapters[found].title || chapters[found].fileName) + "\uff09\u3002");
}

function clearChapterSearch() {
  if (els.chapterSearchInput) els.chapterSearchInput.value = "";
}

// Real-time search disabled - use Enter or click to jump
els.chapterSearchInput.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') { event.preventDefault(); applyChapterSearch(); }
  if (event.key === 'Escape') clearChapterSearch();
});
els.chapterJumpBtn.addEventListener('click', debounce(applyChapterSearch, 300));
if (els.chapterSearchClear) els.chapterSearchClear.addEventListener('click', clearChapterSearch);

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

els.openWriterBtn.addEventListener('click', debounce(handleOpenWriterWindow, 500));
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
els.loginReadyBtn.addEventListener('click', debounce(async () => {
  loginConfirmed = true;
  setLoginState('用户已确认');
  const name = platformInfo().displayName;
  log(`用户确认已登录${name}作家助手工作台。`);
  await detectCurrentPage();
  }, 500));
els.chapterPageReadyBtn.addEventListener('click', debounce(async () => {
  pageConfirmed = true;
  setPageState('用户已确认');
  log('用户确认已进入目标作品章节管理页。');
  await detectCurrentPage();
  }, 500));
els.testPageBtn.addEventListener('click', debounce(detectCurrentPage, 500));
els.startBtn.addEventListener('click', debounce(runBatchUpload, 500));
els.uploadSelectedBtn.addEventListener('click', debounce(uploadSelectedChapter, 500));
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
  if (!window.confirm('确定要停止当前上传任务吗？')) return;
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
  // 切换平台时同步更新"完成后动作"默认值：统一使用完整发布流程
  els.publishAction.value = 'next';
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

  const name = PLATFORM_INFO[newPlatform]?.displayName || '平台';
  log('已切换到' + name + '平台，请点击“打开作家助手工作台”打开新窗口。');
});

document.querySelectorAll('.nav-step-item').forEach(function(item) {
  item.addEventListener('click', function() {
    switchStep(Number(item.dataset.navStep));
  });
});

els.saveReportBtn.addEventListener('click', debounce(saveReport, 300));
els.clearLogBtn.addEventListener('click', () => {
  els.logBox.textContent = '';
});

init();
