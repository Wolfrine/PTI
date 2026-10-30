import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, OnInit, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AtlasMapComponent } from './atlas-map.component';
import { AtlasContextComponent } from './atlas-context.component';
import { AtlasWorkspaceComponent } from './atlas-workspace.component';
import { ATLAS_SECTORS, ATLAS_SUBJECTS, ATLAS_SOURCE_CHECKED_AT } from '../../services/atlas.catalog';
import { AtlasService } from '../../services/atlas.service';
import {
  ATLAS_PROGRESS_LABELS, ATLAS_REVIEW_LABELS, AtlasEvidence, AtlasEvent, AtlasProgressState,
  AtlasReviewStatus, AtlasSector, AtlasSource, AtlasSubject, atlasSafeSourceUrl,
} from '../../services/atlas.models';

type AtlasView = 'atlas' | 'work' | 'review' | 'history' | 'sources';
type ReviewFilter = 'pending' | 'all' | AtlasReviewStatus;

@Component({
  selector: 'app-new-atlas',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AtlasMapComponent, AtlasContextComponent, AtlasWorkspaceComponent],
  templateUrl: './new-atlas.component.html',
  styleUrls: ['./new-atlas.component.scss', './atlas-radial-layout.scss'],
})
export class NewAtlasComponent implements OnInit {
  readonly service = inject(AtlasService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  @ViewChild('atlasSearch') searchBox?: ElementRef<HTMLInputElement>;
  @ViewChild('contentHeading') contentHeading?: ElementRef<HTMLElement>;

  readonly sectors = ATLAS_SECTORS;
  readonly subjects = ATLAS_SUBJECTS;
  readonly sourceCheckedAt = ATLAS_SOURCE_CHECKED_AT;
  readonly fieldSectorId = signal('computing');
  readonly fieldSector = computed(() => this.sectors.find(sector => sector.id === this.fieldSectorId()) ?? this.sectors[0]);
  readonly fieldSubjects = computed(() => this.subjects.filter(subject => subject.sectorId === this.fieldSector().id));
  readonly otherFieldSectors = computed(() => this.sectors.filter(sector => sector.id !== this.fieldSector().id));
  readonly progressLabels = ATLAS_PROGRESS_LABELS;
  readonly reviewLabels = ATLAS_REVIEW_LABELS;
  readonly progressStates = Object.keys(ATLAS_PROGRESS_LABELS) as AtlasProgressState[];
  readonly tabs: { id: AtlasView; label: string }[] = [
    { id: 'atlas', label: 'The atlas' }, { id: 'work', label: 'Our work' },
    { id: 'review', label: 'Review' }, { id: 'history', label: 'History' }, { id: 'sources', label: 'Sources' },
  ];
  readonly view = signal<AtlasView>('atlas');
  readonly sectorId = signal<string | null>(null);
  readonly subjectId = signal<string | null>(null);
  readonly query = signal('');
  readonly reviewFilter = signal<ReviewFilter>('pending');
  readonly notice = signal('');
  readonly actionError = signal('');
  readonly selectedSubject = computed(() => this.subjects.find(subject => subject.id === this.subjectId()) ?? null);
  readonly selectedSector = computed(() => this.sectors.find(sector => sector.id === (this.selectedSubject()?.sectorId ?? this.sectorId())) ?? null);
  readonly matchingSubjects = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.subjects.filter(subject => (!this.selectedSector() || subject.sectorId === this.selectedSector()?.id)
      && (!query || `${subject.title} ${subject.summary} ${this.sectorName(subject.sectorId)}`.toLocaleLowerCase().includes(query)));
  });
  readonly awaitingEvidence = computed(() => this.service.snapshot().evidence.filter(item => {
    const review = this.reviewFor(item.id);
    return (!review && !this.service.snapshot().hasMore.reviews) || review?.status === 'needs-context';
  }));
  readonly visibleEvidence = computed(() => this.service.snapshot().evidence.filter(item => {
    const status = this.reviewFor(item.id)?.status;
    const filter = this.reviewFilter();
    const matchesStatus = filter === 'all' || (filter === 'pending' ? (!status && !this.service.snapshot().hasMore.reviews) || status === 'needs-context' : status === filter);
    const query = this.query().trim().toLocaleLowerCase();
    return matchesStatus && (!query || `${item.record.claim} ${item.record.projectId} ${item.record.sourceSystem}`.toLocaleLowerCase().includes(query));
  }));
  readonly workSubjects = computed(() => this.subjects.filter(subject => {
    const progress = this.progressFor(subject.id);
    const query = this.query().trim().toLocaleLowerCase();
    return ((progress && progress.state !== 'unknown') || this.workEvidenceFor(subject.id).length > 0)
      && (!query || `${subject.title} ${subject.summary} ${this.sectorName(subject.sectorId)}`.toLocaleLowerCase().includes(query));
  }));
  readonly unmappedEvidence = computed(() => this.service.snapshot().evidence.filter(item => !item.record.subjectIds.some(id => this.subjects.some(subject => subject.id === id))));
  readonly sortedEvents = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return [...this.service.snapshot().events].filter(event => !query || `${this.eventTitle(event)} ${this.eventSummary(event)} ${this.eventNote(event)}`.toLocaleLowerCase().includes(query)).sort((a, b) => b.createdAt - a.createdAt);
  });
  readonly filteredSources = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.service.snapshot().sources.filter(source => !query || `${source.sourceId} ${source.system} ${source.locator}`.toLocaleLowerCase().includes(query));
  });
  readonly partial = computed(() => Object.values(this.service.snapshot().hasMore).some(Boolean));
  readonly focusSubjects = computed(() => this.subjects.filter(subject => {
    const state = this.progressFor(subject.id)?.state;
    return !!state && state !== 'unknown' && state !== 'paused';
  }).slice(0, 4));

  progressDraft: AtlasProgressState = 'unknown';
  progressNote = '';
  progressDirty = false;
  reviewNotes: Partial<Record<string, string>> = {};
  readonly capturePrompt = 'Capture evidence for Civilization Atlas through PTI. Read atlas context and the enabled source allowlist first. Collect a bounded source/date selection, preserve exact provenance and revisions, then import an idempotent pending batch. Never infer personal understanding, include opted-out chats, or claim exhaustive coverage. Read back the run receipt and report any gaps.';

  constructor() {
    effect(() => {
      const subject = this.selectedSubject();
      const snapshot = this.service.snapshot();
      if (!snapshot.loadedAt) {
        this.progressDraft = 'unknown'; this.progressNote = ''; this.progressDirty = false;
        this.reviewNotes = {}; this.notice.set(''); this.actionError.set('');
        return;
      }
      if (subject && !this.progressDirty) {
        const progress = snapshot.progress.find(item => item.id === subject.id);
        this.progressDraft = progress?.state ?? 'unknown';
        this.progressNote = progress?.note ?? '';
      }
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params => {
      const view = params.get('view');
      this.view.set(this.tabs.some(tab => tab.id === view) ? view as AtlasView : 'atlas');
      const subject = this.subjects.find(item => item.id === params.get('subject'));
      const sector = this.sectors.find(item => item.id === params.get('sector'));
      this.progressDirty = false;
      this.subjectId.set(subject?.id ?? null);
      this.sectorId.set(subject?.sectorId ?? sector?.id ?? null);
    });
  }

  setView(view: AtlasView): void {
    this.query.set(''); this.notice.set(''); this.actionError.set('');
    this.navigate({ view, sector: null, subject: null });
  }
  openSector(sector: AtlasSector): void {
    this.query.set(''); this.notice.set(''); this.actionError.set('');
    this.navigate({ view: 'atlas', sector: sector.id, subject: null });
  }
  selectFieldSector(sector: AtlasSector): void {
    if (window.matchMedia('(max-width:760px)').matches) this.openSector(sector);
    else this.fieldSectorId.set(sector.id);
  }
  openSubject(subject: AtlasSubject): void {
    this.query.set(''); this.notice.set(''); this.actionError.set(''); this.progressDirty = false;
    this.navigate({ view: 'atlas', sector: subject.sectorId, subject: subject.id });
  }
  overview(): void { this.query.set(''); this.navigate({ view: 'atlas', sector: null, subject: null }); }
  private navigate(queryParams: { view: AtlasView; sector: string | null; subject: string | null }): Promise<void> {
    return this.router.navigate([], { relativeTo: this.route, queryParams }).then(() => {
      this.contentHeading?.nativeElement.focus({ preventScroll: true });
      if (window.matchMedia('(max-width:760px)').matches) this.contentHeading?.nativeElement.scrollIntoView({ block: 'start' });
    });
  }

  inspectEvidence(item: AtlasEvidence): void {
    this.query.set(''); this.notice.set(''); this.reviewFilter.set('all');
    void this.navigate({ view: 'review', sector: null, subject: null }).then(() => {
      window.requestAnimationFrame(() => this.jumpTo(`evidence-${item.id}`));
    });
  }

  jumpTo(id: string): void {
    const target = document.getElementById(id);
    target?.scrollIntoView({ block: 'start', behavior: 'auto' });
    target?.focus({ preventScroll: true });
  }

  evidenceFor(subjectId: string): AtlasEvidence[] { return this.service.snapshot().evidence.filter(item => item.record.subjectIds.includes(subjectId)); }
  workEvidenceFor(subjectId: string): AtlasEvidence[] { return this.evidenceFor(subjectId).filter(item => this.reviewFor(item.id)?.status !== 'rejected' && !this.reviewUnavailable(item.id)); }
  reviewFor(id: string) { return this.service.snapshot().reviews.find(item => item.id === id); }
  progressFor(id: string) { return this.service.snapshot().progress.find(item => item.id === id); }
  sectorName(id: string): string { return this.sectors.find(sector => sector.id === id)?.title ?? 'Unmapped sector'; }
  subjectName(id: string): string { return this.subjects.find(subject => subject.id === id)?.title ?? id; }
  sectorEvidenceCount(sector: AtlasSector): number {
    return this.service.snapshot().evidence.filter(item => this.reviewFor(item.id)?.status !== 'rejected' && !this.reviewUnavailable(item.id) && item.record.subjectIds.some(id => sector.subjectIds.includes(id))).length;
  }
  sectorProgressCount(sector: AtlasSector): number {
    return this.service.snapshot().progress.filter(item => sector.subjectIds.includes(item.id) && item.state !== 'unknown').length;
  }
  sectorHasWork(sector: AtlasSector): boolean { return this.sectorEvidenceCount(sector) > 0 || this.sectorProgressCount(sector) > 0; }
  countLabel(count: number, singular: string, plural = `${singular}s`): string { return `${count} ${count === 1 ? singular : plural}`; }
  reviewUnavailable(id: string): boolean { return !this.reviewFor(id) && this.service.snapshot().hasMore.reviews; }
  progressUnavailable(id: string): boolean { return !this.progressFor(id) && this.service.snapshot().hasMore.progress; }
  positionLabel(id: string): string { return !this.service.snapshot().loadedAt || this.progressUnavailable(id) ? 'Position not loaded' : this.progressLabels[this.progressFor(id)?.state ?? 'unknown']; }
  reviewLabel(item: AtlasEvidence): string { const review = this.reviewFor(item.id); return review ? this.reviewLabels[review.status] : this.reviewUnavailable(item.id) ? 'Review not loaded' : 'Awaiting review'; }
  safeUrl(value: string): string | null { return atlasSafeSourceUrl(value); }
  sourceLabel(value: string): string {
    const safe = this.safeUrl(value);
    if (!safe) return value;
    try { return new URL(safe).hostname.replace(/^www\./, ''); } catch { return value; }
  }
  sourceSummary(value: string): string {
    const safe = this.safeUrl(value);
    if (safe) return new URL(safe).hostname.replace(/^www\./, '');
    return value.length > 110 ? `${value.slice(0, 107)}…` : value;
  }
  async copySourcePolicy(source: AtlasSource): Promise<void> {
    const text = [`Source: ${source.sourceId}`, `System: ${source.system}`, `Label or locator: ${source.locator}`,
      'Exact locations:', ...source.recordLocators, 'Bounded prefixes:', ...source.recordLocatorPrefixes].join('\n');
    try { await navigator.clipboard.writeText(text); this.notice.set('Exact source approval copied. No source permissions were changed.'); }
    catch { this.notice.set('Clipboard unavailable. Expand the source approval and select its exact locations to copy.'); }
  }
  date(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return 'Date not recorded';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Date not recorded';
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(date);
  }
  time(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return 'Time not recorded';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Time not recorded';
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(date) + ' IST';
  }
  eventTitle(event: AtlasEvent): string {
    if (event.kind === 'progress') return this.subjectName(event.targetId);
    if (event.kind === 'source') return 'Source access changed';
    if (event.kind === 'evidence-conflict') return 'Conflicting evidence retained';
    return 'Evidence review';
  }
  eventSummary(event: AtlasEvent): string {
    if (event.kind === 'progress') {
      const state = event.after?.['state'] as AtlasProgressState;
      return `${this.progressLabels[state] ?? 'Progression updated'} · self-reported`;
    }
    if (event.kind === 'review') return this.reviewLabels[event.after?.['status'] as AtlasReviewStatus] ?? 'Review recorded';
    if (event.kind === 'source') return event.after?.['enabled'] ? 'Enabled for future captures' : 'Paused for future captures';
    return 'Requires review; no source record was overwritten';
  }
  eventNote(event: AtlasEvent): string { return typeof event.after?.['note'] === 'string' ? event.after['note'] : ''; }
  markProgressDirty(): void { this.progressDirty = true; }

  async saveProgress(): Promise<void> {
    const subject = this.selectedSubject();
    if (!subject || this.service.saving() || !this.service.snapshot().loadedAt || this.progressUnavailable(subject.id)) return;
    this.notice.set(''); this.actionError.set('');
    try {
      await this.service.setProgress(subject.id, this.progressDraft, this.progressNote);
      this.progressDirty = false;
      this.notice.set('Your self-reported progression was saved, with its history.');
    } catch (error) { this.actionError.set(error instanceof Error ? error.message : 'Your position could not be saved. Please retry.'); }
  }
  async review(item: AtlasEvidence, status: AtlasReviewStatus): Promise<void> {
    if (this.service.saving() || !this.service.snapshot().loadedAt || this.reviewUnavailable(item.id)) return;
    this.notice.set(''); this.actionError.set('');
    try {
      await this.service.reviewEvidence(item.id, status, this.reviewNotes[item.id] ?? this.reviewFor(item.id)?.note ?? '');
      this.notice.set(status === 'accepted' ? 'Evidence linked. This does not certify personal understanding.' : 'Review saved. Original evidence and decision history are preserved.');
    } catch (error) { this.actionError.set(error instanceof Error ? error.message : 'Your review could not be saved. Please retry.'); }
  }
  async toggleSource(source: AtlasSource): Promise<void> {
    if (this.service.saving() || !this.service.snapshot().loadedAt) return;
    this.notice.set(''); this.actionError.set('');
    try {
      await this.service.setSource({ sourceId: source.sourceId, system: source.system, locator: source.locator,
        recordLocatorPrefixes: source.recordLocatorPrefixes, recordLocators: source.recordLocators, enabled: !source.enabled });
      this.notice.set(source.enabled ? 'Source paused for future captures. Existing evidence is preserved.' : 'Source enabled for future captures.');
    } catch (error) { this.actionError.set(error instanceof Error ? error.message : 'Source access could not be changed. Please retry.'); }
  }
  async copyCapturePrompt(): Promise<void> {
    try { await navigator.clipboard.writeText(this.capturePrompt); this.notice.set('Capture prompt copied. Paste it into a connected agent chat.'); }
    catch { this.notice.set('Clipboard unavailable. Select and copy the capture prompt below.'); }
  }
  async refresh(): Promise<void> { this.notice.set(''); this.actionError.set(''); await this.service.refresh(); }
  exportData(): void {
    this.actionError.set(''); this.notice.set('');
    try { this.service.exportData(); this.notice.set(this.partial() ? 'Exported the loaded selection. More records remain to be loaded.' : 'Exported the currently loaded Atlas records.'); }
    catch { this.actionError.set('The export could not be created. Please retry in your browser.'); }
  }

  @HostListener('document:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const editing = target?.matches('input,textarea,select,[contenteditable="true"]');
    if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); this.searchBox?.nativeElement.focus();
    }
  }
}
