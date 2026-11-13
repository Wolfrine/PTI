import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { INTELLIGENCE_SHARE_DRAFT_KEY, IntelligenceShareDraft } from '../../services/intelligence.models';

@Component({
  selector: 'app-new-intelligence-share',
  standalone: true,
  imports: [RouterLink],
  template: `<main class="share-landing"><p>Opening your PTI Intelligence Inbox…</p><a routerLink="/intelligence">Continue to the inbox</a><p>{{ error }}</p></main>`,
  styles: [`.share-landing{min-height:90svh;display:grid;place-content:center;gap:1rem;text-align:center;background:#fbfaf8;color:#292623;font:1rem Arial,sans-serif}.share-landing a{color:#ba4a3c}`],
})
export class NewIntelligenceShareComponent implements OnInit {
  error = '';
  constructor(private readonly router: Router, @Inject(PLATFORM_ID) private readonly platformId: object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const params = new URLSearchParams(window.location.search);
    const draft: IntelligenceShareDraft = {
      title: (params.get('title') ?? '').slice(0, 240),
      text: (params.get('text') ?? '').slice(0, 4000),
      url: (params.get('url') ?? '').slice(0, 2048),
      receivedAt: Date.now(),
    };
    // Strip shared content from browser history immediately. V1's GET share
    // target is link/text only; POST requires a separately handled worker.
    window.history.replaceState(window.history.state, '', '/intelligence/share');
    if (draft.title || draft.text || draft.url) {
      try { sessionStorage.setItem(INTELLIGENCE_SHARE_DRAFT_KEY, JSON.stringify(draft)); }
      catch { this.error = 'Private storage is unavailable. Copy the source link into the inbox manually.'; return; }
    }
    void this.router.navigateByUrl('/intelligence');
  }
}
