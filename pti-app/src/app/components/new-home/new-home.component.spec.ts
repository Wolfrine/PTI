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

  it('includes verified ecosystem destinations without exposing private or unverified apps', () => {
    const home = createHome();
    const deployed: Record<string, string> = {
      'gtop': 'https://gtop-app.web.app/',
      'gt-hub': 'https://hub-growthtutorials.web.app/',
      'gt-website': 'https://growth-tutorials.web.app/',
      'robotics': 'https://lumi-robo.web.app/#prototypes',
    };
    for (const [id, href] of Object.entries(deployed)) {
      const app = home.apps.find(candidate => candidate.id === id);
      expect(app?.href).toBe(href);
      expect(app?.external).toBeTrue();
    }
    expect(home.apps.some(app => ['velum', 'ops-forge', 'storyforge'].includes(app.id))).toBeFalse();
    expect(home.projects.some(project => project.name === 'StoryForge' && project.href.includes('github.com/Wolfrine/StoryForge'))).toBeTrue();
  });
  it('keeps One Piece available under Entertainment', () => {
    const home = createHome();
    home.setCategory('Entertainment');
    expect(home.filteredApps.map(app => app.id)).toContain('one-piece');
    expect(home.apps.find(app => app.id === 'one-piece')?.href).toBe('https://pti-app-2ab59-one-piece.web.app/');
  });

  it('opens Civilization Atlas inside PTI without changing existing default pins', () => {
    const home = createHome();
    const atlas = home.apps.find(app => app.id === 'atlas');
    expect(atlas?.href).toBe('/atlas'); expect(atlas?.external).toBeUndefined();
    home.setCategory('Knowledge');
    expect(home.filteredApps.map(app => app.id)).toContain('atlas');
    expect(home.pinnedIds).toEqual(['tracker', 'morsel', 'venture', 'personal', 'luminary', 'sefpo']);
    home.searchQuery = 'civilization';
    expect(home.filteredApps.map(app => app.id)).toEqual(['atlas']);
  });

  it('retires dashboard and CEO IDs from all launcher surfaces and purges saved IDs', () => {
    localStorage.setItem('pti.home.pins.v1', JSON.stringify(['pti-dashboard', 'tracker', 'ceo-command']));
    localStorage.setItem('pti.home.recent.v1', JSON.stringify(['ceo-command', 'noveliaa']));
    const home = new NewHomeComponent({ navigateByUrl: () => Promise.resolve(true) } as unknown as Router, 'browser' as unknown as object);
    home.ngOnInit();
    expect(home.pinnedIds).toEqual(['tracker']);
    expect(home.recentIds).toEqual(['noveliaa']);
    expect(JSON.parse(localStorage.getItem('pti.home.pins.v1')!)).toEqual(['tracker']);
    expect(home.apps.some(app => ['pti-dashboard', 'ceo-command'].includes(app.id))).toBeFalse();
    localStorage.removeItem('pti.home.pins.v1'); localStorage.removeItem('pti.home.recent.v1');
  });
});
