export type IntelligencePlatform = 'instagram' | 'youtube' | 'x' | 'web';
export type IntelligenceStatus = 'received' | 'organized' | 'archived';
export type IntelligenceSourceKind = 'manual' | 'share';

export interface IntelligenceCapture {
  schemaVersion: 1;
  id: string;
  sourceUrl: string;
  canonicalUrl: string;
  dedupeKey: string;
  platform: IntelligencePlatform;
  sourceKind: IntelligenceSourceKind;
  title: string;
  sharedText: string;
  note: string;
  projectHint: string;
  status: IntelligenceStatus;
  duplicateOf: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
}

export interface IntelligenceCaptureInput {
  sourceUrl: string;
  title: string;
  sharedText: string;
  note: string;
  projectHint: string;
  sourceKind: IntelligenceSourceKind;
}

export const INTELLIGENCE_SHARE_DRAFT_KEY = 'pti.intelligence.share-draft.v1';

export interface IntelligenceShareDraft {
  title: string;
  text: string;
  url: string;
  receivedAt: number;
}

export function safeIntelligenceUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  if (raw.length > 2048) throw new Error('Keep the source link under 2,048 characters.');
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error();
    return parsed.href;
  } catch {
    throw new Error('Enter a valid HTTPS source link.');
  }
}

export function canonicalIntelligenceUrl(value: string): string {
  if (!value) return '';
  const parsed = new URL(value);
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (/^utm_/i.test(key) || ['fbclid', 'igshid', 'si', 'feature', 'ref', 'ref_src'].includes(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/$/, '');
  return parsed.href;
}

export function intelligencePlatform(url: string): IntelligencePlatform {
  if (!url) return 'web';
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
  if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'x';
  return 'web';
}

export function intelligenceSourceLabel(url: string): string {
  if (!url) return 'Shared note';
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'Source link'; }
}

export function extractSharedUrl(text: string): string {
  const match = text.match(/https:\/\/[^\s<>"']+/i);
  if (!match) return '';
  try { return safeIntelligenceUrl(match[0].replace(/[),.!?]+$/, '')); }
  catch { return ''; }
}
