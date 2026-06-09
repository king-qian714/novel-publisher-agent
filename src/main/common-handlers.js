module.exports = {
  registerCommonHandlers({ platform, ipcMain, windows }) {
    ipcMain.handle(`${platform}:execute-js`, async (_event, script) => {
      const targetWindow = windows.getWriterWindowOrThrow();
      try {
        return await targetWindow.webContents.executeJavaScript(script, true);
      } catch (error) {
        const url = targetWindow.webContents.getURL();
        const message = error && error.message ? error.message : String(error);
        throw new Error(`${message}; url: ${url || 'unknown'}`);
      }
    });

    ipcMain.handle(`${platform}:execute-js-safe`, async (_event, script) => {
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

    ipcMain.handle(`${platform}:reload-writer-window`, async () => {
      const targetWindow = windows.getWriterWindowOrThrow();
      targetWindow.reload();
      return { ok: true };
    });

    ipcMain.handle(`${platform}:control-writer-window`, async (_event, action) => {
      const targetWindow = windows.getWriterWindowOrThrow();
      windows.controlWriterWindow(targetWindow, action);
      windows.emitWriterWindowState(`${platform}:writer-window-resized`);
      return {
        ok: true,
        open: true,
        url: targetWindow.webContents.getURL(),
        title: targetWindow.webContents.getTitle(),
        isMinimized: targetWindow.isMinimized(),
        isMaximized: targetWindow.isMaximized()
      };
    });

    ipcMain.handle(`${platform}:get-window-state`, async () => {
      const ww = windows.getWriterWindow();
      if (!ww || ww.isDestroyed()) {
        return { open: false, url: '', title: '' };
      }

      return {
        open: true,
        url: ww.webContents.getURL(),
        title: ww.webContents.getTitle(),
        isMinimized: ww.isMinimized(),
        isMaximized: ww.isMaximized()
      };
    });
  }
};
