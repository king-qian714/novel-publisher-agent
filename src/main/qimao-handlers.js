const commonHandlers = require('./common-handlers');
const platforms = require('../platforms');

module.exports = {
  register({ ipcMain, windows, chapterScanner, store }) {
    const qimaoDefaultUrl = platforms.get('qimao').defaultUrl;

    commonHandlers.registerCommonHandlers({ platform: 'qimao', ipcMain, windows });

    ipcMain.handle('qimao:open-writer-window', async (_event, payload) => {
      const targetUrl = payload?.url || qimaoDefaultUrl;
      windows.openWriterWindow('qimao', targetUrl);
      return { ok: true };
    });
  }
};
