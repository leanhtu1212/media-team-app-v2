import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake only the Firestore boundary: exercise real actions and inspect persisted data.
const store = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), failCommit: false, commits: 0, failAtCommit: 0 }));
vi.mock('./firebase', () => ({ db: {} }));
vi.mock('./notify', () => ({ notify: vi.fn(), displayName: () => 'Editor', diffLines: () => [] }));
vi.mock('firebase/firestore', () => {
  type Ref = { path: string };
  const snapshot = (ref: Ref) => ({ ref, id: ref.path.split('/').at(-1), exists: () => store.docs.has(ref.path), data: () => store.docs.get(ref.path) });
  const update = (ref: Ref, data: Record<string, unknown>) => {
    if (!store.docs.has(ref.path)) throw new Error('not-found');
    store.docs.set(ref.path, { ...store.docs.get(ref.path), ...data });
  };
  const batch = () => {
    const operations: (() => void)[] = [];
    return {
      update: (ref: Ref, data: Record<string, unknown>) => operations.push(() => update(ref, data)),
      delete: (ref: Ref) => operations.push(() => store.docs.delete(ref.path)),
      commit: async () => {
        store.commits++;
        if (store.failCommit || store.commits === store.failAtCommit) throw new Error('permission-denied');
        if (operations.length > 500) throw new Error('too-many-writes');
        operations.forEach((op) => op());
      },
    };
  };
  return {
    doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
    collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (ref: Ref, ...filters: { field: string; value: unknown }[]) => ({ ...ref, filters }),
    getDoc: async (ref: Ref) => snapshot(ref),
    getDocs: async (ref: Ref & { filters?: { field: string; value: unknown }[] }) => ({
      docs: [...store.docs].filter(([path, data]) => path.startsWith(`${ref.path}/`) &&
        path.split('/').length === ref.path.split('/').length + 1 &&
        (ref.filters || []).every((f) => data[f.field] === f.value)).map(([path]) => snapshot({ path })),
    }),
    updateDoc: async (ref: Ref, data: Record<string, unknown>) => update(ref, data),
    deleteDoc: async (ref: Ref) => { store.docs.delete(ref.path); },
    serverTimestamp: () => 'server-time',
    writeBatch: batch,
    runTransaction: async (_db: unknown, callback: (tx: unknown) => Promise<void>) => {
      const writes = batch();
      await callback({ ...writes, get: async (ref: Ref) => snapshot(ref) });
      await writes.commit();
    },
  };
});

import { deleteProject, updateTask } from './actions';
import { contentVideoEntries } from './kpi';
import type { DailyContent, Report } from '../types';

const root = 'teams/MEDIA_TEAM_01';
const taskPath = `${root}/projects/p/tasks/t`;
const reportPath = `${root}/reports/r`;
beforeEach(() => {
  store.docs.clear();
  store.failCommit = false;
  store.commits = 0;
  store.failAtCommit = 0;
  store.docs.set(`${root}/projects/p`, { id: 'p', title: 'Project', status: 'post-production' });
  store.docs.set(taskPath, { id: 't', projectId: 'p', title: 'Project', category: 'video', status: 'completed', quantity: 1, reportDate: '2026-08-01', link: 'old', sourceReportId: 'r' });
  store.docs.set(reportPath, { id: 'r', projectId: 'p', reportType: 'auto', relatedTaskId: 't', quantity: 1, reportDate: '2026-08-01', link: 'old', createdBy: 'original', userEmail: 'original@example.com' });
});

describe('updateTask report consistency', () => {
  it('updates quantity/date/link and report description without reassigning credit', async () => {
    await updateTask('p', 't', { quantity: 3, reportDate: '2026-09-21', link: 'new' });
    expect(store.docs.get(reportPath)).toMatchObject({ quantity: 3, reportDate: '2026-09-21', link: 'new', content: 'Hoàn thành 3 video - Project', createdBy: 'original', userEmail: 'original@example.com' });
    expect(store.docs.get(taskPath)).toMatchObject({ quantity: 3, reportDate: '2026-09-21', link: 'new' });
  });
  it('keeps both documents unchanged if the atomic write fails', async () => {
    store.failCommit = true;
    await expect(updateTask('p', 't', { quantity: 3 })).rejects.toThrow('permission-denied');
    expect(store.docs.get(taskPath)?.quantity).toBe(1);
    expect(store.docs.get(reportPath)?.quantity).toBe(1);
  });
  it('allows unlinking a report without rewriting it', async () => {
    await updateTask('p', 't', { sourceReportId: '' });
    expect(store.docs.get(taskPath)?.sourceReportId).toBe('');
    expect(store.docs.get(reportPath)?.quantity).toBe(1);
  });
  it('still edits legacy tasks without a linked report', async () => {
    store.docs.get(taskPath)!.sourceReportId = '';
    await updateTask('p', 't', { quantity: 2, link: undefined });
    expect(store.docs.get(taskPath)).toMatchObject({ quantity: 2, link: 'old' });
  });
  it('does not recreate a report that was deleted previously', async () => {
    store.docs.delete(reportPath);
    await updateTask('p', 't', { quantity: 2 });
    expect(store.docs.get(taskPath)?.quantity).toBe(2);
    expect(store.docs.has(reportPath)).toBe(false);
  });
});

describe('deleteProject preserves content output', () => {
  it('detaches content and its report while deleting project tasks and project-only reports', async () => {
    const contentPath = `${root}/dailyContent/c`;
    const videoPath = `${root}/reports/video`;
    store.docs.set(contentPath, { id: 'c', title: 'Content', projectId: 'p', contentFormat: 'thumb-sub', items: [{ id: 'v', done: true, reportId: 'video' }] });
    store.docs.set(videoPath, { id: 'video', relatedContentId: 'c', projectId: 'p', reportType: 'auto', outputType: 'video', reportDate: '2026-09-21', quantity: 1, createdBy: 'editor' });
    await deleteProject('p');
    expect(store.docs.has(`${root}/projects/p`)).toBe(false);
    expect(store.docs.has(taskPath)).toBe(false);
    expect(store.docs.has(reportPath)).toBe(false);
    expect(store.docs.get(contentPath)).toMatchObject({ projectId: '', items: [{ id: 'v', done: true, reportId: 'video' }] });
    expect(store.docs.get(videoPath)).toMatchObject({ projectId: '', relatedContentId: 'c', createdBy: 'editor' });
    const videos = contentVideoEntries([store.docs.get(videoPath) as unknown as Report], [store.docs.get(contentPath) as unknown as DailyContent], '2026-09');
    expect(videos.map((v) => v.qty)).toEqual([0.5]);
  });
  it('keeps a small project intact when deletion is denied', async () => {
    store.failCommit = true;
    await expect(deleteProject('p')).rejects.toThrow('permission-denied');
    expect(store.docs.has(`${root}/projects/p`)).toBe(true);
    expect(store.docs.has(taskPath)).toBe(true);
    expect(store.docs.has(reportPath)).toBe(true);
  });
  it('can retry deletion of a large project after a later batch fails', async () => {
    for (let i = 0; i < 501; i++) store.docs.set(`${root}/projects/p/tasks/extra-${i}`, { projectId: 'p' });
    store.failAtCommit = 2;
    await expect(deleteProject('p')).rejects.toThrow('permission-denied');
    expect(store.docs.has(`${root}/projects/p`)).toBe(true);
    expect([...store.docs.keys()].some((path) => path.startsWith(`${root}/projects/p/tasks/`))).toBe(true);
    store.failAtCommit = 0;
    await deleteProject('p');
    expect(store.docs.has(`${root}/projects/p`)).toBe(false);
    expect([...store.docs.keys()].some((path) => path.startsWith(`${root}/projects/p/tasks/`))).toBe(false);
  });
});
