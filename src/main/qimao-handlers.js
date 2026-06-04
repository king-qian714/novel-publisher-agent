module.exports = {
  register({ ipcMain, windows, chapterScanner, store }) {
    ipcMain.handle('qimao:open-writer-window', async (_event, payload) => {
      const targetUrl = payload?.url || windows.DEFAULT_QIMAO_URL;
      windows.openWriterWindow('qimao', targetUrl);
      return { ok: true };
    });

    ipcMain.handle('qimao:execute-js', async (_event, script) => {
      const targetWindow = windows.getWriterWindowOrThrow();
      try {
        return await targetWindow.webContents.executeJavaScript(script, true);
      } catch (error) {
        const url = targetWindow.webContents.getURL();
        const message = error && error.message ? error.message : String(error);
        throw new Error(`${message}; url: ${url || 'unknown'}`);
      }
    });

    ipcMain.handle('qimao:execute-js-safe', async (_event, script) => {
      const targetWindow = windows.getWriterWindowOrThrow();
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
      const targetWindow = windows.getWriterWindowOrThrow();
      targetWindow.reload();
      return { ok: true };
    });

    ipcMain.handle('qimao:control-writer-window', async (_event, action) => {
      const targetWindow = windows.getWriterWindowOrThrow();
      windows.controlWriterWindow(targetWindow, action);
      windows.emitWriterWindowState('qimao:writer-window-resized');
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
      const ww = windows.getWriterWindow();
      if (!ww || ww.isDestroyed()) {
        return { open: false, platform: 'qimao', url: '', title: '' };
      }
      return {
        open: true,
        platform: 'qimao',
        url: ww.webContents.getURL(),
        title: ww.webContents.getTitle(),
        isMinimized: ww.isMinimized(),
        isMaximized: ww.isMaximized()
      };
    });
  }
};
