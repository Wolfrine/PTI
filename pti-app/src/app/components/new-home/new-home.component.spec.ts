import { Router } from '@angular/router';
import { NewHomeComponent } from './new-home.component';

describe('NewHomeComponent public launcher', () => {
  const createHome = () => new NewHomeComponent(
    { navigateByUrl: () => Promise.resolve(true) } as unknown as Router,
    'server' as unknown as object
  );

  it('does not reveal private tools in the directory, pins or recent suggestions', () => {
    const home = createHome();
    const privateId = 'velum';
    expect(home.apps.some(app => app.id === privateId)).toBeFalse();
    expect(home.filteredApps.some(app => app.id === privateId)).toBeFalse();
    expect(home.pinnedApps.some(app => app.id === privateId)).toBeFalse();
    expect(home.suggestions.some(app => app.id === privateId)).toBeFalse();
  });

  it('keeps only categories with catalog entries', () => {
    const home = createHome();
    for (const category of home.categories) {
      if (category === 'All') continue;
      expect(home.apps.some(app => app.category === category)).toBeTrue();
    }
  });

  it('launches deployed Noveliaa from Creative and supports pins and recent apps', () => {
    const home = createHome();
    const noveliaa = home.apps.find(app => app.id === 'noveliaa');
    expect(noveliaa?.status).toBeUndefined();
    expect(noveliaa?.href).toBe('https://noveliaa.web.app/');
    expect(noveliaa?.external).toBeTrue();
    home.setCategory('Creative');
    expect(home.filteredApps.map(app => app.id)).toContain('noveliaa');
    home.pinnedIds = ['noveliaa'];
    home.recentIds = ['noveliaa'];
    expect(home.pinnedApps.map(app => app.id)).toEqual(['noveliaa']);
    expect(home.recentApps.map(app => app.id)).toEqual(['noveliaa']);
  });

  it('keeps One Piece available under Entertainment', () => {
    const home = createHome();
    home.setCategory('Entertainment');
    expect(home.filteredApps.map(app => app.id)).toContain('one-piece');
  });
});
