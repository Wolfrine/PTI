import { ATLAS_SECTORS, ATLAS_SUBJECTS } from './atlas.catalog';
import { ATLAS_PROGRESS_LABELS, ATLAS_REVIEW_LABELS, atlasSafeId, atlasSafeSourceUrl, emptyAtlasSnapshot } from './atlas.models';

describe('Civilization Atlas public catalog and presentation contract', () => {
  it('is a bounded connected seed with unique sectors and subjects', () => {
    expect(ATLAS_SECTORS.length).toBe(12);
    expect(ATLAS_SUBJECTS.length).toBe(36);
    expect(new Set(ATLAS_SECTORS.map(s => s.id)).size).toBe(12);
    expect(new Set(ATLAS_SUBJECTS.map(s => s.id)).size).toBe(36);
    for (const sector of ATLAS_SECTORS) {
      expect(sector.subjectIds.length).toBeGreaterThan(0);
      expect(sector.subjectIds.every(id => ATLAS_SUBJECTS.some(s => s.id === id && s.sectorId === sector.id))).toBeTrue();
    }
    for (const subject of ATLAS_SUBJECTS) {
      expect(ATLAS_SECTORS.some(s => s.id === subject.sectorId)).toBeTrue();
      expect(subject.relatedIds.every(id => ATLAS_SUBJECTS.some(s => s.id === id))).toBeTrue();
      expect(subject.relatedIds).not.toContain(subject.id);
      expect(atlasSafeId(subject.id)).toBeTrue();
    }
  });
  it('distinguishes sourced seed summaries from unmapped outlines', () => {
    for (const subject of ATLAS_SUBJECTS) {
      if (subject.coverage === 'seed') {
        expect(subject.known.length).toBeGreaterThan(0);
        expect(subject.sources.length).toBeGreaterThan(0);
      } else { expect(subject.known).toEqual([]); expect(subject.sources).toEqual([]); }
      for (const source of subject.sources) expect(atlasSafeSourceUrl(source.url)).not.toBeNull();
    }
  });
  it('never equates evidence acceptance with verification or mastery', () => {
    expect(ATLAS_REVIEW_LABELS.accepted).toBe('Linked');
    expect(ATLAS_PROGRESS_LABELS.unknown).toBe('Unassessed');
    expect(Object.values(ATLAS_PROGRESS_LABELS).join(' ')).not.toMatch(/mastered|verified/i);
  });
  it('allows ordinary HTTPS references but not executable or credential-bearing URLs', () => {
    expect(atlasSafeSourceUrl('https://example.org/source?q=1')).toBe('https://example.org/source?q=1');
    for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'http://example.org', 'https://user:password@example.org/', 'users/synthetic/trackerData/workspace/evidence/a']) expect(atlasSafeSourceUrl(value)).toBeNull();
  });
  it('does not permit document traversal through IDs', () => {
    for (const id of ['', '../progress', 'subject/id', 'x'.repeat(129), 'with space']) expect(atlasSafeId(id)).toBeFalse();
    expect(atlasSafeId('owner_example-1')).toBeTrue();
  });
  it('starts unassessed, without inferred progress or retained account data', () => {
    const a = emptyAtlasSnapshot(), b = emptyAtlasSnapshot(); a.progress.push({} as never);
    expect(b.progress).toEqual([]); expect(b.evidence).toEqual([]); expect(b.loadedAt).toBeNull();
    expect(Object.values(b.hasMore)).toEqual([false, false, false, false, false, false]);
  });
});
