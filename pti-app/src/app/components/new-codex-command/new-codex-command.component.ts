import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../services/auth.service';

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

@Component({
    selector: 'app-new-codex-command',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, MatToolbarModule],
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
            value: '13 local roots',
            detail: 'PTI, GT, Central, Ops, independent products, and other labs',
            tone: 'ok',
        },
        {
            label: 'Currently in motion',
            value: '4 dirty roots',
            detail: 'Central, gtop-app, growth-tutorials, GT-shared-services',
            tone: 'warn',
        },
        {
            label: 'Published surfaces',
            value: '6 detected',
            detail: 'PTI, GTOP, Growth Tutorials, shared services, ops-forge, Orynth',
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
            focus: 'Hosted executive dashboard and Codex operating visibility.',
            standing: 'Live route is the shared surface for any-device review.',
            nextAction: 'Keep PTI clean, publish through main, and verify Firebase after each dashboard change.',
            checkpoint: 'Live',
            tone: 'ok',
        },
        {
            lane: 'Growth Tutorials build lane',
            focus: 'gtop-app, growth-tutorials, and GT-shared-services.',
            standing: 'Active local work exists across all three roots; branch alignment matters before edits.',
            nextAction: 'Resolve or preserve dirty work before new implementation starts.',
            checkpoint: 'Active',
            tone: 'warn',
        },
        {
            lane: 'Central / Aesthetic India',
            focus: 'Central repo plus Aesthetic India active workspace.',
            standing: 'Aesthetic India is a workspace folder under Central, not a separate git root.',
            nextAction: 'Use Central as source of truth; do not assume a separate repo boundary.',
            checkpoint: 'Control',
            tone: 'warn',
        },
        {
            lane: 'Independent products',
            focus: 'NovaSaga, Novel-Encyclopedia, Orynth, StoryForge, luminar_robotics.',
            standing: 'Mostly clean, with several support-stage products and detected deploy routes for Orynth/Novel.',
            nextAction: 'Treat as project-specific streams; revive only with repo-level intent.',
            checkpoint: 'Support',
            tone: 'muted',
        },
    ];

    readonly portfolioProjects: PortfolioProject[] = [
        {
            name: 'PTI',
            group: 'Command plane',
            status: 'Live',
            branch: 'main',
            workingTree: 'clean before this dashboard revision',
            localPath: 'F:\\Workspace\\Programs\\Independent-Products\\PTI',
            repo: 'https://github.com/Wolfrine/PTI',
            deployment: 'pti-app-2ab59.web.app via GitHub Actions + Firebase',
            standing: 'Primary hosted interface for Codex operating visibility.',
            nextAction: 'Publish dashboard revision and verify route.',
            tone: 'ok',
        },
        {
            name: 'gtop-app',
            group: 'Growth Tutorials',
            status: 'Active',
            branch: 'codex/new-gtop-v2-lab',
            workingTree: 'dirty',
            localPath: 'F:\\Workspace\\Programs\\Growth-Tutorials\\gtop-app',
            repo: 'https://github.com/Wolfrine/gtop-app',
            deployment: 'gtop-app.web.app and dev-gtop-app.web.app',
            standing: 'Primary GTOP product and CI workflow hub.',
            nextAction: 'Inspect dirty files before any new GTOP implementation.',
            tone: 'warn',
        },
        {
            name: 'growth-tutorials',
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
            group: 'Central workspace',
            status: 'Control',
            branch: 'main',
            workingTree: 'dirty',
            localPath: 'F:\\Central\\workbench\\01_active\\aesthetic-india',
            repo: 'https://github.com/Wolfrine/Central',
            deployment: 'repo workflow; separate publish route not detected',
            standing: 'Visible mobile project context, but source control belongs to Central.',
            nextAction: 'Use Central repo boundaries for commits and automation.',
            tone: 'warn',
        },
        {
            name: 'ops-forge',
            group: 'Operations',
            status: 'Active',
            branch: 'main',
            workingTree: 'clean',
            localPath: 'F:\\Workspace\\Programs\\Codex-Operations\\ops-forge',
            repo: 'https://github.com/Wolfrine/ops-forge',
            deployment: 'lumio-forge Firebase project inferred from config',
            standing: 'Process tooling and operations standardization root.',
            nextAction: 'Use for reusable scripts and Codex operating process only.',
            tone: 'ok',
        },
        {
            name: 'Orynth',
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
            group: 'Independent product',
            status: 'Support',
            branch: 'main',
            workingTree: 'clean',
            localPath: 'F:\\Workspace\\Programs\\Independent-Products\\NovaSaga',
            repo: 'https://github.com/Wolfrine/NovaSaga',
            deployment: 'not detected',
            standing: 'Worldbuilding/content product in support posture.',
            nextAction: 'Define active outcome before implementation.',
            tone: 'muted',
        },
        {
            name: 'ChatGPT',
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
            group: 'Archived',
            status: 'Archived',
            branch: 'main',
            workingTree: 'remote archived',
            localPath: 'not present in F:\\Workspace scan',
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
            progress: 'PTI dashboard work is active now. GTOP, growth-tutorials, GT-shared-services, and Central have existing local changes that must be respected.',
            next: 'Before starting new work, choose one project and inspect its dirty state.',
            tone: 'warn',
        },
        {
            heading: 'How work should happen',
            progress: 'The rule is repo-first: identify owning repo, verify branch, inspect dirty state, build/test, then commit and publish through that repo lane.',
            next: 'Use broad F drive only for discovery and control, not implementation by default.',
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

    get activeProjectCount(): number {
        return this.portfolioProjects.filter((project) => project.status === 'Active' || project.status === 'Live').length;
    }

    get controlProjectCount(): number {
        return this.portfolioProjects.filter((project) => project.status === 'Control').length;
    }

    get supportProjectCount(): number {
        return this.portfolioProjects.filter((project) => project.status === 'Support' || project.status === 'Unknown').length;
    }

    constructor(private authService: AuthService, private router: Router) {}

    ngOnInit(): void {
        this.authService.user$.subscribe((user) => {
            this.user = user;
            this.isAllowed = user?.email === this.allowedEmail;
        });
    }

    logout(): void {
        this.authService.signOut();
    }

    goToDashboard(): void {
        this.router.navigate(['/new-dashboard']);
    }
}
