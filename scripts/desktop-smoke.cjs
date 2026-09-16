const { _electron: electron } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  const userData = fs.mkdtempSync(path.resolve('test-results/electron-profile-'));
  let app;
  try {
    app = await electron.launch({ args: [path.resolve('.'), `--user-data-dir=${userData}`] });
    const page = await app.firstWindow();
    await page.getByRole('heading', { name: '전체 글.' }).waitFor();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    const unsafe = await page.evaluate(() => window.localclip.openSource('file:///C:/Windows/win.ini'));
    if (unsafe !== false) throw new Error('Unsafe URL allowed');
    const isolated = await page.evaluate(() => typeof window.require === 'undefined');
    if (!isolated) throw new Error('Node integration exposed');
    await page.screenshot({ path: 'test-results/electron-desktop.png' });
    await app.close(); app = null;
    app = await electron.launch({ args: [path.resolve('.'), `--user-data-dir=${userData}`] });
    const restarted = await app.firstWindow();
    await restarted.getByRole('button', { name: '저장됨', exact: true }).waitFor();
    console.log('PASS: Electron launch, local assets, isolation, unsafe URL rejection, save state after full restart.');
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
