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
export interface ArchiveInfo { root: string | null; savedIds: string[] }
export interface ArchivePost { id: string; source: Source; title: string; author: string; category: string; sourceUrl: string; publishedAt: number; paragraphs: string[]; image?: string }
declare global { interface Window { localclip?: {
  openSource(url: string): Promise<boolean>;
  getArchiveInfo(): Promise<ArchiveInfo>;
  chooseArchiveFolder(): Promise<ArchiveInfo>;
  savePost(post: ArchivePost): Promise<{ ok: boolean; needsFolder?: boolean; folder?: string; imageSaved?: boolean }>;
  deletePost(post: ArchivePost): Promise<{ ok: boolean }>;
} } }
