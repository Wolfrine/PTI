import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../services/auth.service';

interface CommandSignal {
    label: string;
    value: string;
    tone: 'ok' | 'warn' | 'critical';
}

interface CommandAction {
    priority: '1' | '2' | '3';
    title: string;
    details: string;
    expectedOutcome: string;
}

interface SurfaceDecision {
    surface: 'Mobile' | 'Desktop' | 'GitHub' | 'Firebase';
    canDo: string;
    cannotDo: string;
    controlOwner: string;
}

interface PortfolioRow {
    name: string;
    class: 'Remote GitHub' | 'Local path (triage/control)';
    branch: string;
    route: string;
    mobileRule: string;
    deployment: string;
    status: 'Live' | 'Active' | 'Ready' | 'Archived' | 'Control';
}

interface OperatingLoopStep {
    step: string;
    action: string;
    command: string;
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

    readonly commandSignals: CommandSignal[] = [
        {
            label: 'Platform role',
            value: 'PTI is the hosted Codex visual command portal.',
            tone: 'ok',
        },
        {
            label: 'Execution model',
            value: 'Repo-owned changes, GitHub source-of-truth, shared command visibility.',
            tone: 'ok',
        },
        {
            label: 'Desktop control',
            value: 'Desktop Codex creates and syncs project roots.',
            tone: 'warn',
        },
        {
            label: 'Mobile boundary',
            value: 'Mobile can continue synced projects, but cannot reliably create local Codex projects.',
            tone: 'critical',
        },
    ];

    readonly urgentActions: CommandAction[] = [
        {
            priority: '1',
            title: 'Confirm owning repository',
            details: 'Pick the remote GitHub repo before opening any implementation path.',
            expectedOutcome: 'No wrong-root edits, no stale deployment triggers.',
        },
        {
            priority: '2',
            title: 'Sync trust boundary',
            details: 'Mobile work is for continuation only; new roots start on desktop.',
            expectedOutcome: 'Project discovery is stable and consistent across devices.',
        },
        {
            priority: '3',
            title: 'Lock release lane',
            details: 'Use the repo-specific publishing route (GitHub Action, Firebase, or service flow).',
            expectedOutcome: 'Clean production output and readable operational state.',
        },
    ];

    readonly operatingModes: SurfaceDecision[] = [
        {
            surface: 'Mobile',
            canDo: 'Inspect state, direct priorities, continue synced tasks.',
            cannotDo: 'Create or discover new local projects reliably.',
            controlOwner: 'Executive command, triage, and release checkpoint visibility.',
        },
        {
            surface: 'Desktop',
            canDo: 'Create/sync repo projects, refresh index, verify branch and environment.',
            cannotDo: 'Remain the default operating surface for broad multi-repo planning.',
            controlOwner: 'Project root trust and local reproducibility.',
        },
        {
            surface: 'GitHub',
            canDo: 'Own branches, PRs, history, tests, and release provenance.',
            cannotDo: 'Operate without repo-level implementation ownership.',
            controlOwner: 'Source-of-truth for decisions and audits.',
        },
        {
            surface: 'Firebase',
            canDo: 'Distribute the published command surface to any device.',
            cannotDo: 'Expose local-only state or files that do not reproduce.',
            controlOwner: 'Any-device operational continuity.',
        },
    ];

    readonly portfolioMap: PortfolioRow[] = [
        {
            name: 'Central',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/Central',
            mobileRule: 'Use as ecosystem control host, not default coding root.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'Empire-Planning',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/Empire-Planning',
            mobileRule: 'Continue only when already synced on desktop.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'ChatGPT',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/ChatGPT',
            mobileRule: 'Implementation inside the repo-specific project.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'gtop-app',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/gtop-app',
            mobileRule: 'Primary implementation and CI hub for GT operations work.',
            deployment: 'GitHub Actions + Firebase',
            status: 'Active',
        },
        {
            name: 'growth-tutorials',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/growth-tutorials',
            mobileRule: 'Mobile continues only if pre-synced via desktop root.',
            deployment: 'GitHub Actions',
            status: 'Active',
        },
        {
            name: 'GT-shared-services',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/GT-shared-services',
            mobileRule: 'Use for service-layer work that affects shared infra.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'PTI',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/PTI',
            mobileRule: 'Hosted command plane itself; verify build/publish health.',
            deployment: 'GitHub Actions -> Firebase Hosting',
            status: 'Live',
        },
        {
            name: 'ops-forge',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/ops-forge',
            mobileRule: 'Use for operations tooling and process scripts.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'NovaSaga',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/NovaSaga',
            mobileRule: 'Resume after desktop-sync if needed for implementation.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'Novel-Encyclopedia',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/Novel-Encyclopedia',
            mobileRule: 'Use repo-specific project for all edits.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'Orynth',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/Orynth',
            mobileRule: 'Avoid local-only assumptions for scope changes.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'StoryForge',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/StoryForge',
            mobileRule: 'Continue pre-synced work only.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'luminar_robotics',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/luminar_robotics',
            mobileRule: 'Only local-synced projects should be operationally touched on mobile.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'gt_aj_app',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/gt_aj_app',
            mobileRule: 'Keep execution in owning repo only.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'gt_aj_classes',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/gt_aj_classes',
            mobileRule: 'Repo-specific scope is mandatory for changes.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'gt_aj_register',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/gt_aj_register',
            mobileRule: 'Use the synced desktop project for implementation.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'gt_nj_master',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/gt_nj_master',
            mobileRule: 'Implement only when trust path is synced.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'GrowthWebsite',
            class: 'Remote GitHub',
            branch: 'main',
            route: 'https://github.com/Wolfrine/GrowthWebsite',
            mobileRule: 'Archived portfolio reference only; no active mobile execution.',
            deployment: 'N/A',
            status: 'Archived',
        },
        {
            name: 'Central / Aesthetic India',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Central\\workbench\\01_active\\aesthetic-india',
            mobileRule: 'Use only after desktop sync confirms the active project.',
            deployment: 'Repo workflow',
            status: 'Control',
        },
        {
            name: 'F:\\Central',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Central',
            mobileRule: 'Broad F-root use only for triage and coordination.',
            deployment: 'N/A',
            status: 'Control',
        },
        {
            name: 'gtop-app',
            class: 'Local path (triage/control)',
            branch: 'codex/new-gtop-v2-lab',
            route: 'F:\\Workspace\\Programs\\Growth-Tutorials\\gtop-app',
            mobileRule: 'Local branch context for implementation visibility.',
            deployment: 'GitHub workflow',
            status: 'Active',
        },
        {
            name: 'growth-tutorials',
            class: 'Local path (triage/control)',
            branch: 'dev-hub',
            route: 'F:\\Workspace\\Programs\\Growth-Tutorials\\growth-tutorials',
            mobileRule: 'Use for broad system design coordination and sync checks.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'GT-shared-services',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Workspace\\Programs\\Growth-Tutorials\\GT-shared-services',
            mobileRule: 'Service scope only; avoid feature-domain edits here.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'ops-forge',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Workspace\\Programs\\Codex-Operations\\ops-forge',
            mobileRule: 'Control-plane tools and process codification.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'PTI',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Workspace\\Programs\\Independent-Products\\PTI',
            mobileRule: 'Desktop sync from this root drives mobile project visibility.',
            deployment: 'Firebase Hosting',
            status: 'Live',
        },
        {
            name: 'NovaSaga',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Workspace\\Programs\\Independent-Products\\NovaSaga',
            mobileRule: 'Implementation and branch checks from local root.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'Novel-Encyclopedia',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Workspace\\Programs\\Independent-Products\\Novel-Encyclopedia',
            mobileRule: 'Use local root for deterministic branch-level decisions.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'Orynth',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Workspace\\Programs\\Independent-Products\\Orynth',
            mobileRule: 'Mobile commands should not redefine the coding root.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'ChatGPT',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Workspace\\Programs\\Other\\ChatGPT',
            mobileRule: 'Work from synced remote root with desktop trust.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'StoryForge',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Workspace\\Programs\\Other\\StoryForge',
            mobileRule: 'Keep mobile use to decisions and checks until sync confirmed.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
        {
            name: 'luminar_robotics',
            class: 'Local path (triage/control)',
            branch: 'main',
            route: 'F:\\Workspace\\Programs\\Other\\luminar_robotics',
            mobileRule: 'No project creation from mobile; continue only.',
            deployment: 'Repo workflow',
            status: 'Active',
        },
    ];

    readonly operatingLoop: OperatingLoopStep[] = [
        {
            step: '01',
            action: 'Classify intent',
            command: 'Triage, implementation, automation, publish, governance.',
        },
        {
            step: '02',
            action: 'Choose surface',
            command: 'Mobile = execute continuation; Desktop = create/sync project roots.',
        },
        {
            step: '03',
            action: 'Pick repo',
            command: 'Use exact GitHub repository and matching branch/path.',
        },
        {
            step: '04',
            action: 'Operate',
            command: 'Implement + test + commit via repo workflow.',
        },
        {
            step: '05',
            action: 'Publish + verify',
            command: 'Push through repo route and confirm live portal health.',
        },
    ];

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
