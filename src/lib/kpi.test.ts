import { describe, expect, it } from 'vitest';
import { projectOutputShares } from './kpi';
import type { Project, Task } from '../types';

const project = {
  id: 'p', title: 'P', status: 'plan', projectType: 'inhouse', assigneeIds: ['a', 'b'],
  photoAssigneeQty: { a: 7, b: 3 }, videoAssigneeQty: { a: 1, b: 3 },
} as Project;
const tasks = [
  { id: '1', projectId: 'p', title: '', category: 'photo', status: 'completed', quantity: 9, createdBy: 'a' },
  { id: '2', projectId: 'p', title: '', category: 'photo', status: 'completed', quantity: 1, createdBy: 'b' },
] as Task[];

describe('projectOutputShares', () => {
  it('ưu tiên định mức dự án Inhouse thay vì người tạo task', () => {
    expect([...projectOutputShares(project, 'photo', tasks)]).toEqual([['a', 0.7], ['b', 0.3]]);
    expect([...projectOutputShares(project, 'video', tasks)]).toEqual([['a', 0.25], ['b', 0.75]]);
  });

  it('dự án cũ rơi về tỉ lệ sản lượng task thực tế', () => {
    expect([...projectOutputShares({ ...project, photoAssigneeQty: undefined }, 'photo', tasks)])
      .toEqual([['a', 0.9], ['b', 0.1]]);
  });
});
