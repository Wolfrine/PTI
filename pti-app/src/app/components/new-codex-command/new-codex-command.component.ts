import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import {
    CodexActionKind,
    CodexProjectActionItem,
    CodexProjectSnapshot,
    CodexCommandNotesService,
} from '../../services/codex-command-notes.service';

type Tone = 'ok' | 'warn' | 'critical' | 'muted';
type ProjectStatus = 'Live' | 'Active' | 'Support' | 'Control' | 'Archived' | 'Unknown';

interface KpiTile {
    label: string;
    value: string;
    detail: string;
    tone: Tone;
}

interface WorkstreamCard {
    lane: string;
    focus: string;
    standing: string;
    nextAction: string;
    checkpoint: string;
    tone: Tone;
}

interface PortfolioProject {
    id?: string;
    name: string;
    group: string;
    status: ProjectStatus;
    branch: string;
    workingTree: string;
    localPath: string;
    repo: string;
    deployment: string;
    standing: string;
    nextAction: string;
    tone: Tone;
}

interface ProjectInteraction {
    pendingText: string;
    kind: CodexActionKind;
    isSaving: boolean;
    items: CodexProjectActionItem[];
    error?: string;
}

interface ProgressItem {
    heading: string;
    progress: string;
    next: string;
    tone: Tone;
}

interface CadenceStep {
    when: string;
    action: string;
}

interface PortfolioSlice {
    label: string;
    count: number;
    tone: Tone;
}

interface RecentQueueItem extends CodexProjectActionItem {
    projectId: string;
}

interface ExecutiveSummaryItem {
    label: string;
    value: string;
    detail: string;
    tone: Tone;
}

@Component({
    selector: 'app-new-codex-command',
    standalone: true,
    imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatToolbarModule],
    templateUrl: './new-codex-command.component.html',
    styleUrls: ['./new-codex-command.component.scss'],
})
export class NewCodexCommandComponent implements OnInit {
    readonly allowedEmail = 'schttewary@gmail.com';
    user: any;
    isAllowed = false;

    readonly kpiTiles: KpiTile[] = [
        {
            label: 'Operating portfolio',
            value: '11 GitHub roots',
            detail: 'PTI, GT, Central, independent products, creative writing, and other labs',
            tone: 'ok',
        },
        {
            label: 'Currently in motion',
            value: '5 dirty roots',
            detail: 'PTI refresh publish plus Central, gtop-app, growth-tutorials, GT-shared-services',
            tone: 'warn',
        },
        {
            label: 'PM pilot',
            value: '4 reports',
            detail: 'PTI, Central/Aesthetic India, GTOP, NovaSaga',
            tone: 'ok',
        },
        {
            label: 'Control rule',
            value: 'Repo first',
            detail: 'Every implementation starts with owning repo, branch, and deploy lane',
            tone: 'ok',
        },
    ];

    readonly workstreams: WorkstreamCard[] = [
        {
            lane: 'PTI command plane',
            focus: 'CEO COE registry, dashboard, instructions, and Codex refresh workflow.',
            standing: 'PM pilot now adds upward project reports and downward task allocation.',
            nextAction: 'Promote the PM loop, keep PTI as allocation surface, and fix the token-gated MCP route.',
            checkpoint: 'Live',
            tone: 'ok',
        },
        {
            lane: 'Growth Tutorials build lane',
            focus: 'gtop-app, growth-tutorials, and GT-shared-services.',
            standing: 'GTOP PM now reads this as product-memory acceleration plus blocked execution, not simple code inactivity.',
            nextAction: 'Repair GTOP builder checkout, resume Live Quiz first, and run question-bank truth work in parallel.',
            checkpoint: 'Blocked',
            tone: 'critical',
        },
        {
            lane: 'Central / Aesthetic India',
            focus: 'Central repo plus Aesthetic India active workspace.',
            standing: 'PM reports active yellow state; replacement automation needs proof on the next run.',
            nextAction: 'Confirm one approved backlog item publishes through the replacement supervisor.',
            checkpoint: 'Control',
            tone: 'warn',
        },
        {
            lane: 'Creative writing / NovaSaga',
            focus: 'NovaSaga at F:\\Workspace\\NovaSaga.',
            standing: 'PM reports foundation refresh complete but Book 1 decisions unresolved.',
            nextAction: 'Run protagonist and Book 1 spine definition before broad archive curation continues.',
            checkpoint: 'Active',
            tone: 'warn',
        },
        {
            lane: 'Independent products',
            focus: 'Novel-Encyclopedia, Orynth, StoryForge, luminar_robotics.',
            standing: 'Mostly clean, with several support-stage products and detected deploy routes for Orynth/Novel.',
            nextAction: 'Treat as project-specific streams; revive only with repo-level intent.',
            checkpoint: 'Support',
            tone: 'muted',
        },
    ];

    readonly portfolioProjects: PortfolioProject[] = [
        {
            name: 'PTI',
            id: 'pti',
            group: 'Command plane',
            status: 'Live',
            branch: 'main',
            workingTree: 'dirty during CEO refresh publish',
            localPath: 'F:\\Workspace\\Programs\\Independent-Products\\PTI',
            repo: 'https://github.com/Wolfrine/PTI',
            deployment: 'pti-app-2ab59.web.app via GitHub Actions + Firebase',
            standing: 'CEO COE is live; PM pilot now adds upward project reports and downward task allocation.',
            nextAction: 'Promote PM pilot, keep PTI as allocation surface, and fix token-gated MCP route.',
            tone: 'ok',
        },
        {
            name: 'gtop-app',
            id: 'gtop-app',
            group: 'Growth Tutorials',
            status: 'Active',
            branch: 'main',
            workingTree: 'dirty',
            localPath: 'F:\\Workspace\\Programs\\Growth-Tutorials\\gtop-app',
            repo: 'https://github.com/Wolfrine/gtop-app',
            deployment: 'gtop-app.web.app and dev-gtop-app.web.app',
            standing: 'PM verdict: blocked-for-execution. GTOP is in product-memory and execution-unblock mode: practice intelligence is clearer, but builder automation cannot pass the git index-lock branch-switch step.',
            nextAction: 'Repair the GTOP builder checkout, resume Live Quiz control room first, and run question-bank truth snapshot in parallel.',
            tone: 'critical',
        },
        {
            name: 'growth-tutorials',
            id: 'growth-tutorials',
            group: 'Growth Tutorials',
            status: 'Active',
            branch: 'dev-hub',
            workingTree: 'dirty',
            localPath: 'F:\\Workspace\\Programs\\Growth-Tutorials\\growth-tutorials',
            repo: 'https://github.com/Wolfrine/growth-tutorials',
            deployment: 'growth-tutorials.web.app, hub-growthtutorials.web.app, GTAI chat targets',
            standing: 'Hub and platform repo with active local changes.',
            nextAction: 'Confirm scope and branch before touching hub or MCP behavior.',
            tone: 'warn',
        },
        {
            name: 'GT-shared-services',
            id: 'gt-shared-services',
            group: 'Growth Tutorials',
            status: 'Active',
            branch: 'main',
            workingTree: 'dirty',
            localPath: 'F:\\Workspace\\Programs\\Growth-Tutorials\\GT-shared-services',
            repo: 'https://github.com/Wolfrine/GT-shared-services',
            deployment: 'asia-south1 shared service API and gt-shared-service.web.app',
            standing: 'Shared service layer; changes can affect multiple GT surfaces.',
            nextAction: 'Review the one dirty change before service work.',
            tone: 'warn',
        },
        {
            name: 'Central / Aesthetic India',
            id: 'central-aesthetic-india',
            group: 'Central workspace',
            status: 'Control',
            branch: 'main',
            workingTree: 'dirty',
            localPath: 'F:\\Central',
            repo: 'https://github.com/Wolfrine/Central',
            deployment: 'not detected',
            standing: 'PM verdict: active but yellow. Replacement full-access automation needs observed proof before it is treated as stable.',
            nextAction: 'Observe or trigger replacement supervisor, confirm one approved backlog item publishes, then review dirty source/docs/assets.',
            tone: 'warn',
        },
        {
            name: 'ops-forge (archived)',
            id: 'ops-forge',
            group: 'Archived',
            status: 'Archived',
            branch: 'main',
            workingTree: 'archived clean',
            localPath: 'F:\\Workspace\\Archive\\legacy\\Codex-Operations\\ops-forge',
            repo: 'https://github.com/Wolfrine/ops-forge',
            deployment: 'archived',
            standing: 'Legacy operations experiment. PTI is now the CEO COE and operating source of truth.',
            nextAction: 'Do not use for current process, dashboard, MCP, or refresh work unless explicitly revived.',
            tone: 'muted',
        },
        {
            name: 'Orynth',
            id: 'orynth',
            group: 'Independent product',
            status: 'Active',
            branch: 'main',
            workingTree: 'clean',
            localPath: 'F:\\Workspace\\Programs\\Independent-Products\\Orynth',
            repo: 'https://github.com/Wolfrine/Orynth',
            deployment: 'orynth-io.web.app and dev-orynth-io.web.app',
            standing: 'Study tracker product with detected Firebase routes.',
            nextAction: 'Keep product work repo-specific.',
            tone: 'ok',
        },
        {
            name: 'Novel-Encyclopedia',
            id: 'novel-encyclopedia',
            group: 'Independent product',
            status: 'Active',
            branch: 'main',
            workingTree: 'clean',
            localPath: 'F:\\Workspace\\Programs\\Independent-Products\\Novel-Encyclopedia',
            repo: 'https://github.com/Wolfrine/Novel-Encyclopedia',
            deployment: 'luminary-universe Firebase project from workflow',
            standing: 'Independent knowledge/product line.',
            nextAction: 'Revive only with explicit product scope and deploy target.',
            tone: 'ok',
        },
        {
            name: 'NovaSaga',
            id: 'novasaga',
            group: 'Creative writing',
            status: 'Active',
            branch: 'main',
            workingTree: 'clean',
            localPath: 'F:\\Workspace\\NovaSaga',
            repo: 'https://github.com/Wolfrine/NovaSaga',
            deployment: 'not detected',
            standing: 'PM verdict: foundation refresh complete, but Book 1 protagonist and plot-spine decisions remain open.',
            nextAction: 'Run a focused protagonist-definition and Book 1 spine session before broad archive curation continues.',
            tone: 'warn',
        },
        {
            name: 'ChatGPT',
            id: 'chatgpt',
            group: 'Other',
            status: 'Unknown',
            branch: 'main',
            workingTree: 'clean',
            localPath: 'F:\\Workspace\\Programs\\Other\\ChatGPT',
            repo: 'https://github.com/Wolfrine/ChatGPT',
            deployment: 'not detected',
            standing: 'Conversation/export utility repo; operational role needs confirmation.',
            nextAction: 'Classify before treating as active product work.',
            tone: 'muted',
        },
        {
            name: 'StoryForge',
            id: 'storyforge',
            group: 'Other',
            status: 'Support',
            branch: 'main',
            workingTree: 'clean',
            localPath: 'F:\\Workspace\\Programs\\Other\\StoryForge',
            repo: 'https://github.com/Wolfrine/StoryForge',
            deployment: 'not detected',
            standing: 'Creative production/product draft stream.',
            nextAction: 'Use only with a clear creative workflow objective.',
            tone: 'muted',
        },
        {
            name: 'luminar_robotics',
            id: 'luminar-robotics',
            group: 'Other',
            status: 'Support',
            branch: 'main',
            workingTree: 'clean',
            localPath: 'F:\\Workspace\\Programs\\Other\\luminar_robotics',
            repo: 'https://github.com/Wolfrine/luminar_robotics',
            deployment: 'not detected',
            standing: 'Robotics and automation R&D root.',
            nextAction: 'Keep experiments isolated from production lanes.',
            tone: 'muted',
        },
        {
            name: 'GrowthWebsite',
            id: 'growthwebsite',
            group: 'Archived',
            status: 'Archived',
            branch: 'main',
            workingTree: 'remote archived',
            localPath: 'F:\\Workspace\\Archive\\legacy\\GrowthWebsite',
            repo: 'https://github.com/Wolfrine/GrowthWebsite',
            deployment: 'archived',
            standing: 'Historical reference only.',
            nextAction: 'Do not use as active execution root.',
            tone: 'critical',
        },
    ];

    readonly progressItems: ProgressItem[] = [
        {
            heading: 'What projects are being worked on',
            progress: 'PM reports exist for PTI, Central/Aesthetic India, GTOP, and NovaSaga. GTOP has meaningful product-memory progress, but implementation is blocked before app edits.',
            next: 'Use PM handoffs before direct repo inspection. For GTOP, fix the builder lane, resume Live Quiz, and assign question-bank truth work.',
            tone: 'warn',
        },
        {
            heading: 'How work should happen',
            progress: 'The rule is PM-up and CEO-down: PM reports summarize repo evidence upward; CEO task packets flow down into each repo PM inbox.',
            next: 'PM agents write only inside `.pm`; implementation agents work only from approved task packets.',
            tone: 'ok',
        },
        {
            heading: 'Project-wise progress',
            progress: 'Live products have deploy routes; support products are clean but need an explicit outcome before being revived.',
            next: 'Maintain this dashboard as the executive map after every major project state change.',
            tone: 'ok',
        },
    ];

    readonly cadence: CadenceStep[] = [
        { when: 'Start', action: 'Pick the project, repo, branch, and exact deployment lane.' },
        { when: 'Before edit', action: 'Check dirty state and protect unrelated user changes.' },
        { when: 'During work', action: 'Keep scope inside the owning repo and update project standing if it changes.' },
        { when: 'Release', action: 'Build, commit, push, then verify the published route or CI result.' },
    ];

    readonly operatingNote =
        'Mobile can drive decisions and continue visible projects; new Codex project creation still needs desktop setup.';
    readonly projectInteractions: Record<string, ProjectInteraction> = {};
    private actionItemsInitialized = false;

    get activeProjectCount(): number {
        return this.portfolioProjects.filter((project) => project.status === 'Active' || project.status === 'Live').length;
    }

    get controlProjectCount(): number {
        return this.portfolioProjects.filter((project) => project.status === 'Control').length;
    }

    get supportProjectCount(): number {
        return this.portfolioProjects.filter((project) => project.status === 'Support' || project.status === 'Unknown').length;
    }

    get riskRoots(): PortfolioProject[] {
        return this.portfolioProjects
            .filter((project) => project.tone === 'warn' || project.tone === 'critical');
    }

    get topRisks(): PortfolioProject[] {
        return this.riskRoots.slice(0, 3);
    }

    get highestRisk(): PortfolioProject | undefined {
        return this.topRisks[0];
    }

    get dirtyRootCount(): number {
        return this.portfolioProjects.filter((project) => project.workingTree.toLowerCase().includes('dirty')).length;
    }

    get publishedSurfaceCount(): number {
        return this.portfolioProjects.filter((project) => !['not detected', 'archived'].includes(project.deployment)).length;
    }

    get executiveSummary(): ExecutiveSummaryItem[] {
        return [
            {
                label: 'Active blockers',
                value: String(this.riskRoots.length),
                detail: 'Dirty, control-sensitive, or archived-risk roots',
                tone: 'warn',
            },
            {
                label: 'Dirty roots',
                value: String(this.dirtyRootCount),
                detail: 'Require branch and scope review',
                tone: 'warn',
            },
            {
                label: 'PM reports',
                value: '4',
                detail: 'Pilot handoffs received',
                tone: 'ok',
            },
            {
                label: 'Active/live',
                value: String(this.activeProjectCount),
                detail: 'Current execution portfolio',
                tone: 'ok',
            },
        ];
    }

    get rankedProjects(): PortfolioProject[] {
        const toneRank: Record<Tone, number> = { critical: 0, warn: 1, ok: 2, muted: 3 };
        const statusRank: Record<ProjectStatus, number> = {
            Live: 0,
            Active: 1,
            Control: 2,
            Support: 3,
            Unknown: 4,
            Archived: 5,
        };

        return [...this.portfolioProjects].sort((left, right) => {
            if (left.status === 'Archived' && right.status !== 'Archived') {
                return 1;
            }
            if (right.status === 'Archived' && left.status !== 'Archived') {
                return -1;
            }
            const toneDelta = toneRank[left.tone] - toneRank[right.tone];
            return toneDelta || statusRank[left.status] - statusRank[right.status] || left.name.localeCompare(right.name);
        });
    }

    get portfolioDistribution(): PortfolioSlice[] {
        return [
            { label: 'Live or active', count: this.activeProjectCount, tone: 'ok' },
            { label: 'Needs control', count: this.controlProjectCount, tone: 'warn' },
            { label: 'Support or unknown', count: this.supportProjectCount, tone: 'muted' },
            {
                label: 'Archived',
                count: this.portfolioProjects.filter((project) => project.status === 'Archived').length,
                tone: 'critical',
            },
        ];
    }

    get recentQueue(): RecentQueueItem[] {
        return Object.entries(this.projectInteractions)
            .flatMap(([projectId, interaction]) => interaction.items.map((item) => ({ ...item, projectId })))
            .slice(0, 6);
    }

    constructor(
        private authService: AuthService,
        private router: Router,
        private projectNotesService: CodexCommandNotesService
    ) {}

    ngOnInit(): void {
        this.authService.user$.subscribe((user) => {
            this.user = user;
            this.isAllowed = user?.email === this.allowedEmail;
            if (this.isAllowed && !this.actionItemsInitialized) {
                this.initializeProjectActionItems();
            }
        });
    }

    logout(): void {
        this.authService.signOut();
    }

    goHome(): void {
        this.router.navigate(['/home']);
    }

    goToDashboard(): void {
        this.router.navigate(['/new-dashboard']);
    }

    openProject(project: PortfolioProject): void {
        this.router.navigate(['/codex-command/projects', this.projectId(project)]);
    }

    projectId(project: PortfolioProject): string {
        return this.getProjectId(project);
    }

    async saveProjectItem(project: PortfolioProject): Promise<void> {
        const snapshot = this.toProjectSnapshot(project);
        const interaction = this.projectInteractions[snapshot.id];
        if (!interaction || interaction.isSaving || !interaction.pendingText.trim()) {
            return;
        }
        interaction.isSaving = true;
        interaction.error = undefined;

        try {
            await this.projectNotesService.addActionItem(snapshot, interaction.kind, interaction.pendingText);
            interaction.pendingText = '';
            interaction.kind = 'action';
        } catch (error) {
            interaction.error = error instanceof Error ? error.message : 'Could not save this item.';
        } finally {
            interaction.isSaving = false;
        }
    }

    async completeItem(project: PortfolioProject, item: CodexProjectActionItem): Promise<void> {
        if (!item.id) {
            return;
        }
        await this.projectNotesService.markCompleted(this.getProjectId(project), item.id);
    }

    private getProjectId(project: PortfolioProject): string {
        const raw = project.id?.trim() || project.name.toLowerCase();
        return raw
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase();
    }

    private initializeProjectActionItems(): void {
        this.actionItemsInitialized = true;
        this.portfolioProjects.forEach((project) => {
            const snapshot = this.toProjectSnapshot(project);
            this.projectInteractions[snapshot.id] = {
                pendingText: '',
                kind: 'action',
                isSaving: false,
                items: [],
            };
            this.projectNotesService.saveProjectSnapshot(snapshot).catch((error) => {
                this.projectInteractions[snapshot.id].error =
                    error instanceof Error ? error.message : 'Could not sync project snapshot.';
            });
            this.projectNotesService.watchActionItems(snapshot.id).subscribe((items) => {
                this.projectInteractions[snapshot.id].items = items;
            });
        });
    }

    private toProjectSnapshot(project: PortfolioProject): CodexProjectSnapshot {
        return {
            id: this.getProjectId(project),
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
