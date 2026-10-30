import { computed, signal } from '@angular/core';
import { ATLAS_SECTORS, ATLAS_SUBJECTS } from '../../services/atlas.catalog';
import { AtlasFieldComponent } from './atlas-field.component';
import type { NewAtlasComponent } from './new-atlas.component';

describe('Civilization Atlas soft radial index', () => {
  const selected = signal('computing');
  const context = {
    sectors: ATLAS_SECTORS,
    subjects: ATLAS_SUBJECTS,
    fieldSectorId: selected,
    fieldSector: computed(() => ATLAS_SECTORS.find(sector => sector.id === selected())!),
  } as unknown as NewAtlasComponent;

  it('presents twelve equal sector arcs and the real 36 subject coverage marks', () => {
    const component = new AtlasFieldComponent();
    component.context = context;
    component.bounds.set({ width: 1300, height: 440 });
    const scene = component.scene();
    expect(scene.fields.length).toBe(12);
    expect(scene.fields.reduce((sum, field) => sum + field.dots.length, 0)).toBe(36);
    expect(scene.fields.flatMap(field => field.subjects.map(subject => subject.id)).sort())
      .toEqual(ATLAS_SUBJECTS.map(subject => subject.id).sort());
    expect(scene.fields.flatMap(field => field.dots.filter(dot => dot.coverage === 'seed')).length)
      .toBe(ATLAS_SUBJECTS.filter(subject => subject.coverage === 'seed').length);
  });

  it('keeps every callout and the focal lens inside the compact desktop canvas', () => {
    const component = new AtlasFieldComponent();
    component.context = context;
    for (const bounds of [{ width: 1300, height: 440 }, { width: 1000, height: 410 }]) {
      component.bounds.set(bounds);
      const scene = component.scene();
      for (const field of scene.fields) {
        expect(field.labelX).toBeGreaterThanOrEqual(0);
        expect(field.labelX + field.labelWidth).toBeLessThanOrEqual(scene.width);
        expect(field.labelY).toBeGreaterThanOrEqual(0);
        expect(field.labelY + field.labelHeight).toBeLessThanOrEqual(scene.height);
      }
      expect(scene.cy - scene.centerSize / 2).toBeGreaterThan(0);
      expect(scene.cy + scene.centerSize / 2).toBeLessThan(scene.height);
    }
  });

  it('changes only the preview focus without claiming any personal work or coverage', () => {
    const component = new AtlasFieldComponent();
    component.context = context;
    const target = ATLAS_SECTORS.find(sector => sector.id === 'space')!;
    component.focusSector(target);
    expect(context.fieldSector().id).toBe('space');
    expect(context.sectors.length).toBe(12);
    selected.set('computing');
  });
});
