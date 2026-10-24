import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthGuard } from './guards/auth.guard';

@Component({ standalone: true, template: 'Route test destination' })
class RouteDestination {}

describe('PTI Home route retirement', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [
    provideRouter(routes.map(route => route.component ? { ...route, component: RouteDestination } : route)),
    { provide: AuthGuard, useValue: { canActivate: () => true } },
  ] }));

  it('resolves legacy dashboard and project bookmarks to the guarded Home route', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    for (const path of ['/dashboard', '/new-dashboard', '/codex-command', '/codex-command/projects/old-project']) {
      await harness.navigateByUrl(path);
      expect(router.url).toBe('/home');
    }
    expect(routes.find(route => route.path === 'home')?.canActivate).toContain(AuthGuard);
  });

  it('continues to resolve standalone domain and activity routes directly', async () => {
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    for (const path of ['/domains', '/domains/existing-domain', '/activities']) {
      await harness.navigateByUrl(path);
      expect(router.url).toBe(path);
    }
  });
});
