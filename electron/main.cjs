const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const allowed = new Set(['www.inven.co.kr', 'inven.co.kr', 'aagag.com', 'www.aagag.com']);
function safeURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && allowed.has(u.hostname); }
  catch { return false; }
}
const archiveConfigPath = () => path.join(app.getPath('userData'), 'archive-config.json');
const cleanSegment = (value, fallback) => {
  const clean = String(value ?? '').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return clean || fallback;
};
const readArchiveRoot = async () => {
  try {
    const parsed = JSON.parse(await fsp.readFile(archiveConfigPath(), 'utf8'));
    return typeof parsed.root === 'string' && path.isAbsolute(parsed.root) ? parsed.root : null;
  } catch { return null; }
};
const writeArchiveRoot = async (root) => {
  await fsp.mkdir(path.dirname(archiveConfigPath()), { recursive: true });
  await fsp.writeFile(archiveConfigPath(), JSON.stringify({ root }, null, 2), 'utf8');
};
const indexPath = root => path.join(root, 'index.json');
const readArchiveIndex = async root => {
  try {
    const parsed = JSON.parse(await fsp.readFile(indexPath(root), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
};
const writeArchiveIndex = async (root, index) => {
  const temp = path.join(root, `.index-${process.pid}-${Date.now()}.tmp`);
  await fsp.writeFile(temp, JSON.stringify(index, null, 2), 'utf8');
  await fsp.rm(indexPath(root), { force: true });
  await fsp.rename(temp, indexPath(root));
};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validatePost = post => {
  if (!post || typeof post !== 'object') throw new Error('INVALID_POST');
  const text = key => typeof post[key] === 'string' ? post[key].slice(0, key === 'title' ? 300 : 5000) : '';
  const id = cleanSegment(text('id'), 'post');
  const source = cleanSegment(text('source'), 'unknown');
  const paragraphs = Array.isArray(post.paragraphs) ? post.paragraphs.filter(v => typeof v === 'string').slice(0, 300).map(v => v.slice(0, 20_000)) : [];
  const content = Array.isArray(post.content) ? post.content.filter(block => block && ['text', 'image', 'video'].includes(block.type) && typeof block.value === 'string').slice(0, 500).map(block => ({ type: block.type, value: block.value.slice(0, 20_000) })) : [];
  if (!text('title') || (!paragraphs.length && !content.length)) throw new Error('INVALID_POST');
  return { id, source, title: text('title'), author: text('author'), category: text('category'), sourceUrl: text('sourceUrl'), publishedAt: Number.isFinite(post.publishedAt) ? post.publishedAt : null, paragraphs, image: typeof post.image === 'string' ? post.image : null, content };
};
const postFolder = (root, post) => {
  const folder = path.resolve(root, post.source, post.id);
  const safeRoot = path.resolve(root) + path.sep;
  if (!folder.startsWith(safeRoot)) throw new Error('UNSAFE_ARCHIVE_PATH');
  return folder;
};
const archiveInfo = async () => {
  const root = await readArchiveRoot();
  if (!root) return { root: null, savedIds: [] };
  const index = await readArchiveIndex(root);
  return { root, savedIds: Object.keys(index) };
};
const assertMainFrame = (event, main) => {
  if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) throw new Error('INVALID_SENDER');
};
const parseRelativeTime = value => {
  const text = String(value || '').replace(/\s/g, '');
  const amount = Number(text.match(/\d+/)?.[0] || 0);
  if (text.includes('분전')) return Date.now() - amount * 60_000;
  if (text.includes('시간전')) return Date.now() - amount * 3_600_000;
  if (text.includes('일전')) return Date.now() - amount * 86_400_000;
  return Date.now();
};
const collectAagag = async () => {
  const collector = new BrowserWindow({ show: false, width: 1000, height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'persist:localclip-aagag' } });
  collector.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await collector.loadURL('https://aagag.com/issue/');
    const raw = await collector.webContents.executeJavaScript(`(() => ({
      title: document.title,
      items: [...document.querySelectorAll('a.article[href*="idx="]')].slice(0, 80).map(link => {
        const titleNode = link.querySelector('.title');
        const cleanTitle = titleNode?.cloneNode(true);
        cleanTitle?.querySelector('.btmlayer')?.remove();
        const background = link.querySelector('.thumb')?.style.backgroundImage || '';
        return {
          id: new URL(link.href).searchParams.get('idx'),
          url: link.href,
          title: cleanTitle?.textContent?.trim() || '',
          age: link.querySelector('.time')?.textContent?.trim() || '',
          size: link.querySelector('.byte')?.textContent?.trim() || '',
          hits: link.querySelector('.hit')?.textContent?.trim() || '',
          thumbnail: background.replace(/^url\\(["']?/, '').replace(/["']?\\)$/, '')
        };
      }).filter(item => item.id && item.title)
    }))()`);
    if (!raw.items.length) throw new Error(raw.title?.includes('Just a moment') ? 'AAGAG 보안 확인이 필요합니다.' : 'AAGAG 목록을 찾지 못했습니다.');
    return { ok: true, fetchedAt: Date.now(), posts: raw.items.map(item => ({
      id: `aagag-${item.id}`, boardId: 'aagag', title: item.title,
      excerpt: [item.size && `미디어 ${item.size}`, item.hits && `조회 ${item.hits}`].filter(Boolean).join(' · ') || 'AAGAG 공개 이슈',
      author: 'AAGAG', publishedAt: parseRelativeTime(item.age), category: '이슈',
      paragraphs: ['AAGAG에서 가져온 실제 공개 목록입니다.', '본문과 미디어는 아직 앱으로 수집하지 않습니다. 원문 열기로 확인할 수 있습니다.'],
      url: item.url, live: true
    })) };
  } catch (error) {
    return { ok: false, posts: [], fetchedAt: Date.now(), error: error instanceof Error ? error.message : 'AAGAG 연결에 실패했습니다.' };
  } finally { if (!collector.isDestroyed()) collector.destroy(); }
};
const collectAagagDetail = async url => {
  if (!safeURL(url) || new URL(url).hostname.replace(/^www\./, '') !== 'aagag.com' || !new URL(url).searchParams.has('idx')) return { ok: false, content: [], error: '올바르지 않은 AAGAG 글 주소입니다.' };
  const collector = new BrowserWindow({ show: false, width: 1000, height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'persist:localclip-aagag' } });
  collector.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await collector.loadURL(url);
    const content = await collector.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('#vContent');
      if (!root) return [];
      const blocks = [];
      const walk = node => {
        if (node.nodeType === Node.TEXT_NODE) { const value = node.textContent.trim(); if (value) blocks.push({ type: 'text', value }); return; }
        if (!(node instanceof Element)) return;
        if (node.matches('script,style,noscript')) return;
        if (node.matches('img')) { const value = node.currentSrc || node.src; if (value) blocks.push({ type: 'image', value }); return; }
        if (node.matches('video')) { const value = node.currentSrc || node.src || node.querySelector('source')?.src; if (value) blocks.push({ type: 'video', value }); return; }
        if (node.matches('iframe') && node.src) { blocks.push({ type: 'video', value: node.src }); return; }
        [...node.childNodes].forEach(walk);
      };
      [...root.childNodes].forEach(walk);
      return blocks.filter((block, index) => index === 0 || block.type !== 'text' || block.value !== blocks[index - 1]?.value);
    })()`);
    if (!content.length) throw new Error('AAGAG 본문을 찾지 못했습니다.');
    return { ok: true, content };
  } catch (error) { return { ok: false, content: [], error: error instanceof Error ? error.message : 'AAGAG 본문 수집에 실패했습니다.' }; }
  finally { if (!collector.isDestroyed()) collector.destroy(); }
};
const remoteMediaURL = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && ['i.aagag.com', 'aagag.com', 'www.aagag.com'].includes(url.hostname) ? url : null; }
  catch { return null; }
};
const extensionFor = (url, type) => {
  const ext = path.extname(url.pathname).toLowerCase();
  if (/^\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|m4v)$/i.test(ext)) return ext;
  return type === 'video' ? '.mp4' : '.webp';
};
const downloadAagagMedia = async (url, destination) => {
  const response = await session.fromPartition('persist:localclip-aagag').fetch(url.href);
  if (!response.ok) throw new Error(`MEDIA_HTTP_${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 100 * 1024 * 1024) throw new Error('MEDIA_TOO_LARGE');
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 100 * 1024 * 1024) throw new Error('MEDIA_TOO_LARGE');
  await fsp.writeFile(destination, data);
};
app.whenReady().then(() => {
  const main = new BrowserWindow({
    title: 'LocalClip', width: 1480, height: 980, minWidth: 780, minHeight: 620,
    backgroundColor: '#0f1115', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', event => event.preventDefault());
  main.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.aagag.com; media-src https://i.aagag.com; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"] } });
  });
  ipcMain.handle('open-source', (event, url) => {
    if (event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame || !safeURL(url)) return false;
    // Source browsing has no app privileges. AAGAG reuses its isolated site session for Cloudflare cookies.
    const source = new BrowserWindow({ title: 'LocalClip · 출처 사이트', width: 1120, height: 820, autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: url.includes('aagag.com') ? 'persist:localclip-aagag' : 'source-preview' } });
    source.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    source.webContents.on('will-navigate', (e, next) => { if (!safeURL(next)) e.preventDefault(); });
    source.webContents.on('will-redirect', (e, next) => { if (!safeURL(next)) e.preventDefault(); });
    source.loadURL(url).catch(() => { source.close(); });
    return true;
  });
  ipcMain.handle('archive-info', async event => { assertMainFrame(event, main); return archiveInfo(); });
  ipcMain.handle('aagag-refresh', async event => { assertMainFrame(event, main); return collectAagag(); });
  ipcMain.handle('aagag-detail', async (event, url) => { assertMainFrame(event, main); return collectAagagDetail(url); });
  ipcMain.handle('archive-choose-folder', async event => {
    assertMainFrame(event, main);
    const result = await dialog.showOpenDialog(main, { title: 'LocalClip 저장 위치 선택', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return archiveInfo();
    const root = path.join(result.filePaths[0], 'LocalClip');
    await fsp.mkdir(root, { recursive: true });
    await writeArchiveRoot(root);
    return archiveInfo();
  });
  ipcMain.handle('archive-save-post', async (event, input) => {
    assertMainFrame(event, main);
    const root = await readArchiveRoot();
    if (!root) return { ok: false, needsFolder: true };
    const post = validatePost(input);
    await fsp.mkdir(root, { recursive: true });
    const target = postFolder(root, post);
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    await fsp.mkdir(path.join(temp, 'images'), { recursive: true });
    let imageFile = null;
    try {
      if (post.image) {
        const imageName = path.basename(new URL(post.image, 'https://localclip.invalid/').pathname);
        if (/^[\w.-]+\.(svg|png|jpe?g|gif|webp)$/i.test(imageName)) {
          const sourceImage = path.join(__dirname, '..', 'dist', 'images', imageName);
          if (fs.existsSync(sourceImage)) { await fsp.copyFile(sourceImage, path.join(temp, 'images', imageName)); imageFile = imageName; }
        }
      }
      const mediaFiles = [];
      if (post.source === 'aagag' && post.content.length) {
        for (const [index, block] of post.content.entries()) {
          if (block.type === 'text') continue;
          const mediaURL = remoteMediaURL(block.value);
          if (!mediaURL) continue;
          const folder = block.type === 'video' ? 'videos' : 'images';
          await fsp.mkdir(path.join(temp, folder), { recursive: true });
          const file = `${String(index + 1).padStart(3, '0')}${extensionFor(mediaURL, block.type)}`;
          try { await downloadAagagMedia(mediaURL, path.join(temp, folder, file)); mediaFiles.push({ index, type: block.type, path: `${folder}/${file}` }); }
          catch { mediaFiles.push({ index, type: block.type, path: null }); }
        }
      }
      const metadata = { version: 1, ...post, image: imageFile ? `images/${imageFile}` : null, media: mediaFiles, videos: mediaFiles.filter(v => v.type === 'video' && v.path).map(v => v.path), savedAt: new Date().toISOString() };
      const contentBody = post.content.length ? post.content.map((block, index) => {
        if (block.type === 'text') return `<p>${escapeHTML(block.value)}</p>`;
        const media = mediaFiles.find(item => item.index === index && item.path);
        if (!media) return `<p class="missing">${block.type === 'video' ? '동영상' : '이미지'}를 저장하지 못했습니다.</p>`;
        return block.type === 'video' ? `<video controls src="${media.path}"></video>` : `<img src="${media.path}" alt="">`;
      }).join('\n') : post.paragraphs.map((paragraph, index) => /^0\d/.test(paragraph) ? `<h2>${escapeHTML(paragraph)}</h2>` : `<p>${escapeHTML(paragraph)}</p>`).join('\n');
      const body = contentBody;
      const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHTML(post.title)}</title><style>body{max-width:780px;margin:40px auto;padding:0 20px;background:#11151b;color:#e8ecf2;font:16px/1.8 system-ui,sans-serif}h1{line-height:1.35}h2{margin-top:2em}img,video{display:block;max-width:100%;height:auto;margin:20px auto}a{color:#8fbcff}.meta,.missing{color:#929baa;font-size:14px}</style></head><body><h1>${escapeHTML(post.title)}</h1><p class="meta">${escapeHTML(post.author)} · ${escapeHTML(post.category)}</p>${imageFile ? `<img src="images/${encodeURIComponent(imageFile)}" alt="">` : ''}${body}<p><a href="${escapeHTML(post.sourceUrl)}">원문</a></p></body></html>`;
      await Promise.all([fsp.writeFile(path.join(temp, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8'), fsp.writeFile(path.join(temp, 'index.html'), html, 'utf8')]);
      await fsp.rm(target, { recursive: true, force: true });
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.rename(temp, target);
      const index = await readArchiveIndex(root);
      index[post.id] = { source: post.source, folder: path.relative(root, target), title: post.title, savedAt: metadata.savedAt };
      await writeArchiveIndex(root, index);
      return { ok: true, folder: target, imageSaved: Boolean(imageFile) || mediaFiles.some(item => item.type === 'image' && item.path), partial: mediaFiles.some(item => !item.path) };
    } catch (error) { await fsp.rm(temp, { recursive: true, force: true }).catch(() => {}); throw error; }
  });
  ipcMain.handle('archive-delete-post', async (event, input) => {
    assertMainFrame(event, main);
    const root = await readArchiveRoot();
    if (!root) return { ok: true };
    const post = validatePost(input);
    await fsp.rm(postFolder(root, post), { recursive: true, force: true });
    const index = await readArchiveIndex(root);
    delete index[post.id];
    await fsp.mkdir(root, { recursive: true });
    await writeArchiveIndex(root, index);
    return { ok: true };
  });
  main.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());
