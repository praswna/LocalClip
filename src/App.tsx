import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownWideNarrow, ArrowLeft, ArrowUpRight, BookOpen, Bookmark, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, ExternalLink, Folder, Inbox, LayoutGrid, LoaderCircle, LockKeyhole, Plus, RefreshCw, Search, Settings2, ShieldCheck, WifiOff, X } from 'lucide-react';
import { DemoRepository, parseBoard } from './data/repository';
import { freshState } from './data/seed';
import type { ArchivePost, Board, DemoState, Post } from './data/types';

type View = 'all' | 'unread' | 'saved' | 'settings' | string;
type Scenario = 'normal' | 'empty' | 'loading' | 'auth' | 'partial';
const sourceName = (b?: Board) => b?.source === 'inven' ? '인벤' : b?.source === 'aagag' ? 'AAGAG' : '준비 중';
const repository = new DemoRepository({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
function timeAgo(timestamp: number) {
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
  return minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : `${Math.floor(minutes / 1440)}일 전`;
}
function Modal({ title, close, children }: { title: string; close(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = ref.current!; const previous = document.activeElement as HTMLElement | null; node.showModal(); node.querySelector<HTMLInputElement>('input')?.focus(); return () => { node.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="modal-head"><h2>{title}</h2><button className="icon-btn" aria-label="닫기" onClick={close}><X size={20} /></button></div>{children}
  </dialog>;
}
function SourceIcon({ board }: { board?: Board }) { return <span className={`source-icon ${board?.source ?? 'unsupported'}`}>{board?.source === 'inven' ? 'i' : board?.source === 'aagag' ? 'A' : <Folder size={14} />}</span>; }

export default function App() {
  const [boot] = useState(() => { try { return { data: repository.load(), error: '' }; } catch { return { data: freshState(), error: '저장된 데모 상태를 불러오지 못했습니다. 이번 변경부터 다시 저장합니다.' }; } });
  const [state, setState] = useState<DemoState>(boot.data);
  const [posts, setPosts] = useState<Post[]>(() => repository.posts());
  const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState('');
  const [boardFilter, setBoardFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>('demo-1');
  const [detailMobile, setDetailMobile] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [storageError, setStorageError] = useState(boot.error);
  const [deletePost, setDeletePost] = useState<Post | null>(null);
  const [sort, setSort] = useState('newest');
  const [archiveRoot, setArchiveRoot] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshFn = useRef<() => void>(() => {});

  useEffect(() => { try { repository.save(state); } catch { setStorageError('기기에 상태를 저장하지 못했습니다. 저장 공간이나 브라우저 권한을 확인해 주세요.'); } }, [state]);
  useEffect(() => {
    if (!window.localclip) return;
    window.localclip.getArchiveInfo().then(info => {
      setArchiveRoot(info.root);
      setState(s => ({ ...s, saved: Object.fromEntries(info.savedIds.map((id, index) => [id, Date.now() - index])) }));
    }).catch(() => setStorageError('로컬 보관함 정보를 읽지 못했습니다.'));
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);
  useEffect(() => { const t = setInterval(() => refreshFn.current(), state.preferences.interval * 60_000); return () => clearInterval(t); }, [state.preferences.interval]);

  const knownBoards = state.boards;
  const boardFor = (post: Post) => knownBoards.find(b => b.id === post.boardId);
  const unreadCount = posts.filter(p => !state.read.includes(p.id)).length;
  const savedCount = Object.keys(state.saved).length;
  const activeBoard = knownBoards.find(b => b.id === view);
  const title = view === 'all' ? '전체 글' : view === 'unread' ? '안 읽은 글' : view === 'saved' ? '로컬 보관함' : view === 'settings' ? '설정' : activeBoard?.name ?? '게시판';
  let visible = posts.filter(p => (view === 'saved' ? Boolean(state.saved[p.id]) : view === 'unread' ? !state.read.includes(p.id) || p.id === selected : view === 'all' ? true : p.boardId === view)
    && (boardFilter === 'all' || p.boardId === boardFilter)
    && `${p.title} ${p.excerpt} ${p.paragraphs.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  visible = [...visible].sort((a, b) => sort === 'oldest' ? a.publishedAt - b.publishedAt : b.publishedAt - a.publishedAt);
  if (scenario === 'empty') visible = [];
  const post = visible.find(p => p.id === selected) ?? null;
  const loading = refreshing || scenario === 'loading';
  const changeView = (next: View) => { setView(next); setQuery(''); setBoardFilter('all'); setSelected(null); setDetailMobile(false); setScenario('normal'); };
  const loadDetail = async (p: Post) => {
    if (!p.live || p.content || !p.url || !window.localclip) return p;
    setDetailLoading(true);
    try {
      const result = await window.localclip.getAagagDetail(p.url);
      if (!result.ok) throw new Error(result.error);
      const enriched = { ...p, content: result.content, paragraphs: result.content.filter(block => block.type === 'text').map(block => block.value), image: result.content.find(block => block.type === 'image')?.value };
      setPosts(current => current.map(item => item.id === p.id ? enriched : item));
      return enriched;
    } catch (error) {
      setStorageError(error instanceof Error && error.message ? error.message : 'AAGAG 본문 수집에 실패했습니다.');
      return p;
    } finally { setDetailLoading(false); }
  };
  const openPost = (p: Post) => { setSelected(p.id); setDetailMobile(true); setState(s => ({ ...s, read: [...new Set([...s.read, p.id])] })); void loadDetail(p); };
  const archivePost = (p: Post): ArchivePost => ({ id: p.id, source: boardFor(p)?.source ?? 'unsupported', title: p.title, author: p.author, category: p.category, sourceUrl: p.url ?? boardFor(p)?.url ?? '', publishedAt: p.publishedAt, paragraphs: p.paragraphs, image: p.image, content: p.content });
  const toggleSave = async (p: Post) => {
    if (state.saved[p.id]) { setDeletePost(p); return; }
    if (window.localclip) {
      setArchiveBusy(true);
      try {
        let root = archiveRoot;
        if (!root) { const info = await window.localclip.chooseArchiveFolder(); root = info.root; setArchiveRoot(root); }
        if (!root) { setToast('저장 위치 선택을 취소했습니다.'); return; }
        const target = await loadDetail(p);
        const result = await window.localclip.savePost(archivePost(target));
        if (!result.ok) { setToast('글을 저장하지 못했습니다.'); return; }
        setState(s => ({ ...s, saved: { ...s.saved, [p.id]: Date.now() }, preferences: { ...s.preferences, storageLabel: root! } }));
        setToast(result.partial ? '본문은 저장했지만 일부 미디어를 받지 못했습니다.' : result.imageSaved ? '본문과 미디어를 글별 폴더에 저장했습니다.' : '본문을 글별 폴더에 저장했습니다.');
        return;
      } catch { setStorageError('글 파일 저장에 실패했습니다. 저장 위치와 권한을 확인해 주세요.'); return; }
      finally { setArchiveBusy(false); }
    }
    setState(s => ({ ...s, saved: { ...s.saved, [p.id]: Date.now() } }));
    setToast('보관함에 담았어요. 데모 보관 상태만 이 기기에 저장됩니다.');
  };
  const chooseArchiveFolder = async () => {
    if (!window.localclip) { setToast('폴더 선택은 데스크톱 앱에서 사용할 수 있습니다.'); return; }
    try { const info = await window.localclip.chooseArchiveFolder(); setArchiveRoot(info.root); if (info.root) { setState(s => ({ ...s, preferences: { ...s.preferences, storageLabel: info.root! } })); setToast('저장 위치를 변경했습니다. 기존 파일은 이동하지 않습니다.'); } }
    catch { setStorageError('저장 위치를 변경하지 못했습니다.'); }
  };
  const refresh = async () => {
    if (refreshTimer.current || scenario === 'loading') return;
    setRefreshing(true);
    if (window.localclip) {
      refreshTimer.current = setTimeout(() => {}, 60_000);
      try {
        const result = await window.localclip.refreshAagag();
        if (!result.ok) throw new Error(result.error);
        setPosts(current => [...current.filter(item => item.boardId !== 'aagag'), ...result.posts]);
        setLastRefresh(result.fetchedAt);
        setToast(`AAGAG 최신 글 ${result.posts.length}개를 가져왔습니다.`);
      } catch (error) {
        setStorageError(error instanceof Error && error.message ? error.message : 'AAGAG 연결에 실패했습니다. 기존 목록을 유지합니다.');
      } finally { setRefreshing(false); if (refreshTimer.current) clearTimeout(refreshTimer.current); refreshTimer.current = null; }
      return;
    }
    refreshTimer.current = setTimeout(() => { setRefreshing(false); setLastRefresh(Date.now()); setToast('브라우저 미리보기에서는 샘플 목록을 표시합니다.'); refreshTimer.current = null; }, 700);
  };
  refreshFn.current = refresh;
  useEffect(() => { if (window.localclip) void refreshFn.current(); }, []);
  const openOriginal = async (p: Post) => {
    const url = p.url ?? boardFor(p)?.url;
    if (!url) return;
    if (window.localclip) { const opened = await window.localclip.openSource(url).catch(() => false); if (!opened) setToast('출처 창을 열지 못했습니다.'); }
    else window.open(url, '_blank', 'noopener,noreferrer');
  };
  const markVisible = () => { setState(s => ({ ...s, read: [...new Set([...s.read, ...visible.map(p => p.id)])] })); setToast('현재 목록의 글을 모두 읽음으로 표시했어요.'); };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || document.querySelector('dialog[open]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (/^[1-4]$/.test(key)) {
        const board = knownBoards[Number(key) - 1];
        if (board) { event.preventDefault(); changeView(board.id); }
        return;
      }
      if (key === 'q' || key === 'e') {
        event.preventDefault();
        const feeds: View[] = ['all', 'unread', 'saved', ...knownBoards.map(board => board.id)];
        const current = Math.max(0, feeds.indexOf(view));
        const offset = key === 'q' ? -1 : 1;
        changeView(feeds[(current + offset + feeds.length) % feeds.length]);
        return;
      }
      if ((key === 'a' || key === 'd') && view !== 'settings' && visible.length) {
        event.preventDefault();
        const current = visible.findIndex(item => item.id === selected);
        const next = key === 'a'
          ? (current <= 0 ? visible.length - 1 : current - 1)
          : (current < 0 || current >= visible.length - 1 ? 0 : current + 1);
        openPost(visible[next]);
        document.querySelector(`[data-post-id="${visible[next].id}"]`)?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (key === 'escape' && detailMobile) { event.preventDefault(); setDetailMobile(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, selected, visible, knownBoards, detailMobile]);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); changeView('all'); }} aria-label="LocalClip 홈">LocalClip</a>
      <nav aria-label="주 메뉴" className="main-nav">
        {[{ id: 'all', text: '전체 글', icon: LayoutGrid, count: posts.length }, { id: 'unread', text: '안 읽은 글', icon: Inbox, count: unreadCount }, { id: 'saved', text: '로컬 보관함', icon: Bookmark, count: savedCount }].map(n => <button key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} aria-label={`${n.text} ${n.count}`} aria-current={view === n.id ? 'page' : undefined} onClick={() => changeView(n.id)}><n.icon size={19} /><span>{n.text}</span><span className="nav-count">{n.count}</span></button>)}
      </nav>
      <div className="section-label"><span>게시판</span></div>
      <nav aria-label="등록한 게시판" className="board-nav">{knownBoards.map((b, index) => <button className={`nav-item board-nav-item ${view === b.id ? 'active' : ''}`} key={b.id} onClick={() => changeView(b.id)} aria-current={view === b.id ? 'page' : undefined}><SourceIcon board={b} /><span><strong>{b.name}</strong><small>{sourceName(b)}</small></span>{index < 4 ? <kbd>{index + 1}</kbd> : b.source === 'unsupported' ? <Clock3 size={13} /> : null}</button>)}</nav>
      <div className="sidebar-bottom">
        <button aria-label="설정" className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => changeView('settings')}><Settings2 size={18} /><span>설정</span></button>
        <button className="nav-item help-nav" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /><span>LocalClip 알아보기</span><ArrowUpRight size={14} /></button>
      </div>
    </aside>

    <main className="main">
      <div className="page-heading"><h1>{title}</h1><button className="primary-button" onClick={() => setAddOpen(true)}><Plus size={17} />게시판 추가</button></div>
      {storageError && <div className="error-banner" role="alert">{storageError}<button className="icon-btn" aria-label="저장 안내 닫기" onClick={() => setStorageError('')}><X size={16} /></button></div>}
      {view === 'settings' ? <Settings state={state} setState={setState} archiveRoot={archiveRoot} chooseArchiveFolder={chooseArchiveFolder} scenario={scenario} setScenario={next => { setScenario(next); if (next !== 'normal') { setView('all'); setQuery(''); setBoardFilter('all'); setSelected(next === 'partial' ? 'demo-1' : null); setDetailMobile(next === 'partial'); } }} /> : <>
        <div className="content-panel">
          <div className="panel-toolbar"><div className="view-tabs"><span className="active-tab">글 {visible.length}개</span></div><div className="toolbar-actions"><label className="search-box"><Search size={16} /><input aria-label="글 검색" placeholder="글 검색" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} />{query && <button className="icon-btn" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={14} /></button>}</label><button onClick={refresh} disabled={loading} className="toolbar-button" title={lastRefresh ? `${new Date(lastRefresh).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 확인` : '새로고침'}><RefreshCw size={15} className={refreshing ? 'spinning' : ''} />새로고침</button><button className="toolbar-button" title="모두 읽음으로 표시" aria-label="모두 읽음으로 표시" onClick={markVisible} disabled={!visible.length}><CheckCheck size={16} />모두 읽음</button></div></div>
          <div className={`reading-layout ${detailMobile ? 'show-detail' : ''}`}>
            <section className="post-list" aria-label="게시글 목록">
              <div className="list-controls"><label><span className="sr-only">게시판 필터</span><select value={boardFilter} onChange={e => { setBoardFilter(e.target.value); setSelected(null); }}><option value="all">모든 게시판</option>{knownBoards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="sort-control"><ArrowDownWideNarrow size={13} /><span className="sr-only">정렬</span><select aria-label="정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">최신순</option><option value="oldest">오래된순</option></select></label></div>
              {scenario === 'auth' && <div className="auth-banner"><LockKeyhole size={18} /><div><strong>인벤 인증이 만료되었어요</strong><p>상태 예시입니다. 재로그인은 연결 예정이에요.</p></div></div>}
              <div className="list-scroll" aria-busy={loading}>
                {loading ? <div className="loading-state" role="status"><LoaderCircle className="spinning" size={25} /><p>샘플 목록을 확인하고 있어요</p>{[1, 2, 3, 4].map(n => <div className="skeleton" key={n}><i /><i /><i /></div>)}</div> : visible.length === 0 ? <Empty icon={query ? Search : Inbox} title={query ? '검색 결과가 없어요' : activeBoard?.source === 'unsupported' ? '아직 지원 준비 중이에요' : '아직 모인 글이 없어요'} text={query ? '다른 검색어로 다시 찾아보세요.' : view === 'saved' ? '글의 저장 버튼을 눌러 보관함을 채워보세요.' : '추가한 게시판의 실제 수집은 다음 단계에 연결됩니다.'} /> : visible.map(p => <div key={p.id} data-post-id={p.id} className={`post-card ${selected === p.id ? 'selected' : ''} ${state.read.includes(p.id) ? 'is-read' : ''}`}>
                  <button className="post-main" onClick={() => openPost(p)} aria-label={`${p.title} 읽기`} aria-pressed={selected === p.id}><span className="post-meta"><SourceIcon board={boardFor(p)} /><span>{sourceName(boardFor(p))}</span><span className="meta-dot">·</span><time>{timeAgo(p.publishedAt)}</time>{!state.read.includes(p.id) && <span className="unread-dot" aria-label="안 읽음" />}</span><span className="post-title">{p.title}</span><span className="post-excerpt">{p.excerpt}</span><span className="post-footer"><span>{p.category}</span><span>{p.author}</span></span></button>
                  <button disabled={archiveBusy} className={`card-bookmark icon-btn ${state.saved[p.id] ? 'is-saved' : ''}`} aria-label={`${p.title} ${state.saved[p.id] ? '저장 취소' : '저장'}`} aria-pressed={Boolean(state.saved[p.id])} onClick={() => toggleSave(p)}><Bookmark size={16} fill={state.saved[p.id] ? 'currentColor' : 'none'} /></button>
                </div>)}
              </div><div className="list-bottom"><Check size={13} />{posts.some(item => item.live) ? 'AAGAG 실제 목록 포함' : '샘플 목록'} · {visible.length}개</div>
            </section>
            <section className="reader" aria-label="글 상세">
              {!post || loading ? <Empty icon={BookOpen} title="마음에 드는 이야기를 골라보세요" text="왼쪽 목록에서 글을 선택하면 여기에서 읽을 수 있어요." /> : <>
                <div className="reader-actions"><button className="icon-btn back-button" aria-label="목록으로 돌아가기" onClick={() => setDetailMobile(false)}><ArrowLeft size={18} /></button><span className="reader-source"><SourceIcon board={boardFor(post)} />{sourceName(boardFor(post))}<ChevronRight size={12} /><span>{boardFor(post)?.name}</span></span><div className="reader-button-group"><button className="text-button" onClick={() => openOriginal(post)}>원문 열기<ExternalLink size={13} /></button><button disabled={archiveBusy} className={`save-button ${state.saved[post.id] ? 'saved' : ''}`} onClick={() => toggleSave(post)}><Bookmark size={15} fill={state.saved[post.id] ? 'currentColor' : 'none'} />{archiveBusy ? '처리 중' : state.saved[post.id] ? '저장됨' : '저장'}</button></div></div>
                <article className="article-scroll" key={post.id}><div className="article-category">{post.category}<span>{post.live ? 'LIVE LIST' : 'DEMO STORY'}</span></div><h2>{post.title}</h2><div className="article-meta"><span className="author-avatar">{post.author.slice(0, 1)}</span><strong>{post.author}</strong><span>·</span><time>{new Date(post.publishedAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</time>{!post.live && <><span>·</span><span>3분 읽기</span></>}</div>
                  {scenario === 'partial' && <div className="partial-banner"><WifiOff size={18} /><div><strong>일부 이미지를 저장하지 못했어요</strong><p>부분 저장 상태 예시입니다. 실제 다운로드는 연결 예정입니다.</p></div><button className="text-button" onClick={() => { setScenario('normal'); setToast('부분 저장 예시를 종료했어요. 실제 다운로드는 수행하지 않았습니다.'); }}>예시 종료</button></div>}
                  {post.live ? detailLoading && !post.content ? <div className="loading-state" role="status"><LoaderCircle className="spinning" size={25} /><p>실제 본문을 가져오고 있어요</p></div> : post.content ? post.content.map((block, i) => block.type === 'text' ? <p key={i}>{block.value}</p> : block.type === 'image' ? <figure key={i}><img src={block.value} alt="" loading="lazy" /></figure> : <video key={i} src={block.value} controls preload="metadata" />) : <><p className="article-lead">{post.excerpt}</p>{post.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</> : <><p className="article-lead">{post.excerpt}</p>{post.image && <figure><img src={post.image} alt={post.id === 'demo-1' ? '잔잔한 호수와 산책길을 그린 샘플 일러스트' : `${post.category} 샘플 일러스트`} /><figcaption>LocalClip을 위해 만든 샘플 일러스트</figcaption></figure>}{post.paragraphs.map((p, i) => /^0\d/.test(p) ? <h3 key={i}>{p}</h3> : <p key={i}>{p}</p>)}</>}
                  <div className="sample-disclaimer">{post.live ? post.content ? 'AAGAG에서 가져온 실제 공개 본문입니다.' : '실제 공개 목록 · 본문을 불러오지 못했습니다.' : '샘플 글 · 실제 본문과 이미지는 아직 수집하지 않습니다.'}</div>
                </article>
              </>}
            </section>
          </div>
        </div>
      </>}
      <footer className="app-footer"><span className="shortcut-strip"><kbd>Q</kbd><kbd>E</kbd> 피드 <span className="shortcut-separator" /><kbd>A</kbd><kbd>D</kbd> 글 <span className="shortcut-separator" /><kbd>1</kbd>–<kbd>4</kbd> 게시판</span></footer>
    </main>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    {addOpen && <AddBoard existing={knownBoards} close={() => setAddOpen(false)} add={b => { const newBoard = { ...b, id: crypto.randomUUID() }; setState(s => ({ ...s, boards: [...s.boards, newBoard] })); setAddOpen(false); changeView(newBoard.id); setToast(b.source === 'unsupported' ? '게시판을 등록했어요. 이 사이트는 지원 준비 중입니다.' : '게시판을 등록했어요. 실제 글 수집은 연결 예정입니다.'); }} />}
    {helpOpen && <Modal title="도움말" close={() => setHelpOpen(false)}><div className="help-content"><div className="shortcut-help"><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd></span><p>첫 번째부터 네 번째 게시판</p><span><kbd>Q</kbd><kbd>E</kbd></span><p>이전 · 다음 피드</p><span><kbd>A</kbd><kbd>D</kbd></span><p>이전 · 다음 글</p></div><div className="info-box"><strong>현재 UI 데모</strong><p>로그인·글 수집·본문 및 이미지 다운로드·저장 폴더 선택은 아직 연결되지 않았습니다.</p></div><button className="primary-button full-width" onClick={() => setHelpOpen(false)}>닫기</button></div></Modal>}
    {deletePost && <Modal title="보관함에서 삭제할까요?" close={() => setDeletePost(null)}><p className="modal-description">‘{deletePost.title}’의 {window.localclip ? '로컬 글 폴더와 파일을' : '데모 보관 상태를'} 삭제합니다. 글 목록에는 그대로 남습니다.</p><div className="modal-footer"><button className="secondary-button" onClick={() => setDeletePost(null)}>취소</button><button className="danger-button" onClick={async () => { const target = deletePost; setArchiveBusy(true); try { if (window.localclip) await window.localclip.deletePost(archivePost(target)); setState(s => { const saved = { ...s.saved }; delete saved[target.id]; return { ...s, saved }; }); setDeletePost(null); setToast(window.localclip ? '로컬 글 폴더를 삭제했습니다.' : '보관함에서 삭제했어요.'); } catch { setStorageError('로컬 글 폴더를 삭제하지 못했습니다.'); } finally { setArchiveBusy(false); } }}>보관함에서 삭제</button></div></Modal>}
  </div>;
}

function Empty({ icon: Icon, title, text }: { icon: typeof Inbox; title: string; text: string }) {
  return <div className="empty-state"><span><Icon size={28} strokeWidth={1.5} /></span><h3>{title}</h3><p>{text}</p></div>;
}
function AddBoard({ close, existing, add }: { close(): void; existing: Board[]; add(b: Omit<Board, 'id'>): void }) {
  const [name, setName] = useState(''); const [url, setURL] = useState(''); const [error, setError] = useState(''); const [preview, setPreview] = useState<Omit<Board, 'id'> | null>(null);
  const submit = (e: FormEvent) => { e.preventDefault(); try { const b = parseBoard(name, url); if (existing.some(v => v.url === b.url)) throw new Error('이미 등록한 게시판입니다. 왼쪽 메뉴에서 확인해 주세요.'); if (!preview) { setPreview(b); setError(''); } else add(b); } catch (err) { setError((err as Error).message); } };
  return <Modal title="새 게시판 추가" close={close}><form onSubmit={submit}><p className="modal-description">등록할 게시판 정보를 입력하세요.</p><label className="form-field">게시판 이름<input autoFocus maxLength={60} placeholder="예: 디아블로2 자유 게시판" value={name} onChange={e => { setName(e.target.value); setPreview(null); }} required /></label><label className="form-field">게시판 주소<input type="url" placeholder="https://" value={url} onChange={e => { setURL(e.target.value); setPreview(null); }} required /></label><div className="example-links"><span>예시 입력</span><button type="button" onClick={() => { setName('디아2 자유 게시판'); setURL('https://www.inven.co.kr/board/diablo2/5735'); setPreview(null); }}>인벤</button><button type="button" onClick={() => { setName('AAGAG 최신 이슈'); setURL('https://aagag.com/'); setPreview(null); }}>AAGAG</button></div>{error && <p className="form-error" role="alert">{error}</p>}{preview && <div className="board-preview"><SourceIcon board={{ ...preview, id: 'preview' }} /><div><strong>{preview.name}</strong><p>{preview.source === 'unsupported' ? '이 사이트는 지원 준비 중입니다.' : `${sourceName({ ...preview, id: '' })} 주소를 확인했어요. 실제 목록 수집은 연결 예정입니다.`}</p></div></div>}<div className="info-box compact"><ShieldCheck size={17} /><span>지금은 주소와 이름만 로컬에 저장합니다.<br />로그인 정보는 입력하지 마세요.</span></div><div className="modal-footer"><button type="button" className="secondary-button" onClick={close}>취소</button><button className="primary-button" type="submit">{preview ? '게시판 추가' : '미리보기'}<ChevronRight size={15} /></button></div></form></Modal>;
}
function Settings({ state, setState, archiveRoot, chooseArchiveFolder, scenario, setScenario }: { state: DemoState; setState: React.Dispatch<React.SetStateAction<DemoState>>; archiveRoot: string | null; chooseArchiveFolder(): void; scenario: Scenario; setScenario(scenario: Scenario): void }) {
  return <section className="settings-panel" aria-label="앱 설정"><div className="settings-intro"><div><h2>설정</h2><p>변경 내용은 이 기기에 저장됩니다.</p></div></div><div className="setting-row"><div><h3>목록 갱신 간격</h3><p>실제 수집은 연결 예정입니다.</p></div><select aria-label="갱신 간격" value={state.preferences.interval} onChange={e => setState(s => ({ ...s, preferences: { ...s.preferences, interval: Number(e.target.value) } }))}>{[1, 5, 10, 30].map(n => <option key={n} value={n}>{n}분마다</option>)}</select></div><div className="setting-row"><div><h3>로컬 저장 위치</h3><p>{archiveRoot ?? '아직 선택하지 않음'}</p><p>선택한 폴더 안에 LocalClip/사이트/글ID 구조로 저장합니다.</p></div><button className="secondary-button" onClick={chooseArchiveFolder}><Folder size={15} />폴더 선택</button></div><div className="setting-row"><div><h3>사이트 연결</h3><p>로그인과 세션 보관은 다음 단계에 연결됩니다.</p></div></div><div className="connection-list">{['인벤', 'AAGAG'].map((name, i) => <div key={name}><SourceIcon board={{ id: '', name, url: '', source: i ? 'aagag' : 'inven' }} /><strong>{name}</strong><span>미연결</span><button className="secondary-button" disabled><LockKeyhole size={14} />연결 예정</button></div>)}</div><div className="setting-row"><div><h3>화면 상태 확인</h3><p>개발 중 빈 목록과 오류 화면을 확인합니다.</p></div><select aria-label="화면 상태 미리보기" value={scenario} onChange={e => setScenario(e.target.value as Scenario)}><option value="normal">기본 화면</option><option value="empty">빈 목록</option><option value="loading">로딩</option><option value="auth">인증 만료</option><option value="partial">부분 저장</option></select></div><div className="settings-note"><p>계정과 비밀번호는 저장하지 않습니다. 보관한 글은 선택한 로컬 폴더에 저장됩니다.</p></div></section>;
}
