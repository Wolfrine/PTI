import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, Inject, OnInit, PLATFORM_ID, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IntelligenceService } from '../../services/intelligence.service';
import {
  INTELLIGENCE_SHARE_DRAFT_KEY, IntelligenceCapture, IntelligenceStatus, IntelligenceShareDraft,
  extractSharedUrl, intelligenceSourceLabel,
} from '../../services/intelligence.models';

type InboxFilter = 'all' | IntelligenceStatus;

@Component({
  selector: 'app-new-intelligence',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './new-intelligence.component.html',
  styleUrl: './new-intelligence.component.scss',
})
export class NewIntelligenceComponent implements OnInit {
  readonly service = inject(IntelligenceService);
  @ViewChild('detailDialog') detailDialog?: ElementRef<HTMLDialogElement>;
  readonly filter = signal<InboxFilter>('all');
  readonly search = signal('');
  readonly selected = signal<IntelligenceCapture | null>(null);
  readonly filtered = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    const filter = this.filter();
    return this.service.captures().filter(item =>
      (filter === 'all' || item.status === filter) &&
      (!query || `${item.title} ${item.note} ${item.sharedText} ${item.projectHint} ${item.sourceUrl}`.toLocaleLowerCase().includes(query))
    );
  });
  readonly filters: { id: InboxFilter; label: string }[] = [
    { id: 'all', label: 'All' }, { id: 'received', label: 'New' },
    { id: 'organized', label: 'Organized' }, { id: 'archived', label: 'Archived' },
  ];

  sourceUrl = '';
  title = '';
  sharedText = '';
  note = '';
  projectHint = '';
  fromShare = false;
  captureError = '';
  notice = '';
  constructor(@Inject(PLATFORM_ID) private readonly platformId: object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const raw = sessionStorage.getItem(INTELLIGENCE_SHARE_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as IntelligenceShareDraft;
      sessionStorage.removeItem(INTELLIGENCE_SHARE_DRAFT_KEY);
      if (Date.now() - draft.receivedAt > 24 * 60 * 60 * 1000) return;
      this.title = draft.title;
      this.sharedText = draft.text;
      this.sourceUrl = draft.url || extractSharedUrl(draft.text);
      this.fromShare = true;
      this.notice = 'Shared item ready. Add context if useful, then save it.';
    } catch { this.captureError = 'A shared draft could not be opened. You can paste the link here.'; }
  }

  async save(): Promise<void> {
    this.captureError = '';
    this.notice = '';
    if (!navigator.onLine) {
      this.captureError = 'Connect to the internet to save this source. Your draft stays here while you retry.';
      return;
    }
    try {
      const result = await this.service.capture({
        sourceUrl: this.sourceUrl, title: this.title, sharedText: this.sharedText,
        note: this.note, projectHint: this.projectHint, sourceKind: this.fromShare ? 'share' : 'manual',
      });
      this.sourceUrl = ''; this.title = ''; this.sharedText = ''; this.note = ''; this.projectHint = ''; this.fromShare = false;
      this.filter.set('all'); this.search.set('');
      this.notice = result.duplicateOf
        ? 'Saved with your new context. This source was captured earlier, so both entries are linked.'
        : 'Saved to your private PTI inbox.';
    } catch (error) { this.captureError = error instanceof Error ? error.message : 'Capture failed. Please retry.'; }
  }

  show(item: IntelligenceCapture): void {
    this.selected.set(item);
    this.detailDialog?.nativeElement.showModal();
  }

  close(): void { this.detailDialog?.nativeElement.close(); this.selected.set(null); }

  async update(item: IntelligenceCapture, status: IntelligenceStatus): Promise<void> {
    this.captureError = ''; this.notice = '';
    try {
      await this.service.setStatus(item, status);
      this.close();
      this.notice = status === 'archived' ? 'Capture archived.' : status === 'organized' ? 'Capture marked organized.' : 'Capture returned to the new inbox.';
    } catch (error) { this.captureError = error instanceof Error ? error.message : 'Could not update this item.'; }
  }

  source(item: IntelligenceCapture): string { return intelligenceSourceLabel(item.sourceUrl); }
  platform(item: IntelligenceCapture): string { return ({ instagram: 'IG', youtube: 'YT', x: 'X', web: 'WEB' })[item.platform]; }
  status(item: IntelligenceCapture): string { return ({ received: 'New', organized: 'Organized', archived: 'Archived' })[item.status]; }
  heading(item: IntelligenceCapture): string { return item.title || item.note || item.sharedText || this.source(item); }
  excerpt(item: IntelligenceCapture): string { return item.note || item.sharedText || item.sourceUrl || 'Saved for later'; }
  date(timestamp: number): string {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(timestamp);
  }
}
