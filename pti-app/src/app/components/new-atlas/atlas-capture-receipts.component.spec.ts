import { AtlasRun } from '../../services/atlas.models';
import { AtlasCaptureReceiptsComponent } from './atlas-capture-receipts.component';

describe('Atlas capture receipts', () => {
  const component = new AtlasCaptureReceiptsComponent();
  it('does not invent missing import counts', () => {
    const missing: AtlasRun = { id: 'synthetic' };
    expect(component.count(missing, 'inputCount')).toBeNull();
    expect(component.count(missing, 'addedIds')).toBeNull();
    expect(component.count({ ...missing, addedIds: [] }, 'addedIds')).toBe(0);
    expect(component.count({ ...missing, inputCount: -1 }, 'inputCount')).toBeNull();
  });
  it('does not promote staged evidence to reviewed or verified', () => {
    expect(component.status({ id: 'synthetic', status: 'staged' })).toBe('Staged for review');
    expect(component.status({ id: 'synthetic', status: 'needs-review' })).toBe('Import needs review');
    expect(component.status({ id: 'synthetic' })).toBe('Status not recorded');
  });
  it('preserves unknown coverage and exact timestamp provenance', () => {
    const missing: AtlasRun = { id: 'synthetic' };
    expect(component.scopeText(missing, 'completeness')).toBeNull();
    expect(component.text(missing, 'capturedAt')).toBeNull();
    const timestamp = '2026-10-29T00:00:00.123456789Z';
    expect(component.text({ ...missing, capturedAt: timestamp }, 'capturedAt')).toBe(timestamp);
  });
});
