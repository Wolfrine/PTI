import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, HostListener, Inject, OnInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NewCodexUsageComponent } from '../new-codex-usage/new-codex-usage.component';

type AppCategory = 'Productivity' | 'Personal' | 'Ideas' | 'Knowledge' | 'Creative' | 'Entertainment';
type AppTone = 'coral' | 'mint' | 'amber' | 'blue' | 'violet' | 'sun' | 'rose' | 'teal' | 'plum';

interface HubApp {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  category: AppCategory;
  tone: AppTone;
  href: string;
  status?: 'planning';
  external?: boolean;
  documentNavigation?: boolean;
}

const PINNED_DEFAULTS = ['tracker', 'morsel', 'venture', 'personal', 'luminary', 'sefpo'];
const PIN_STORAGE_KEY = 'pti.home.pins.v1';
const RECENT_STORAGE_KEY = 'pti.home.recent.v1';

@Component({
  selector: 'app-new-home',
  standalone: true,
  imports: [CommonModule, MatIconModule, NewCodexUsageComponent],
  templateUrl: './new-home.component.html',
  styleUrl: './new-home.component.scss',
})
export class NewHomeComponent implements OnInit {
  @ViewChild('searchBox') searchBox?: ElementRef<HTMLInputElement>;
  @ViewChild('appDirectory') appDirectory?: ElementRef<HTMLElement>;

  // Curated launcher entries only. Private tools are intentionally excluded from all surfaces.
  readonly apps: readonly HubApp[] = [
    { id: 'tracker', name: 'Self-Tracking', shortName: 'Tracker', description: 'Track outcomes and the progress behind them', icon: 'task_alt', category: 'Productivity', tone: 'mint', href: 'https://pti-app-2ab59-tracker.web.app/', external: true },
    { id: 'morsel', name: 'Morsel', shortName: 'Morsel', description: 'Your food memories and next meal', icon: 'restaurant_menu', category: 'Personal', tone: 'amber', href: 'https://pti-app-2ab59-morsel.web.app/', external: true },
    { id: 'venture', name: 'Venture', shortName: 'Venture', description: 'Explore ideas, experiments and opportunities', icon: 'insights', category: 'Ideas', tone: 'blue', href: 'https://pti-app-2ab59-venture.web.app/', external: true },
    { id: 'personal', name: 'Personal', shortName: 'Personal', description: 'Your daily intelligence and discoveries', icon: 'auto_stories', category: 'Personal', tone: 'violet', href: 'https://pti-app-2ab59-personal.web.app/', external: true },
    { id: 'luminary', name: 'Luminary', shortName: 'Luminary', description: 'Observe, reflect and understand patterns', icon: 'wb_sunny', category: 'Knowledge', tone: 'sun', href: 'https://pti-app-2ab59-luminary.web.app/', external: true },
    { id: 'sefpo', name: 'SEFPO Lab', shortName: 'SEFPO Lab', description: 'Connected ideas and structured knowledge', icon: 'hub', category: 'Knowledge', tone: 'plum', href: 'https://pti-app-2ab59-sefpo.web.app/', external: true },
    { id: 'wedding', name: 'Wedding Planner', shortName: 'Wedding', description: 'Mahima & Mayank’s wedding workspace', icon: 'favorite_border', category: 'Personal', tone: 'rose', href: 'https://mahima-mayank.web.app/', external: true },
    { id: 'one-piece', name: 'One Piece', shortName: 'One Piece', description: 'Japanese audio, English subtitles and family viewing', icon: 'movie', category: 'Entertainment', tone: 'blue', href: 'https://pti-app-2ab59-one-piece.web.app/one-piece/', external: true },
    { id: 'noveliaa', name: 'Noveliaa', shortName: 'Noveliaa', description: 'An author-led space for writing, collaboration and reading', icon: 'edit_note', category: 'Creative', tone: 'violet', href: 'https://noveliaa.web.app/', external: true },
  ];
  readonly categories: readonly ('All' | AppCategory)[] = ['All', 'Productivity', 'Personal', 'Ideas', 'Knowledge', 'Creative', 'Entertainment'];
  readonly projects = [
    { name: 'Visual Experiments', description: 'Research and interactive prototypes', icon: 'science', href: 'https://github.com/Wolfrine/PTI/tree/main/visual-experiments' },
  ];

  searchQuery = '';
  selectedCategory: 'All' | AppCategory = 'All';
  editingPins = false;
  pinnedIds: string[] = [...PINNED_DEFAULTS];
  recentIds: string[] = [];

  constructor(private readonly router: Router, @Inject(PLATFORM_ID) private readonly platformId: object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.pinnedIds = this.readIds(PIN_STORAGE_KEY, PINNED_DEFAULTS);
    this.recentIds = this.readIds(RECENT_STORAGE_KEY, []);
    // Purge stale launch history/pins for entries removed from this curated directory.
    this.writeIds(PIN_STORAGE_KEY, this.pinnedIds);
    this.writeIds(RECENT_STORAGE_KEY, this.recentIds);
  }

  get pinnedApps(): HubApp[] {
    return this.pinnedIds.map(id => this.apps.find(app => app.id === id)).filter((app): app is HubApp => !!app?.href);
  }

  get recentApps(): HubApp[] {
    return this.recentIds.map(id => this.apps.find(app => app.id === id)).filter((app): app is HubApp => !!app?.href).slice(0, 3);
  }

  get suggestions(): HubApp[] {
    return this.recentApps.length ? this.recentApps : ['tracker', 'morsel', 'venture'].map(id => this.apps.find(app => app.id === id)!).filter(Boolean);
  }

  get filteredApps(): HubApp[] {
    const query = this.searchQuery.trim().toLocaleLowerCase();
    return this.apps.filter(app =>
      (this.selectedCategory === 'All' || app.category === this.selectedCategory) &&
      (!query || `${app.name} ${app.description} ${app.category} ${app.status ?? ''}`.toLocaleLowerCase().includes(query))
    );
  }

  isPinned(app: HubApp): boolean { return this.pinnedIds.includes(app.id); }

  setCategory(category: 'All' | AppCategory): void { this.selectedCategory = category; }

  openDirectory(): void {
    this.selectedCategory = 'All';
    this.appDirectory?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  focusSearch(): void {
    this.searchBox?.nativeElement.focus();
    this.appDirectory?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  @HostListener('document:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const editing = target?.matches('input,textarea,[contenteditable="true"]');
    if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !editing)) {
      event.preventDefault();
      this.focusSearch();
    }
  }

  launch(event: MouseEvent, app: HubApp): void {
    if (!app.href) { event.preventDefault(); return; }
    this.recentIds = [app.id, ...this.recentIds.filter(id => id !== app.id)].slice(0, 8);
    this.writeIds(RECENT_STORAGE_KEY, this.recentIds);
    if (!app.external && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      if (app.documentNavigation) window.location.assign(app.href);
      else void this.router.navigateByUrl(app.href);
    }
  }

  togglePin(event: MouseEvent, app: HubApp): void {
    event.stopPropagation();
    if (!app.href) return;
    this.pinnedIds = this.isPinned(app)
      ? this.pinnedIds.filter(id => id !== app.id)
      : [...this.pinnedIds, app.id];
    this.writeIds(PIN_STORAGE_KEY, this.pinnedIds);
  }

  private readIds(key: string, fallback: readonly string[]): string[] {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return [...fallback];
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [...fallback];
      return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && this.apps.some(app => app.id === id && !!app.href)))];
    } catch { return [...fallback]; }
  }

  private writeIds(key: string, ids: string[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { window.localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Private browsing can disable storage. */ }
  }
}
