import { describe, expect, it } from 'vitest';
import type { Project, Task } from '../types';
import { automaticProjectStatus } from './projectStatus';

const project: Project = { id: 'p', title: 'Project', status: 'post-production', photoTarget: 10, videoTarget: 1 };
const output = (category: Task['category'], quantity: number, extra: Partial<Task> = {}): Task =>
  ({ id: category, projectId: 'p', title: category, category, quantity, status: 'completed', ...extra });

describe('automaticProjectStatus', () => {
  it('does not substitute surplus photos for missing video', () => {
    expect(automaticProjectStatus(project, [output('photo', 11)])).toBeNull();
  });
  it('does not substitute surplus videos for missing photos', () => {
    expect(automaticProjectStatus(project, [output('video', 11)])).toBeNull();
  });
  it('finishes only when both targets and all payments are satisfied', () => {
    const tasks = [output('photo', 10), output('video', 1)];
    expect(automaticProjectStatus(project, tasks)).toBe('done');
    expect(automaticProjectStatus(project, [...tasks, output('pre-production', 1, { dntt: false })])).toBe('payment');
    expect(automaticProjectStatus(project, [...tasks, output('pre-production', 1, { dntt: true })])).toBe('done');
  });
  it('supports photo-only targets and ignores unfinished/other-project tasks', () => {
    expect(automaticProjectStatus({ ...project, videoTarget: 0 }, [output('photo', 10)])).toBe('done');
    expect(automaticProjectStatus(project, [output('photo', 10), output('video', 1, { status: 'pending' })])).toBeNull();
    expect(automaticProjectStatus(project, [output('photo', 10), output('video', 1, { projectId: 'other' })])).toBeNull();
  });
  it('keeps first-delivery transition, no-target behavior and terminal Done', () => {
    expect(automaticProjectStatus({ ...project, status: 'plan' }, [output('photo', 1)])).toBe('post-production');
    expect(automaticProjectStatus({ ...project, photoTarget: 0, videoTarget: 0 }, [output('photo', 10)])).toBeNull();
    expect(automaticProjectStatus({ ...project, status: 'done' }, [])).toBeNull();
  });
});
