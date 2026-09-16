import { demoPosts, freshState } from './seed';
import type { Board, ClipRepository, DemoState, Source } from './types';
export const STORAGE_KEY = 'localclip.demo.v1';
export function parseBoard(name: string, address: string): Omit<Board, 'id'> {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 60) throw new Error('게시판 이름을 1~60자로 입력해 주세요.');
  let url: URL;
  try { url = new URL(address.trim()); } catch { throw new Error('https://로 시작하는 올바른 주소를 입력해 주세요.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('로그인 정보가 없는 HTTPS 주소를 입력해 주세요.');
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  const host = url.hostname;
  let source: Source = 'unsupported';
  if ((host === 'www.inven.co.kr' || host === 'inven.co.kr') && /^\/board\/[^/]+\/\d+$/.test(url.pathname)) { source = 'inven'; url.hostname = 'www.inven.co.kr'; }
  if (host === 'aagag.com' || host === 'www.aagag.com') { source = 'aagag'; url.hostname = 'aagag.com'; }
  return { name: cleanName, url: url.href, source };
}
export function validateState(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false;
  const s = value as DemoState;
  if (s.version !== 1 || !Array.isArray(s.boards) || !Array.isArray(s.read) || !s.saved || typeof s.saved !== 'object' || Array.isArray(s.saved) || !s.preferences) return false;
  if (!s.read.every(x => typeof x === 'string') || !Object.values(s.saved).every(x => typeof x === 'number' && Number.isFinite(x))) return false;
  if (![1, 5, 10, 30].includes(s.preferences.interval) || typeof s.preferences.storageLabel !== 'string') return false;
  try {
    const validBoards = s.boards.every(b => typeof b.id === 'string' && b.id.length > 0 && parseBoard(b.name, b.url).source === b.source);
    return validBoards && new Set(s.boards.map(b => b.id)).size === s.boards.length && new Set(s.boards.map(b => b.url)).size === s.boards.length;
  } catch { return false; }
}
export class DemoRepository implements ClipRepository {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  load(): DemoState {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed: unknown = JSON.parse(raw);
    if (!validateState(parsed)) throw new Error('저장된 데모 데이터 형식이 올바르지 않습니다.');
    return parsed;
  }
  save(state: DemoState) { this.storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  posts() { return demoPosts; }
}
