import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../services/auth.service';

interface EcosystemProject {
    name: string;
    path: string;
    branch: string;
    role: string;
    mobileMode: string;
    deployPath: string;
    status: 'Live' | 'Active' | 'Ready' | 'Support';
}

interface ProcessStep {
    number: string;
    title: string;
    owner: string;
    detail: string;
}

interface ControlRule {
    label: string;
    detail: string;
    tone: 'primary' | 'warning' | 'critical';
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

    readonly projects: EcosystemProject[] = [
        {
            name: 'PTI Command Portal',
            path: 'F:\\Workspace\\Programs\\Independent-Products\\PTI',
            branch: 'main',
            role: 'Hosted Codex command surface for any-device executive visibility.',
            mobileMode: 'Open published Firebase route after login.',
            deployPath: 'GitHub Actions to Firebase Hosting',
            status: 'Live',
        },
        {
            name: 'GTOP App',
            path: 'F:\\Workspace\\Programs\\Growth-Tutorials\\gtop-app',
            branch: 'codex/new-gtop-v2-lab',
            role: 'Primary product build surface for Growth Tutorials operations.',
            mobileMode: 'Use repo-specific synced Codex project for implementation.',
            deployPath: 'Repo-specific build and release flow',
            status: 'Active',
        },
        {
            name: 'Growth Tutorials Hub',
            path: 'F:\\Workspace\\Programs\\Growth-Tutorials\\growth-tutorials',
            branch: 'dev-hub',
            role: 'Shared product logic, hub context, and ecosystem data flows.',
            mobileMode: 'Use when hub-level data or MCP behavior is the actual scope.',
            deployPath: 'GitHub repo workflow',
            status: 'Active',
        },
        {
            name: 'GT Shared Services',
            path: 'F:\\Workspace\\Programs\\Growth-Tutorials\\GT-shared-services',
            branch: 'main',
            role: 'Cross-product service layer and shared backend utilities.',
            mobileMode: 'Use only for service-owned changes.',
            deployPath: 'Service-specific repo workflow',
            status: 'Support',
        },
        {
            name: 'Central / Aesthetic India',
            path: 'F:\\Central\\workbench\\01_active\\aesthetic-india',
            branch: 'main',
            role: 'Automation and content operations with existing mobile project visibility.',
            mobileMode: 'Already mobile-visible; use for Aesthetic India execution.',
            deployPath: 'Local automation and repo commits',
            status: 'Active',
        },
        {
            name: 'Ops Forge',
            path: 'F:\\Workspace\\Programs\\Codex-Operations\\ops-forge',
            branch: 'main',
            role: 'Reusable operations scripts and Codex process tooling.',
            mobileMode: 'Use for tooling, not product code.',
            deployPath: 'GitHub repo workflow',
            status: 'Ready',
        },
        {
            name: 'Independent Products',
            path: 'F:\\Workspace\\Programs\\Independent-Products',
            branch: 'per repo',
            role: 'NovaSaga, Novel Encyclopedia, Orynth, PTI, and future products.',
            mobileMode: 'Create desktop-synced project per serious repo before mobile work.',
            deployPath: 'Repo-specific publishing',
            status: 'Ready',
        },
    ];

    readonly processSteps: ProcessStep[] = [
        {
            number: '01',
            title: 'Classify the work',
            owner: 'CEO control',
            detail: 'Decide whether the task is triage, implementation, automation, publishing, or governance.',
        },
        {
            number: '02',
            title: 'Select the repo',
            owner: 'Codex operator',
            detail: 'Use the repo that owns the code, branch, tests, and deployment path. Do not default to broad F drive roots.',
        },
        {
            number: '03',
            title: 'Confirm mobile project',
            owner: 'Desktop Codex',
            detail: 'Desktop must create or sync the project first. Mobile continues existing projects; it does not reliably create new ones.',
        },
        {
            number: '04',
            title: 'Execute in scope',
            owner: 'Repo agent',
            detail: 'Implement, test, and commit inside the repo-specific Codex project. Keep unrelated repositories untouched.',
        },
        {
            number: '05',
            title: 'Publish or hand off',
            owner: 'Release path',
            detail: 'Use the repo deployment route: GitHub Actions, Firebase, local automation, or PR review depending on the project.',
        },
    ];

    readonly rules: ControlRule[] = [
        {
            label: 'Repo-specific execution',
            detail: 'Implementation happens inside the actual repo project so branch, remote, tests, and commits stay clean.',
            tone: 'primary',
        },
        {
            label: 'Control hub for triage',
            detail: 'A broad hub can inspect status and coordinate work, but should not become the normal coding root.',
            tone: 'warning',
        },
        {
            label: 'No mobile-only project creation',
            detail: 'New projects must be created or synced from desktop Codex before they can be trusted on mobile.',
            tone: 'critical',
        },
        {
            label: 'Commit-driven publishing',
            detail: 'PTI publishes this command surface through main-branch GitHub Actions to Firebase Hosting.',
            tone: 'primary',
        },
    ];

    readonly operatingModes = [
        {
            name: 'Mobile',
            purpose: 'Review status, approve direction, continue synced project work, and inspect published dashboards.',
            boundary: 'Cannot reliably create new local Codex projects.',
        },
        {
            name: 'Desktop',
            purpose: 'Create projects, sync project visibility, restart Codex, and set up local roots.',
            boundary: 'Must establish the project before mobile becomes dependable.',
        },
        {
            name: 'GitHub',
            purpose: 'Hold source of truth for repo history, branches, pull requests, and deployment triggers.',
            boundary: 'Only clean commits should trigger production publishing.',
        },
        {
            name: 'Firebase',
            purpose: 'Expose approved visual command surfaces that are reachable from any device.',
            boundary: 'Published views must not depend on local-only files.',
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
