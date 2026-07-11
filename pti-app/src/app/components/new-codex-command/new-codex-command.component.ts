import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  OperatingOutcome,
  OperatingSignal,
  OperatingSystemData,
  deriveExecutiveSummary,
  priorityScore,
} from '../../operating-system/operating-system.models';
import { OperatingSystemService } from '../../operating-system/operating-system.service';

@Component({
  selector: 'app-new-codex-command',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './new-codex-command.component.html',
})
export class NewCodexCommandComponent {
  readonly previewMode: boolean;
  readonly data$: Observable<OperatingSystemData>;
  selectedSignal?: OperatingSignal;
  activeSection = 'today';

  constructor(
    private readonly operatingSystem: OperatingSystemService,
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.previewMode = this.route.snapshot.data['preview'] === true;
    this.data$ = this.operatingSystem.watch(this.previewMode);
  }

  summary(data: OperatingSystemData) {
    return deriveExecutiveSummary(data);
  }

  rankedOutcomes(data: OperatingSystemData): OperatingOutcome[] {
    return [...data.outcomes].sort((left, right) => priorityScore(right) - priorityScore(left));
  }

  materialChanges(data: OperatingSystemData): OperatingSignal[] {
    return data.signals
      .filter((signal) => signal.materiality === 'material')
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
      .slice(0, 4);
  }

  projectName(data: OperatingSystemData, projectId: string): string {
    return data.projects.find((project) => project.id === projectId)?.name ?? projectId;
  }

  outcomeSignals(data: OperatingSystemData, outcome: OperatingOutcome): OperatingSignal[] {
    return data.signals.filter((signal) => signal.outcomeIds.includes(outcome.id));
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  inspect(signal: OperatingSignal): void {
    this.selectedSignal = signal;
  }

  closeEvidence(): void {
    this.selectedSignal = undefined;
  }

  setSection(section: string): void {
    this.activeSection = section;
    const target = document.getElementById(section);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  logout(): void {
    this.authService.signOut();
  }
}
