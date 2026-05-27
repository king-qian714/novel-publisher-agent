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
  const payload = {
    title: title || '',
    content: body || '',
    shouldClickNew: options.clickNew !== false,
    saveDraft: options.saveDraft !== false
  };

  return `(${function runQimaoUpload(payload) {
    return (async () => {
      const { title, content, shouldClickNew, saveDraft } = payload;
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
        const selectors = [
          'input[placeholder*="标题"]',
          'textarea[placeholder*="标题"]',
          '[data-placeholder*="标题"]',
          '[aria-label*="标题"]',
          'input[placeholder*="请输入标题"]'
        ];
        for (const selector of selectors) {
          const found = Array.from(document.querySelectorAll(selector)).find(visible);
          if (found) return found;
        }
        return null;
      }

      function findContentField() {
        const selectors = [
          '[contenteditable="true"]',
          'textarea[placeholder*="正文"]',
          'textarea[placeholder*="内容"]',
          '.ProseMirror',
          '.ql-editor'
        ];
        const candidates = [];
        for (const selector of selectors) {
          candidates.push(...Array.from(document.querySelectorAll(selector)).filter(visible));
        }
        const scored = candidates.map((el) => {
          const rect = el.getBoundingClientRect();
          let score = rect.width * rect.height;
          if (el.getAttribute('contenteditable') === 'true') score += 100000;
          if (/ProseMirror|ql-editor|editor/i.test(el.className)) score += 50000;
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
            contentField.focus();
            await sleep(100);
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(contentField);
            selection.removeAllRanges();
            selection.addRange(range);
            try {
              const data = new DataTransfer();
              data.setData('text/plain', content);
              const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
              contentField.dispatchEvent(event);
            } catch (_) {}
            if (!contentField.innerText || contentField.innerText.length < 10) {
              try { document.execCommand('insertText', false, content); } catch (_) {}
            }
            if (!contentField.innerText || contentField.innerText.length < 10) {
              contentField.innerHTML = content.split('\\n\\n').map(p => '<p>' + p.trim().replace(/\\n/g, '<br>') + '</p>').join('');
            }
          }
          await sleep(800);
        } else {
          result.message = '未找到正文编辑区域';
          result.details.url = location.href;
          return result;
        }

        if (!saveDraft) {
          result.ok = true;
          stage('已填写');
          result.message = '标题和正文已写入，等待主程序操作。';
          return result;
        }

        stage('保存草稿');
        const saveBtn = findByTexts(['存草稿', '保存草稿', '存为草稿', '保存'], ['发布', '提交审核', '立即发布']);
        if (saveBtn) {
          clickElement(saveBtn);
          await sleep(2000);
        }

        result.ok = true;
        stage('完成');
        result.message = '已尝试保存草稿。';
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
    const btn = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'))
      .filter(visible)
      .find(el => /^(发布|提交|立即发布|发布章节)$/.test(normalize(el.innerText || el.textContent)));
    if (!btn) return { ok: false, message: '未找到发布按钮' };
    const target = btn.closest('button,a,[role="button"]') || btn;
    target.click();
    return { ok: true, text: normalize(target.innerText || target.textContent) };
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
    const btn = Array.from(document.querySelectorAll('button,a,[role="button"],span,div'))
      .filter(visible)
      .find(el => /^(确认发布|确定发布|确认|确定)$/.test(normalize(el.innerText || el.textContent)));
    if (!btn) return { ok: false, message: '未找到确认发布按钮' };
    const target = btn.closest('button,a,[role="button"]') || btn;
    target.click();
    return { ok: true, text: normalize(target.innerText || target.textContent) };
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
  buildPublishCompletionDetectionScript
};
