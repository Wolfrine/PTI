import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  CodexActionKind,
  CodexActionStatus,
  CodexCommandNotesService,
  CodexProjectActionItem,
  CodexProjectSnapshot,
} from '../../services/codex-command-notes.service';
import { CODEX_PORTFOLIO_PROJECTS, CodexPortfolioProject, codexProjectId } from './codex-projects.data';

interface ProjectFormState {
  text: string;
  kind: CodexActionKind;
  status: CodexActionStatus;
  isSaving: boolean;
  error?: string;
}

@Component({
  selector: 'app-codex-project-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule],
  templateUrl: './codex-project-detail.component.html',
  styleUrls: ['./codex-project-detail.component.scss'],
})
export class CodexProjectDetailComponent implements OnInit, OnDestroy {
  readonly allowedEmail = 'schttewary@gmail.com';
  projectId = '';
  project?: CodexPortfolioProject;

  user: any;
  isAllowed = false;
  items: CodexProjectActionItem[] = [];
  editingItemId?: string;
  editText = '';
  editKind: CodexActionKind = 'action';
  editStatus: CodexActionStatus = 'open';

  form: ProjectFormState = {
    text: '',
    kind: 'action',
    status: 'open',
    isSaving: false,
  };

  private readonly subscriptions = new Subscription();
  private isWatchingProject = false;

  constructor(
    private readonly authService: AuthService,
    private readonly notesService: CodexCommandNotesService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.projectId = this.route.snapshot.paramMap.get('projectId') || '';
    this.project = CODEX_PORTFOLIO_PROJECTS.find((item) => codexProjectId(item) === this.projectId);

    this.subscriptions.add(
      this.authService.user$.subscribe((user) => {
        this.user = user;
        this.isAllowed = user?.email === this.allowedEmail;
        if (this.isAllowed && this.project) {
          this.syncProject();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get actionItems(): CodexProjectActionItem[] {
    return this.items.filter((item) => item.kind === 'action');
  }

  get feedbackItems(): CodexProjectActionItem[] {
    return this.items.filter((item) => item.kind === 'feedback');
  }

  get nextPlanItems(): CodexProjectActionItem[] {
    return this.items.filter((item) => item.kind === 'next_plan');
  }

  get activityItems(): CodexProjectActionItem[] {
    return this.items.filter((item) => item.kind === 'activity');
  }

  goBack(): void {
    this.router.navigate(['/codex-command']);
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  logout(): void {
    this.authService.signOut();
  }

  async addItem(): Promise<void> {
    if (!this.project || this.form.isSaving || !this.form.text.trim()) {
      return;
    }

    this.form.isSaving = true;
    this.form.error = undefined;

    try {
      await this.notesService.addActionItem(
        this.toProjectSnapshot(this.project),
        this.form.kind,
        this.form.text,
        this.form.status,
      );
      this.form.text = '';
      this.form.kind = 'action';
      this.form.status = 'open';
    } catch (error) {
      this.form.error = error instanceof Error ? error.message : 'Could not add this item.';
    } finally {
      this.form.isSaving = false;
    }
  }

  beginEdit(item: CodexProjectActionItem): void {
    if (!item.id) {
      return;
    }

    this.editingItemId = item.id;
    this.editText = item.text;
    this.editKind = item.kind;
    this.editStatus = item.status;
  }

  cancelEdit(): void {
    this.editingItemId = undefined;
    this.editText = '';
    this.editKind = 'action';
    this.editStatus = 'open';
  }

  async updateItem(item: CodexProjectActionItem): Promise<void> {
    if (!item.id || !this.editText.trim()) {
      return;
    }

    await this.notesService.updateActionItem(this.projectId, item.id, {
      text: this.editText,
      kind: this.editKind,
      status: this.editStatus,
    });
    this.cancelEdit();
  }

  async completeItem(item: CodexProjectActionItem): Promise<void> {
    if (!item.id) {
      return;
    }
    await this.notesService.markCompleted(this.projectId, item.id);
  }

  private syncProject(): void {
    if (!this.project || this.isWatchingProject) {
      return;
    }

    this.isWatchingProject = true;
    const snapshot = this.toProjectSnapshot(this.project);
    this.notesService.saveProjectSnapshot(snapshot).catch((error) => {
      console.warn('Could not sync project snapshot.', error);
    });
    this.subscriptions.add(
      this.notesService.watchActionItems(snapshot.id, 40).subscribe((items) => {
        this.items = items;
      }),
    );
  }

  private toProjectSnapshot(project: CodexPortfolioProject): CodexProjectSnapshot {
    return {
      id: codexProjectId(project),
      name: project.name,
      group: project.group,
      status: project.status,
      branch: project.branch,
      workingTree: project.workingTree,
      localPath: project.localPath,
      repo: project.repo,
      deployment: project.deployment,
      standing: project.standing,
      nextAction: project.nextAction,
    };
  }
}
