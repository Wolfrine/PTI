import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    Chart,
    ChartConfiguration,
    ChartOptions,
    registerables
} from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { DomainService } from '../../services/domain.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

// ✅ Register required Chart.js components
Chart.register(...registerables);

interface Domain {
    name: string;
    progress: number;
    color: string;
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, BaseChartDirective], // ✅ Only import BaseChartDirective
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
    user: any;
    domains: Domain[] = [];
    polarChartLabels: string[] = [];
    polarChartData: ChartConfiguration<'polarArea'>['data'] = {
        labels: [],
        datasets: [],
    };

    // ✅ Fix: Define as a string instead of ChartType
    polarChartType = 'polarArea';

    polarChartOptions: ChartOptions<'polarArea'> = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top', // ✅ Move labels to top
            },
        },
        scales: {
            r: {
                min: 0,
                max: 100, // ✅ Default value, updated dynamically
                ticks: {
                    stepSize: 10, // ✅ Will be updated dynamically
                },
            },
        },
    };

    constructor(
        private domainService: DomainService,
        public authService: AuthService,
        private router: Router
    ) { }

    ngOnInit() {
        this.authService.user$.subscribe((user) => {
            this.user = user;
        });

        this.domainService.getDomains().subscribe((data) => {
            this.domains = data.map((d) => ({
                name: d.name,
                progress: d.progress || 0,
                color: d.color || '#007bff',
            }));

            // ✅ Assign Labels
            this.polarChartLabels = this.domains.map((d) => d.name);

            // ✅ Calculate max value dynamically
            const maxProgress = Math.min(
                Math.max(...this.domains.map((d) => d.progress)) + 10,
                100
            );

            // ✅ Dynamically update step size (max / 10)
            const stepSize = Math.ceil(maxProgress / 7);

            // ✅ Update chart options dynamically
            // ✅ Update chart options dynamically
            this.polarChartOptions.scales!['r']!.max = maxProgress;
            this.polarChartOptions.scales!['r']!.ticks!.stepSize = stepSize;

            this.polarChartData = {
                labels: this.polarChartLabels,
                datasets: [
                    {
                        data: this.domains.map((d) => d.progress),
                        backgroundColor: this.domains.map((d) => d.color),
                        borderColor: '#ffffff',
                        borderWidth: 2,
                    },
                ],
            };

            console.log('Polar Chart Data:', JSON.stringify(this.polarChartData, null, 2));
            console.log('Max Value:', maxProgress, '| Step Size:', stepSize);
        });
    }

    goToManageDomains() {
        this.router.navigate(['/domains']);
    }

    logout() {
        this.authService.signOut();
    }
}
