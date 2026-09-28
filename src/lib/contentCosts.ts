import type { ContentCost, DailyContent } from '../types';

export function contentCostsInMonth(costs: ContentCost[], contents: DailyContent[], month: string): ContentCost[] {
  const valid = new Set(contents.map((c) => c.id));
  return costs.filter((c) => valid.has(c.contentId) && (c.expenseDate || '').startsWith(month));
}

export interface ContentCostGroup {
  contentId: string;
  contentTitle: string;
  costs: ContentCost[];
  total: number;
  approved: number;
}

export function groupContentCosts(costs: ContentCost[], contents: DailyContent[], month: string): ContentCostGroup[] {
  const byId = new Map(contents.map((c) => [c.id, c]));
  const groups = new Map<string, ContentCost[]>();
  for (const cost of contentCostsInMonth(costs, contents, month)) {
    const list = groups.get(cost.contentId) || [];
    list.push(cost);
    groups.set(cost.contentId, list);
  }
  return Array.from(groups, ([contentId, list]) => ({
    contentId,
    contentTitle: byId.get(contentId)?.title || 'Không rõ nội dung',
    costs: [...list].sort((a, b) => (a.expenseDate || '').localeCompare(b.expenseDate || '')),
    total: list.reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    approved: list.filter((c) => c.dntt).length,
  })).sort((a, b) => b.total - a.total);
}
