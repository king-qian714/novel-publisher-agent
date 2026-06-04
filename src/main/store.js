const { app } = require('electron');
const fs = require('fs/promises');
const path = require('path');

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

module.exports = { getStoreDir, recordsPath, settingsPath, readJsonFile, writeJsonFile };
