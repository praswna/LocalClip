const { _electron: electron } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  const userData = fs.mkdtempSync(path.resolve('test-results/electron-profile-'));
  const archiveParent = fs.mkdtempSync(path.resolve('test-results/archive-parent-'));
  const archiveRoot = path.join(archiveParent, 'LocalClip');
  fs.mkdirSync(archiveRoot, { recursive: true });
  fs.writeFileSync(path.join(userData, 'archive-config.json'), JSON.stringify({ root: archiveRoot }));
  let app;
  try {
    app = await electron.launch({ args: [path.resolve('.'), `--user-data-dir=${userData}`] });
    const page = await app.firstWindow();
    await page.getByRole('heading', { name: '전체 글' }).waitFor();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByRole('button', { name: '저장됨', exact: true }).waitFor();
    const postFolder = path.join(archiveRoot, 'aagag', 'demo-1');
    for (const file of ['index.html', 'metadata.json', path.join('images', 'landscape.svg')]) {
      if (!fs.existsSync(path.join(postFolder, file))) throw new Error(`Archive file missing: ${file}`);
    }
    const metadata = JSON.parse(fs.readFileSync(path.join(postFolder, 'metadata.json'), 'utf8'));
    if (!Array.isArray(metadata.videos) || metadata.title !== '느리게 걷는 주말, 서울 근교 산책길 5곳') throw new Error('Invalid archive metadata');
    const unsafe = await page.evaluate(() => window.localclip.openSource('file:///C:/Windows/win.ini'));
    if (unsafe !== false) throw new Error('Unsafe URL allowed');
    const isolated = await page.evaluate(() => typeof window.require === 'undefined');
    if (!isolated) throw new Error('Node integration exposed');
    await page.screenshot({ path: 'test-results/electron-desktop.png' });
    await app.close(); app = null;
    app = await electron.launch({ args: [path.resolve('.'), `--user-data-dir=${userData}`] });
    const restarted = await app.firstWindow();
    await restarted.getByRole('button', { name: '저장됨', exact: true }).waitFor();
    await restarted.getByRole('button', { name: '저장됨', exact: true }).click();
    await restarted.getByRole('button', { name: '보관함에서 삭제', exact: true }).click();
    if (fs.existsSync(postFolder)) throw new Error('Archive folder was not deleted');
    console.log('PASS: Electron isolation, real per-post archive files, image copy, restart restore, and folder deletion.');
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
