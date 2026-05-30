import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { NewDashboardComponent } from './components/new-dashboard/new-dashboard.component';
import { ManageDomainsComponent } from './components/domains/manage-domains/manage-domains.component';
import { ManageTargetsTasksComponent } from './components/domains/manage-targets-tasks/manage-targets-tasks.component';
import { ActivityComponent } from './components/activity/activity.component';
import { NewCodexCommandComponent } from './components/new-codex-command/new-codex-command.component';
import { NewHomeComponent } from './components/new-home/new-home.component';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
    { path: '', component: LoginComponent },
    {
        path: 'home',
        component: NewHomeComponent,
        canActivate: [AuthGuard],
    },
    {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [AuthGuard],
    },
    {
        path: 'new-dashboard',
        component: NewDashboardComponent,
        canActivate: [AuthGuard],
    },
    {
        path: 'domains',
        component: ManageDomainsComponent,
        canActivate: [AuthGuard],
    },
    {
        path: 'domains/:domainId', // Route for specific domain targets & tasks
        component: ManageTargetsTasksComponent,
        canActivate: [AuthGuard],
    },
    {
        path: 'activities',
        component: ActivityComponent,
        canActivate: [AuthGuard],
    },
    {
        path: 'codex-command',
        component: NewCodexCommandComponent,
        canActivate: [AuthGuard],
    },
];
