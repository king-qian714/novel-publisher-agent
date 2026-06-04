const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const { TextDecoder } = require('util');

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
    /^(番外|番外篇)([\s\d０-９一二三四五六七八九十零〇、:：.．\-—].*)?$/u,
    new RegExp(`^Chapter\\s+${chapterNumber}\\b.*$`, 'ui'),
    new RegExp(`^${chapterNumber}\\s*[.、:：]\\s*.+$`, 'u')
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

module.exports = {
  scanChapters,
  extractTitleAndBody,
  looksLikeChapterTitle,
  countWords,
  naturalSortFiles,
  decodeText,
  normalizeLineEndings,
  sha256,
  stripMarkdownHeading,
  isMarkdownFile,
  stripMarkdownFrontMatter,
  isMarkdownSceneBreak,
  normalizeMarkdownBody
};
