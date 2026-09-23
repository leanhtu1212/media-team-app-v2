import type { View } from '../components/layout/Sidebar';

export type EscapeNavigationAction =
  | { type: 'none' }
  | { type: 'close-project' }
  | { type: 'close-content' }
  | { type: 'view'; view: View };

export function escapeNavigationAction(input: {
  hasOverlay: boolean;
  selectedProjectId: string | null;
  selectedContentId: string | null;
  history: View[];
}): EscapeNavigationAction {
  if (input.hasOverlay) return { type: 'none' };
  if (input.selectedProjectId) return { type: 'close-project' };
  if (input.selectedContentId) return { type: 'close-content' };
  const previous = input.history.at(-1);
  return previous ? { type: 'view', view: previous } : { type: 'none' };
}
