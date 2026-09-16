import { describe, expect, it } from 'vitest';
import { DemoRepository, parseBoard, validateState } from './repository';
import { freshState } from './seed';
describe('board registration and persisted state', () => {
  it('normalizes tracking links and recognizes only exact source hosts', () => {
    expect(parseBoard('  거래  ', 'https://inven.co.kr/board/diablo2/6308/?tracking=1#top')).toEqual({ name: '거래', source: 'inven', url: 'https://www.inven.co.kr/board/diablo2/6308' });
    expect(parseBoard('다른 사이트', 'https://inven.co.kr.evil.example/board/x/1').source).toBe('unsupported');
    expect(parseBoard('홈', 'https://www.inven.co.kr/').source).toBe('unsupported');
  });
  it('rejects unsafe URLs, credentials and empty names', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://aagag.com/', 'https://user:pass@aagag.com/']) expect(() => parseBoard('test', url)).toThrow();
    expect(() => parseBoard(' ', 'https://aagag.com/')).toThrow();
  });
  it('round-trips saved/read state and settings through a fresh repository instance', () => {
    const data = new Map<string, string>(); const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const first = new DemoRepository(storage); const state = first.load();
    state.saved['demo-1'] = 123; state.read.push('demo-1'); state.preferences.interval = 10;
    first.save(state); expect(new DemoRepository(storage).load()).toEqual(state);
  });
  it('detects corrupt data and storage failures rather than claiming persistence', () => {
    expect(validateState({ ...freshState(), read: [42] })).toBe(false);
    expect(validateState({ ...freshState(), boards: [...freshState().boards, freshState().boards[0]] })).toBe(false);
    expect(() => new DemoRepository({ getItem: () => '{', setItem: () => {} }).load()).toThrow();
    expect(() => new DemoRepository({ getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } }).save(freshState())).toThrow('Quota exceeded');
  });
});
