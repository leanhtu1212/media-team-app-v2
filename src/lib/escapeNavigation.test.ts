import { describe, expect, it } from 'vitest';
import { escapeNavigationAction } from './escapeNavigation';

describe('escapeNavigationAction', () => {
  it('lets the top overlay handle Escape first', () => {
    expect(escapeNavigationAction({ hasOverlay: true, selectedProjectId: 'p', selectedContentId: null, history: ['dashboard'] })).toEqual({ type: 'none' });
  });

  it('closes project detail before navigating main-view history', () => {
    expect(escapeNavigationAction({ hasOverlay: false, selectedProjectId: 'p', selectedContentId: null, history: ['dashboard'] })).toEqual({ type: 'close-project' });
  });

  it('closes content detail before navigating main-view history', () => {
    expect(escapeNavigationAction({ hasOverlay: false, selectedProjectId: null, selectedContentId: 'c', history: ['dashboard'] })).toEqual({ type: 'close-content' });
  });

  it('returns to the most recent main view', () => {
    expect(escapeNavigationAction({ hasOverlay: false, selectedProjectId: null, selectedContentId: null, history: ['dashboard', 'projects', 'daily'] })).toEqual({ type: 'view', view: 'daily' });
  });

  it('does nothing when there is no previous view', () => {
    expect(escapeNavigationAction({ hasOverlay: false, selectedProjectId: null, selectedContentId: null, history: [] })).toEqual({ type: 'none' });
  });
});
