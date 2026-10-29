import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ATLAS_SOURCE_SYSTEMS, AtlasSourceInput, atlasSafeId } from '../../services/atlas.models';
import { AtlasService } from '../../services/atlas.service';

export interface AtlasSourceDraft { sourceId: string; system: string; locator: string; exact: string; prefixes: string; }
const blankDraft = (): AtlasSourceDraft => ({ sourceId: '', system: 'github', locator: '', exact: '', prefixes: '' });

function boundedLocation(system: string, value: string, prefix: boolean): boolean {
  if (value.length > 2000 || /[\u0000-\u0020\\]/.test(value) || /(?:^|\/)\.\.(?:\/|$)|%(?:2e|2f|5c)/i.test(value)) return false;
  if (system === 'user-report') return !prefix && /^owner-report\/[A-Za-z0-9_-]{1,128}$/.test(value);
  if (system === 'pti-tracker-firestore') return new RegExp('^users/[^/]+/trackerData/workspace/(evidence|events|nodes|edges|assessments|dayIndex|sourceState|runs)/' + (prefix ? '$' : '[A-Za-z0-9_-]{1,200}$')).test(value);
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
  if (system === 'github') return url.hostname === 'github.com' && !url.search && !/\/chatgpt_harness(?:\/|$)/i.test(url.pathname)
    && (prefix ? /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:[^?#]*\/)?$/.test(url.pathname) : /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[^?#]*)?$/.test(url.pathname));
  if (prefix) return false;
  if (system === 'chatgpt-pages') return url.hostname === 'chatgpt.com' && /^\/space\/page_[a-z0-9]+$/.test(url.pathname) && !url.search;
  if (system === 'google-drive-spreadsheet') return url.hostname === 'docs.google.com' && /^\/spreadsheets\/d\/[A-Za-z0-9_-]+(?:\/[^?#]*)?$/.test(url.pathname);
  if (system === 'google-drive-document') return url.hostname === 'docs.google.com' && /^\/document\/d\/[A-Za-z0-9_-]+(?:\/[^?#]*)?$/.test(url.pathname);
  return system === 'web-primary-source' && !['chatgpt.com', 'chat.openai.com', 'docs.google.com', 'drive.google.com'].includes(url.hostname);
}

export function atlasSourceDraftInput(draft: AtlasSourceDraft): AtlasSourceInput {
  const sourceId = draft.sourceId.trim();
  const locator = draft.locator.trim();
  if (!atlasSafeId(sourceId)) throw new Error('Use a source ID of 1–128 letters, numbers, hyphens or underscores.');
  if (!(ATLAS_SOURCE_SYSTEMS as readonly string[]).includes(draft.system)) throw new Error('Choose a supported source system.');
  if (!locator || locator.length > 2000) throw new Error('Add a source label or locator within 2,000 characters.');
  const lines = (value: string) => [...new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
  const recordLocators = lines(draft.exact), recordLocatorPrefixes = lines(draft.prefixes);
  if (recordLocators.length > 8 || recordLocatorPrefixes.length > 4) throw new Error('Use at most 8 exact locations and 4 bounded prefixes per source.');
  if (!recordLocators.length && !recordLocatorPrefixes.length) throw new Error('Add at least one exact location or permitted bounded prefix.');
  if (recordLocatorPrefixes.length && !['github', 'pti-tracker-firestore'].includes(draft.system)) throw new Error('Only GitHub repositories and owner-scoped Tracker collections allow prefixes.');
  if (!recordLocators.every(location => boundedLocation(draft.system, location, false)) || !recordLocatorPrefixes.every(location => boundedLocation(draft.system, location, true))) throw new Error('A location is not valid for this source system. Use exact HTTPS pages/documents, a bounded repository prefix, or an owner-scoped Tracker path. Whole Drive, Pages and chat-history access is not allowed.');
  return { sourceId, system: draft.system, locator, recordLocators, recordLocatorPrefixes, enabled: true };
}

@Component({ selector: 'app-atlas-source-approval', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './atlas-source-approval.component.html', styleUrl: './atlas-source-approval.component.scss' })
export class AtlasSourceApprovalComponent {
  readonly service = inject(AtlasService);
  readonly systems = ATLAS_SOURCE_SYSTEMS;
  readonly error = signal('');
  readonly confirmation = signal('');
  draft = blankDraft();
  opened = false;
  readonly labels: Record<string, string> = { github: 'GitHub repository', 'chatgpt-pages': 'ChatGPT Space page', 'pti-tracker-firestore': 'PTI Tracker (current owner only)', 'google-drive-spreadsheet': 'Google Sheets document', 'google-drive-document': 'Google Docs document', 'web-primary-source': 'Primary-source web page', 'user-report': 'Owner self-report' };

  constructor() {
    effect(() => { if (!this.service.snapshot().loadedAt) { this.draft = blankDraft(); this.opened = false; this.error.set(''); this.confirmation.set(''); } });
  }
  changeSystem(): void { this.draft.prefixes = ''; this.error.set(''); }
  prefixesAllowed(): boolean { return ['github', 'pti-tracker-firestore'].includes(this.draft.system); }

  async approve(): Promise<void> {
    if (this.service.saving() || !this.service.snapshot().loadedAt || this.service.snapshot().hasMore.sources) return;
    this.error.set(''); this.confirmation.set('');
    try {
      const input = atlasSourceDraftInput(this.draft);
      if (this.service.snapshot().sources.some(source => source.id === input.sourceId)) throw new Error('That source ID already exists. Use its existing enable/pause control, or choose a new ID for a different bounded approval.');
      await this.service.setSource(input);
      this.draft = blankDraft();
      this.confirmation.set('Source approved and enabled for future captures. No evidence was collected.');
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Source approval did not save. Your draft is preserved.'); }
  }
}
