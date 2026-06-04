const DEFAULT_QIMAO_URL = 'https://zuozhe.qimao.com/front/index';
const QIMAO_PARTITION = 'persist:qimao-writer';
const QIMAO_DISPLAY_NAME = '七猫小说';
const QIMAO_APP_NAME = '七猫小说草稿上传助手';

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
      return String(value || '').replace(/\\s+/g, ' ').trim();
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
      return { ok: false, message: '未找到"新建章节"按钮', url: location.href };
    }
    clickAt(candidates[0].el);
    return { ok: true, message: '已点击新建章节', buttonText: candidates[0].text, url: location.href };
  }.toString()})();`;
}

function buildUploadScript(title, body, options = {}) {
  // Qimao 上传时标题会自动加上"第X章"前缀，所以要去掉标题中已有的章节号
  const cleanedTitle = title.replace(/^第[0-9０-９零〇一二两三四五六七八九十百千万]+[章节张回]\s*/, '').trim() || title;
  const payload = {
    title: cleanedTitle,
    content: body || '',
    shouldClickNew: options.clickNew !== false
  };

  // 注意：本脚本只负责填写标题和正文，不进行任何按钮点击。
  // 存草稿/发布/确认弹窗等操作由 renderer 在脚本返回后分步执行。
  return `(${function runQimaoUpload(payload) {
    return (async () => {
      const { title, content, shouldClickNew } = payload;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const result = { ok: false, step: '初始化', message: '', details: {} };

      function stage(name) {
        result.step = name;
        try { console.log('[七猫上传助手] ' + name); } catch (_) {}
      }

      function normalizeText(value) {
        return String(value || '').replace(/\\s+/g, ' ').trim();
      }

      function visible(el) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
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
        return false;
      }

      function findByTexts(texts, excludes = []) {
        const candidates = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'));
        const exact = [];
        const fuzzy = [];
        for (const el of candidates) {
          if (!visible(el)) continue;
          const text = normalizeText(el.innerText || el.textContent || '');
          if (!text || text.length > 120) continue;
          if (excludes.some((ex) => text.includes(ex))) continue;
          if (texts.some((t) => text === t)) exact.push(el);
          else if (texts.some((t) => text.includes(t))) fuzzy.push(el);
        }
        return exact[0] || fuzzy[0] || null;
      }

      function clickElement(el) {
        if (!el) return false;
        const target = el.closest('button,a,[role="button"],[tabindex]') || el;
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        target.scrollIntoView({ block: 'center', inline: 'center' });
        target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
        target.click();
        return true;
      }

      function setNativeValue(el, value) {
        try { el.focus(); } catch (_) {}
        try { el.select(); } catch (_) {}
        try { document.execCommand('insertText', false, value); } catch (_) {}
        if (el.value === value) return;
        const tag = el.tagName.toLowerCase();
        const proto = tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = (Object.getOwnPropertyDescriptor(proto, 'value') || {}).set;
        if (setter) {
          setter.call(el, value);
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      function findTitleField() {
        // Qimao specific: chapter name textarea with placeholder "请输入章节名称，最多20个字"
        const qimaoSelectors = [
          '.chapter-header textarea.el-textarea__inner',
          '.chapter-name textarea',
          '.chapter-index-name-wrap textarea',
          'textarea[placeholder*="章节名称"]'
        ];
        for (const selector of qimaoSelectors) {
          const found = Array.from(document.querySelectorAll(selector)).find(visible);
          if (found) return found;
        }
        // Fallback generic selectors
        const fallbackSelectors = [
          'input[placeholder*="标题"]',
          'textarea[placeholder*="标题"]',
          '[data-placeholder*="标题"]',
          '[aria-label*="标题"]',
          'input[placeholder*="请输入标题"]'
        ];
        for (const selector of fallbackSelectors) {
          const found = Array.from(document.querySelectorAll(selector)).find(visible);
          if (found) return found;
        }
        return null;
      }

      function findContentField() {
        // Qimao specific: target ONLY the main chapter editor, not author note or overlays
        // Main editor is inside .chapter-editor, NOT inside .author-say-editor
        const preciseSelectors = [
          '.chapter-editor .q-contenteditable.edit-mask',
          '.chapter-editor .q-contenteditable[contenteditable="true"]',
          '.chapter-con .q-contenteditable.edit-mask',
          '.q-contenteditable.book.font-size-16.edit-mask',
          '.q-contenteditable:not(.search-mask):not(.line-mask):not(.contrast-mask):not(.font-size-14)'
        ];
        for (const selector of preciseSelectors) {
          const found = Array.from(document.querySelectorAll(selector)).filter(visible);
          if (found.length > 0) return found[0];
        }
        // Broader Qimao selector (exclude overlays by id)
        const broadSelector = '.q-contenteditable[contenteditable="true"]';
        const broad = Array.from(document.querySelectorAll(broadSelector))
          .filter(el => visible(el) && !el.closest('.author-say-editor') && el.id !== 'js-search' && el.id !== 'js-line' && el.id !== 'js-contrast');
        if (broad.length > 0) return broad[0];
        // Fallback generic selectors
        const fallbackSelectors = [
          '[contenteditable="true"]',
          'textarea[placeholder*="正文"]',
          'textarea[placeholder*="内容"]',
          '.ProseMirror',
          '.ql-editor'
        ];
        const candidates = [];
        for (const selector of fallbackSelectors) {
          candidates.push(...Array.from(document.querySelectorAll(selector)).filter(visible));
        }
        const scored = candidates.map((el) => {
          const rect = el.getBoundingClientRect();
          let score = rect.width * rect.height;
          if (/chapter-editor|chapter-con|edit-mask|q-contenteditable/i.test(el.className)) score += 50000;
          if (/book/.test(el.className)) score += 30000;
          if (el.closest('.author-say-editor')) score -= 100000;
          return { el, score };
        }).sort((a, b) => b.score - a.score);
        return scored[0] ? scored[0].el : null;
      }

      try {
        stage('检测页面');

        if (shouldClickNew) {
          stage('点击新建章节');
          const newBtn = findByTexts(['新建章节', '新增章节', '创建章节', '写新章节', '添加章节']);
          if (newBtn) {
            clickElement(newBtn);
            await sleep(1500);
          }
        }

        stage('填写标题');
        const titleField = findTitleField();
        if (titleField) {
          setNativeValue(titleField, title);
          await sleep(500);
        }

        stage('填写正文');
        const contentField = findContentField();
        if (contentField) {
          const tag = contentField.tagName.toLowerCase();
          if (tag === 'textarea' || tag === 'input') {
            setNativeValue(contentField, content);
          } else {
            const doc = contentField.ownerDocument || document;
            const win = doc.defaultView || window;
            const beforeLength = normalizeText(contentField.innerText || contentField.textContent || '').length;

            try { contentField.focus(); } catch (_) {}
            await sleep(100);

            try {
              const selection = win.getSelection();
              const range = doc.createRange();
              range.selectNodeContents(contentField);
              selection.removeAllRanges();
              selection.addRange(range);
            } catch (_) {}

            function buildContentHTML(text) {
              var paragraphs = text
                .split(/\n{2,}/)
                .map(function(p) { return p.trim(); })
                .filter(Boolean);
              if (paragraphs.length > 0) {
                return paragraphs
                  .map(function(p) { return '<p>' + p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>'; })
                  .join('');
              }
              return '<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
            }

            function hasContentLength(el) {
              return normalizeText(el.innerText || el.textContent || '').length;
            }

            let hasContent = false;
            var contentHTML = buildContentHTML(content);
            var minLen = Math.min(10, normalizeText(content).length);

            try {
              if (contentHTML) doc.execCommand('insertHTML', false, contentHTML);
            } catch (_) {}
            await sleep(200);
            hasContent = hasContentLength(contentField) > beforeLength + minLen;

            if (!hasContent) {
              contentField.innerHTML = contentHTML;
              try { contentField.dispatchEvent(new win.InputEvent('beforeinput', { bubbles: true, cancelable: true })); } catch (_) {}
              try { contentField.dispatchEvent(new win.InputEvent('input', { bubbles: true })); } catch (_) { contentField.dispatchEvent(new win.Event('input', { bubbles: true })); }
              contentField.dispatchEvent(new win.Event('change', { bubbles: true }));
              await sleep(100);
              hasContent = hasContentLength(contentField) > beforeLength + minLen;
            }

            if (!hasContent) {
              try {
                var textSel = win.getSelection();
                var textRange = doc.createRange();
                textRange.selectNodeContents(contentField);
                textSel.removeAllRanges();
                textSel.addRange(textRange);
                doc.execCommand('insertText', false, content);
              } catch (_) {}
              await sleep(200);
              hasContent = hasContentLength(contentField) > beforeLength + minLen;
            }

            const finalContentLength = normalizeText(contentField.innerText || contentField.textContent || '').length;
            result.details.contentLength = finalContentLength;
            result.details.contentInjected = hasContent;
          }
          await sleep(800);
        } else {
          result.message = '未找到正文编辑区域';
          result.details.url = location.href;
          return result;
        }

        // 本脚本只填写，不点击任何按钮。存草稿/发布由 renderer 分步执行。
        result.ok = true;
        stage('已填写');
        result.message = '标题和正文已写入。';
        return result;
      } catch (error) {
        result.ok = false;
        result.message = error && error.message ? error.message : String(error);
        return result;
      }
    })();
  }.toString()})(${JSON.stringify(payload)});`;
}

function buildClickPublishScript() {
  return `(${function clickPublish() {
    function visible(el) {
      if (!el || typeof el.getBoundingClientRect !== 'function') return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }
    function normalize(value) { return String(value || '').replace(/\\s+/g, ' ').trim(); }
    // Find publish button, excluding save-draft buttons
    // Step 1: CSS class selector
    var allBtns = document.querySelectorAll('a.qm-btn, button.qm-btn');
    for (var i = 0; i < allBtns.length; i++) {
      var btn = allBtns[i];
      if (!visible(btn)) continue;
      var text = normalize(btn.innerText || btn.textContent || '');
      if (!text) continue;
      // 排除存草稿/保存类按钮
      if (/存草稿|保存草稿|保存|取消/.test(text)) continue;
      if (/立即发布|发布|提交/.test(text)) {
        var target = btn.closest('button,a,[role="button"]') || btn;
        target.click();
        return { ok: true, text: normalize(target.innerText || target.textContent), method: 'css' };
      }
    }
    // Step 2: text fallback - exclude save/cancel buttons
    var allCandidates = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'))
      .filter(visible)
      .filter(function(el) {
        var t = normalize(el.innerText || el.textContent || '');
        if (!t || t.length > 40) return false;
        if (/存草稿|保存草稿|保存|取消/.test(t)) return false;
        return /^(发布|提交|立即发布|发布章节)$/.test(t);
      });
    if (allCandidates.length === 0) return { ok: false, message: '未找到发布按钮' };
    var target = allCandidates[0].closest('button,a,[role="button"]') || allCandidates[0];
    target.click();
    return { ok: true, text: normalize(target.innerText || target.textContent), method: 'text' };
  }.toString()})();`;
}

function buildClickConfirmPublishScript() {
  return `(${function clickConfirm() {
    function visible(el) {
      if (!el || typeof el.getBoundingClientRect !== 'function') return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }
    function normalize(value) { return String(value || '').replace(/\\s+/g, ' ').trim(); }
    function findByTexts(texts, excludes) {
      var all = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'));
      var exact = [], fuzzy = [];
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (!visible(el)) continue;
        var t = normalize(el.innerText || el.textContent || '');
        if (!t || t.length > 40) continue;
        if (excludes.some(function(ex) { return t.includes(ex); })) continue;
        if (texts.some(function(tx) { return t === tx; })) exact.push(el);
        else if (texts.some(function(tx) { return t.includes(tx); })) fuzzy.push(el);
      }
      return exact[0] || fuzzy[0] || null;
    }
    // Step 1: CSS class selector for primary buttons
    var cssBtn = document.querySelector('a.qm-btn.important, button.qm-btn.important');
    if (cssBtn && visible(cssBtn)) {
      var target = cssBtn.closest('button,a,[role="button"]') || cssBtn;
      target.click();
      return { ok: true, text: normalize(target.innerText || target.textContent), method: 'css' };
    }
    // Step 2: search within visible popup/dialog (弹窗内找确认按钮)
    var dialog = document.querySelector('.el-dialog, .el-message-box, .dialog-container, [role="dialog"], .modal-content, .el-message-box__wrapper, .dialog');
    if (dialog && visible(dialog)) {
      var dialogBtns = dialog.querySelectorAll('button,a,[role="button"],span');
      for (var i = 0; i < dialogBtns.length; i++) {
        var btn = dialogBtns[i];
        if (!visible(btn)) continue;
        var txt = normalize(btn.innerText || btn.textContent || '');
        if (!txt || txt.length > 40) continue;
        if (/存草稿|保存草稿|取消/.test(txt)) continue;
        if (/^(确认发布|确定发布|立即发布|发布|确认|确定)$/.test(txt)) {
          var target = btn.closest('button,a,[role="button"]') || btn;
          target.click();
          return { ok: true, text: normalize(target.innerText || target.textContent), method: 'dialog' };
        }
      }
    }
    // Step 3: global text fallback
    var btn = findByTexts(
      ['确认发布', '确定发布', '立即发布', '确认', '确定'],
      ['取消', '存草稿', '保存草稿', '保存']
    );
    if (!btn) return { ok: false, message: '未找到确认发布按钮' };
    var target = btn.closest('button,a,[role="button"]') || btn;
    target.click();
    return { ok: true, text: normalize(target.innerText || target.textContent), method: 'text' };
  }.toString()})();`;
}

function buildPublishCompletionDetectionScript() {
  return `(${function detectCompletion() {
    const text = document.body ? document.body.innerText : '';
    const buttons = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'))
      .map(el => (el.innerText || el.textContent || '').trim())
      .filter(t => t && t.length <= 60)
      .slice(0, 80);
    const url = location.href;
    const hasSuccess = /发布成功|提交成功|发布完成|已成功发布|操作成功/.test(text);
    const hasNewChapter = buttons.some(t => /新建章节|新增章节|创建章节/.test(t));
    const isManage = /章节管理|章节目录|作品管理/.test(text) || hasNewChapter;
    return { url, hasSuccess, hasNewChapter, isManage, sampleButtons: buttons.slice(0, 16) };
  }.toString()})();`;
}

/**
 * Build script that waits for the Qimao chapter editor to be ready.
 * Qimao opens the editor as an in-page overlay/modal (no URL change),
 * so we must poll for editor DOM elements instead of URL-based detection.
 */
function buildWaitForEditorReadyScript() {
  return `(${function waitForQimaoEditor() {
    return new Promise(function(resolve) {
      var start = Date.now();
      var timeout = 30000;

      function visible(el) {
        if (!el) return false;
        try {
          var rect = el.getBoundingClientRect();
          var style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        } catch (e) { return false; }
      }

      function findTitleField() {
        var selectors = [
          '.chapter-header textarea.el-textarea__inner',
          '.chapter-name textarea',
          '.chapter-index-name-wrap textarea',
          'textarea[placeholder*="章节名称"]'
        ];
        for (var i = 0; i < selectors.length; i++) {
          var found = document.querySelector(selectors[i]);
          if (found && visible(found)) return found;
        }
        return null;
      }

      function findContentField() {
        var selectors = [
          '.chapter-editor .q-contenteditable.edit-mask',
          '.chapter-editor .q-contenteditable[contenteditable="true"]',
          '.chapter-con .q-contenteditable.edit-mask',
          '.q-contenteditable.book.font-size-16.edit-mask'
        ];
        for (var i = 0; i < selectors.length; i++) {
          var found = document.querySelector(selectors[i]);
          if (found && visible(found)) return found;
        }
        return null;
      }

      function check() {
        var titleEl = findTitleField();
        var contentEl = findContentField();
        if (titleEl && contentEl) {
          resolve({ ok: true, ready: true, url: location.href });
        } else if (Date.now() - start > timeout) {
          var parts = [];
          if (!titleEl) parts.push('标题输入框');
          if (!contentEl) parts.push('正文编辑区');
          resolve({ ok: false, ready: false, url: location.href, message: parts.join('+') + '未就绪' });
        } else {
          setTimeout(check, 500);
        }
      }
      check();
    });
  }.toString()})();`;
}

module.exports = {
  defaultUrl: DEFAULT_QIMAO_URL,
  sessionPartition: QIMAO_PARTITION,
  displayName: QIMAO_DISPLAY_NAME,
  appName: QIMAO_APP_NAME,
  buildPageDetectionScript,
  buildClickNewChapterScript,
  buildUploadScript,
  buildClickPublishScript,
  buildClickConfirmPublishScript,
  buildPublishCompletionDetectionScript,
  buildWaitForEditorReadyScript
};
