import { atlasSourceDraftInput, AtlasSourceDraft } from './atlas-source-approval.component';

describe('Atlas bounded source approval', () => {
  const draft = (): AtlasSourceDraft => ({ sourceId: 'synthetic-source', system: 'github', locator: 'Synthetic repository', exact: '', prefixes: 'https://github.com/example/research/' });

  it('normalizes a bounded repository approval without collecting records', () => {
    const result = atlasSourceDraftInput(draft());
    expect(result.recordLocatorPrefixes).toEqual(['https://github.com/example/research/']);
    expect(result.recordLocators).toEqual([]);
    expect(result.enabled).toBeTrue();
  });

  it('rejects broad GitHub scope and an unsafe ID', () => {
    expect(() => atlasSourceDraftInput({ ...draft(), prefixes: 'https://github.com/example/' })).toThrowError();
    expect(() => atlasSourceDraftInput({ ...draft(), sourceId: '../source' })).toThrowError();
  });

  it('does not allow opting raw chat capture back in through a source grant', () => {
    expect(() => atlasSourceDraftInput({ ...draft(), prefixes: 'https://github.com/example/chatgpt_harness/' })).toThrowError();
    expect(() => atlasSourceDraftInput({ ...draft(), system: 'web-primary-source', prefixes: '', exact: 'https://chatgpt.com/c/synthetic' })).toThrowError();
  });

  it('requires exact Pages and Drive documents and refuses their prefixes', () => {
    expect(() => atlasSourceDraftInput({ ...draft(), system: 'chatgpt-pages', prefixes: 'https://chatgpt.com/space/' })).toThrowError();
    expect(() => atlasSourceDraftInput({ ...draft(), system: 'google-drive-document', prefixes: '', exact: 'https://drive.google.com/drive/folders/synthetic' })).toThrowError();
    const result = atlasSourceDraftInput({ ...draft(), system: 'chatgpt-pages', prefixes: '', exact: 'https://chatgpt.com/space/page_synthetic' });
    expect(result.recordLocators.length).toBe(1);
  });

  it('bounds the number of exact records and preserves HTTPS-only URLs', () => {
    const exact = Array.from({ length: 9 }, (_, i) => `https://example.org/source-${i}`).join('\n');
    expect(() => atlasSourceDraftInput({ ...draft(), system: 'web-primary-source', prefixes: '', exact })).toThrowError();
    expect(() => atlasSourceDraftInput({ ...draft(), system: 'web-primary-source', prefixes: '', exact: 'http://example.org/source' })).toThrowError();
  });

  it('allows a bounded self-report without treating it as an external verified source', () => {
    const result = atlasSourceDraftInput({ ...draft(), system: 'user-report', prefixes: '', exact: 'owner-report/synthetic-note' });
    expect(result.system).toBe('user-report');
    expect(result.recordLocators).toEqual(['owner-report/synthetic-note']);
  });
});
