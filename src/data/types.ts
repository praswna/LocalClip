export type Source = 'inven' | 'aagag' | 'unsupported';
export interface Board { id: string; name: string; url: string; source: Source }
export interface Post {
  id: string; boardId: string; title: string; excerpt: string; author: string;
  publishedAt: number; category: string; paragraphs: string[]; image?: string;
}
export interface Preferences { interval: number; storageLabel: string }
export interface DemoState {
  version: 1; boards: Board[]; read: string[]; saved: Record<string, number>; preferences: Preferences;
}
export interface ClipRepository {
  load(): DemoState;
  save(state: DemoState): void;
  posts(): Post[];
}
declare global { interface Window { localclip?: { openSource(url: string): Promise<boolean> } } }
