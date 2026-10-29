import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { AtlasRun } from '../../services/atlas.models';
import type { NewAtlasComponent } from './new-atlas.component';

@Component({ selector: 'app-atlas-capture-receipts', standalone: true, imports: [CommonModule], templateUrl: './atlas-capture-receipts.component.html', styleUrl: './atlas-capture-receipts.component.scss' })
export class AtlasCaptureReceiptsComponent {
  @Input({ required: true }) context!: NewAtlasComponent;

  get runs(): AtlasRun[] {
    const query = this.context.query().trim().toLocaleLowerCase();
    return this.context.service.snapshot().runs.filter(run => !query || `${run.id} ${this.text(run, 'runId')} ${this.scopeText(run, 'system')} ${this.scopeText(run, 'locator')}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => this.timestamp(b) - this.timestamp(a));
  }
  text(run: AtlasRun, key: string): string | null { return typeof run[key] === 'string' ? run[key] as string : null; }
  scopeText(run: AtlasRun, key: string): string | null {
    const scope = run['sourceScope'];
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null;
    const value = (scope as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }
  count(run: AtlasRun, key: string): number | null {
    const value = run[key];
    if (Array.isArray(value)) return value.length;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  status(run: AtlasRun): string {
    const value = this.text(run, 'status');
    return value === 'staged' ? 'Staged for review' : value === 'needs-review' ? 'Import needs review' : value || 'Status not recorded';
  }
  private timestamp(run: AtlasRun): number {
    const value = new Date(this.text(run, 'capturedAt') ?? '').getTime();
    return Number.isFinite(value) ? value : 0;
  }
}
