import { safeLoginReturn } from './login-return';

describe('retired PTI destinations', () => {
  it('returns legacy dashboard and CEO bookmarks to Home, including query/hash variants', () => {
    for (const path of ['/dashboard', '/new-dashboard?today=1', '/codex-command#notes', '/codex-command/projects/pti?tab=actions']) {
      expect(safeLoginReturn(path)).toEqual({ path: '/home', fullPage: false });
    }
  });
  it('retains standalone domains/activities and sibling One Piece intent', () => {
    expect(safeLoginReturn('/domains/domain-1').path).toBe('/domains/domain-1');
    expect(safeLoginReturn('/activities').path).toBe('/activities');
    expect(safeLoginReturn('/one-piece/watch/17').fullPage).toBeTrue();
  });
});
