const FANQIE_PARTITION = 'persist:fanqie-writer';
const FANQIE_DISPLAY_NAME = '番茄小说';
const FANQIE_APP_NAME = '番茄小说草稿上传助手';
const FANQIE_DEFAULT_URL = 'https://fanqienovel.com/main/writer/book-manage';

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
      return { ok: false, message: '未找到"新建章节"按钮', url: location.href };
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
  let cleanContent = normalizeUploadContent(content);
  const firstLine = cleanContent.split('\n').find((l) => l.trim());
  if (firstLine) {
    const firstLineClean = firstLine.trim();
    const titleClean = (title || '').trim();
    if (firstLineClean === titleClean || firstLineClean === (titleParts.titleText || '').trim()) {
      cleanContent = cleanContent.split('\n').slice(1).join('\n').replace(/^\n+/, '');
    }
  }
  const payload = {
    title,
    titleNumber: titleParts.titleNumber,
    titleText: titleParts.titleText,
    content: cleanContent,
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
        const doc = el.ownerDocument || document;
        try { el.focus(); } catch (_) {}
        try { el.select(); } catch (_) {}

        try { doc.execCommand('insertText', false, value); } catch (_) {}
        if (el.value === value) return;

        const tag = el.tagName.toLowerCase();
        const proto = tag === 'textarea' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
        const setter = (Object.getOwnPropertyDescriptor(proto, 'value') || {}).set;
        if (setter) {
          setter.call(el, value);
          el.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          el.dispatchEvent(new win.Event('change', { bubbles: true }));
        }
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
            result.message = '未找到"新建章节/新增章节"按钮，请确认已进入目标作品的章节管理页。';
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
          result.message = '章节号写入后仍未识别到，请检查"第 _ 章"的数字输入框。';
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
          result.message = '未找到"保存草稿"按钮。';
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
      const isEditor = /\\/publish\\//.test(url);
      const hardChapterManageUrl = /\\/chapter-manage\\//.test(url);
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

module.exports = {
  name: 'fanqie',
  displayName: FANQIE_DISPLAY_NAME,
  defaultUrl: FANQIE_DEFAULT_URL,
  sessionPartition: FANQIE_PARTITION,
  appName: FANQIE_APP_NAME,
  buildPageDetectionScript,
  buildClickNewChapterScript,
  buildUploadScript,
  buildPublishCompletionDetectionScript,
  buildWorkflowSnapshotScript
};
