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
    const saved = await page.evaluate(() => window.localclip.savePost({ id: 'demo-1', source: 'aagag', title: '느리게 걷는 주말, 서울 근교 산책길 5곳', author: '오후의산책', category: '여행 · 일상', sourceUrl: 'https://aagag.com/', publishedAt: Date.now(), paragraphs: ['test'], image: './images/landscape.svg' }));
    if (!saved.ok) throw new Error('Archive save failed');
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
    const aagag = await page.evaluate(() => window.localclip.refreshAagag());
    if (!aagag.ok || aagag.posts.length < 1 || !aagag.posts[0].url?.includes('aagag.com/issue/?idx=')) throw new Error(`AAGAG live collection failed: ${aagag.error || 'empty list'}`);
    const live = aagag.posts.find(post => post.url);
    const detail = await page.evaluate(url => window.localclip.getAagagDetail(url), live.url);
    if (!detail.ok || !detail.content.some(block => block.type === 'text' || block.type === 'image' || block.type === 'video')) throw new Error(`AAGAG detail collection failed: ${detail.error || 'empty body'}`);
    const liveSaved = await page.evaluate(input => window.localclip.savePost(input), { id: live.id, source: 'aagag', title: live.title, author: live.author, category: live.category, sourceUrl: live.url, publishedAt: live.publishedAt, paragraphs: detail.content.filter(block => block.type === 'text').map(block => block.value), content: detail.content });
    if (!liveSaved.ok) throw new Error('AAGAG detail archive failed');
    const liveFolder = path.join(archiveRoot, 'aagag', live.id);
    const liveMetadata = JSON.parse(fs.readFileSync(path.join(liveFolder, 'metadata.json'), 'utf8'));
    for (const media of liveMetadata.media.filter(item => item.path)) if (!fs.existsSync(path.join(liveFolder, media.path))) throw new Error(`Downloaded media missing: ${media.path}`);
    await page.evaluate(input => window.localclip.deletePost(input), { id: live.id, source: 'aagag', title: live.title, author: live.author, category: live.category, sourceUrl: live.url, publishedAt: live.publishedAt, paragraphs: ['test'] });
    await page.screenshot({ path: 'test-results/electron-desktop.png' });
    await app.close(); app = null;
    app = await electron.launch({ args: [path.resolve('.'), `--user-data-dir=${userData}`] });
    const restarted = await app.firstWindow();
    const restored = await restarted.evaluate(() => window.localclip.getArchiveInfo());
    if (!restored.savedIds.includes('demo-1')) throw new Error('Archive state was not restored');
    await restarted.evaluate(() => window.localclip.deletePost({ id: 'demo-1', source: 'aagag', title: '느리게 걷는 주말, 서울 근교 산책길 5곳', author: '작은배낭', category: '여행 · 일상', sourceUrl: 'https://aagag.com/', publishedAt: Date.now(), paragraphs: ['test'] }));
    if (fs.existsSync(postFolder)) throw new Error('Archive folder was not deleted');
    console.log('PASS: AAGAG live list/detail/media archive, Electron isolation, restart restore, and folder deletion.');
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
