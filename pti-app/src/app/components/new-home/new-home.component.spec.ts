import { Router } from '@angular/router';
import { NewHomeComponent } from './new-home.component';

describe('NewHomeComponent public launcher', () => {
  const createHome = () => new NewHomeComponent(
    { navigateByUrl: () => Promise.resolve(true) } as unknown as Router,
    'server'
  );

  it('does not reveal private tools in the directory, pins or recent suggestions', () => {
    const home = createHome();
    const privateId = 'velum';
    expect(home.apps.some(app => app.id === privateId)).toBeFalse();
    expect(home.filteredApps.some(app => app.id === privateId)).toBeFalse();
    expect(home.pinnedApps.some(app => app.id === privateId)).toBeFalse();
    expect(home.suggestions.some(app => app.id === privateId)).toBeFalse();
  });

  it('keeps only categories with launchable apps', () => {
    const home = createHome();
    for (const category of home.categories) {
      if (category === 'All') continue;
      expect(home.apps.some(app => app.category === category)).toBeTrue();
    }
  });

  it('keeps One Piece available under Entertainment', () => {
    const home = createHome();
    home.setCategory('Entertainment');
    expect(home.filteredApps.map(app => app.id)).toContain('one-piece');
  });
});
