const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const allowed = new Set(['www.inven.co.kr', 'inven.co.kr', 'aagag.com', 'www.aagag.com']);
function safeURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && allowed.has(u.hostname); }
  catch { return false; }
}
app.whenReady().then(() => {
  const main = new BrowserWindow({
    title: 'LocalClip', width: 1480, height: 980, minWidth: 780, minHeight: 620,
    backgroundColor: '#f7f9fc', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', event => event.preventDefault());
  main.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"] } });
  });
  ipcMain.handle('open-source', (event, url) => {
    if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame || !safeURL(url)) return false;
    // Demo source browsing is isolated and ephemeral. No app privileges or saved login claims.
    const source = new BrowserWindow({ title: 'LocalClip · 출처 사이트', width: 1120, height: 820, autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'source-preview' } });
    source.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    source.webContents.on('will-navigate', (e, next) => { if (!safeURL(next)) e.preventDefault(); });
    source.webContents.on('will-redirect', (e, next) => { if (!safeURL(next)) e.preventDefault(); });
    source.loadURL(url).catch(() => { source.close(); });
    return true;
  });
  main.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());
