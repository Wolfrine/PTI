import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  OperatingDecision,
  OperatingOutcome,
  OperatingRelease,
  OperatingSignal,
  OperatingSystemData,
  OperatingWorkPacket,
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
  actionMessage = '';
  actionBusy = false;

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

  decisionQueue(data: OperatingSystemData): OperatingDecision[] {
    return data.decisions.filter((decision) => !['decided', 'verified', 'rejected'].includes(decision.state));
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

  async decide(decision: OperatingDecision, optionId: string): Promise<void> {
    if (this.previewMode || this.actionBusy) return;
    const rationale = window.prompt('Record the rationale for this decision:');
    if (!rationale) return;
    await this.runAction(
      () => this.operatingSystem.recordDecision(decision.id, optionId, rationale),
      'Decision recorded with an audit event.',
    );
  }

  nextPacketState(packet: OperatingWorkPacket): OperatingWorkPacket['state'] | undefined {
    const nextStates: Partial<Record<OperatingWorkPacket['state'], OperatingWorkPacket['state']>> = {
      draft: 'sealed', sealed: 'assigned', assigned: 'running', running: 'submitted',
      submitted: 'evaluated', evaluated: 'selected', selected: 'release_ready',
    };
    return nextStates[packet.state];
  }

  async advancePacket(packet: OperatingWorkPacket): Promise<void> {
    if (this.previewMode || this.actionBusy) return;
    const nextState = this.nextPacketState(packet);
    if (!nextState) return;
    const reason = window.prompt(`Reason for ${packet.state} -> ${nextState}:`);
    if (!reason) return;
    await this.runAction(
      () => this.operatingSystem.transitionWorkPacket(packet.id, nextState, reason),
      `Packet moved to ${nextState.replace('_', ' ')}.`,
    );
  }

  async requestProductionApproval(release: OperatingRelease): Promise<void> {
    if (this.previewMode || this.actionBusy || release.state !== 'previewed') return;
    const reason = window.prompt('Why is this preview ready for production approval?');
    if (!reason) return;
    await this.runAction(
      () => this.operatingSystem.transitionRelease(release.id, 'ready_for_production_approval', reason),
      'Release moved to production approval. Production is unchanged.',
    );
  }

  private async runAction(operation: () => Promise<void>, successMessage: string): Promise<void> {
    this.actionBusy = true;
    this.actionMessage = '';
    try {
      await operation();
      this.actionMessage = successMessage;
    } catch (error) {
      this.actionMessage = error instanceof Error ? error.message : 'The operation failed.';
    } finally {
      this.actionBusy = false;
    }
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
