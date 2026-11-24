import { AsyncPipe, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { map } from 'rxjs';
import { GtopHostReading, GtopHostService } from '../../services/gtop-host.service';

const presentation: Record<Exclude<GtopHostReading, 'hidden'>, { label: string; detail: string; tone: string }> = {
  loading: { label: 'Checking…', detail: 'Waiting for the latest PC report.', tone: 'neutral' },
  available: { label: 'Available', detail: 'Ready for conversations and question papers.', tone: 'ready' },
  working: { label: 'Working', detail: 'GT Papers is processing a request.', tone: 'ready' },
  offline: { label: 'Offline', detail: 'The GT Papers worker is stopped. Start it on your PC.', tone: 'warning' },
  stale: { label: 'Status out of date', detail: 'Waiting for a fresh report from your PC.', tone: 'warning' },
  unavailable: { label: 'Status unavailable', detail: 'The latest PC report could not confirm the worker is ready.', tone: 'warning' },
};

@Component({
  selector: 'app-new-gtop-host', standalone: true, imports: [AsyncPipe, NgIf, MatIconModule],
  templateUrl: './new-gtop-host.component.html', styleUrl: './new-gtop-host.component.scss',
})
export class NewGtopHostComponent {
  readonly reading = inject(GtopHostService).watch().pipe(
    map(reading => reading === 'hidden' ? null : presentation[reading]),
  );
}
