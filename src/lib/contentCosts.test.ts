import { describe, expect, it } from 'vitest';
import { contentCostsInMonth, groupContentCosts } from './contentCosts';
import type { ContentCost, DailyContent } from '../types';

const costs: ContentCost[] = [
  { id: 'a', contentId: 'c1', title: 'Đạo cụ', amount: 300000, expenseDate: '2026-09-02', dntt: true },
  { id: 'b', contentId: 'c1', title: 'Mẫu', amount: 200000, expenseDate: '2026-09-03', dntt: false },
  { id: 'c', contentId: 'c2', title: 'Thuê máy', amount: 900000, expenseDate: '2026-08-31', dntt: true },
  { id: 'orphan', contentId: 'missing', title: 'Mồ côi', amount: 999, expenseDate: '2026-09-04', dntt: false },
];
const contents = [
  { id: 'c1', title: 'Reels A' },
  { id: 'c2', title: 'Reels B' },
] as DailyContent[];

describe('content costs', () => {
  it('filters the selected month and removes orphan costs', () => {
    expect(contentCostsInMonth(costs, contents, '2026-09').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('groups costs by content and sorts highest total first', () => {
    const grouped = groupContentCosts(costs, contents, '2026-09');
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ contentId: 'c1', contentTitle: 'Reels A', total: 500000, approved: 1 });
  });
});
