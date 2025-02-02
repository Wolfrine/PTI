import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ManageDomainsComponent } from './components/domains/manage-domains/manage-domains.component';
import { ManageTargetsTasksComponent } from './components/domains/manage-targets-tasks/manage-targets-tasks.component';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
    { path: '', component: LoginComponent },
    {
        path: 'dashboard',
        component: DashboardComponent,
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
];
