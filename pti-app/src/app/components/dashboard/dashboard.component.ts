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
    imports: [CommonModule, BaseChartDirective],
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

    // ✅ Define Donut Charts
    donutChartType = 'doughnut';

    donutChartDataLast1Day: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
    donutChartDataLast7Days: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
    donutChartDataLast1Month: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };

    chartOptions: ChartOptions<'doughnut'> = {
        responsive: true,
        plugins: {
            legend: { display: false }, // ✅ Hide labels for Donut Chart
        },
        cutout: '70%', // ✅ Ensures the inner cut is proportionate
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

            const stepSize = Math.ceil(maxProgress / 7);

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

            // ✅ Donut Chart Calculation
            this.donutChartDataLast1Day = this.generateDonutChartData(24);
            this.donutChartDataLast7Days = this.generateDonutChartData(168);
            this.donutChartDataLast1Month = this.generateDonutChartData(720);
        });
    }

    generateDonutChartData(maxValue: number): ChartConfiguration<'doughnut'>['data'] {
        const totalHoursSpent = this.domains.reduce((sum, d) => sum + d.progress, 0);
        const emptyHours = Math.max(0, maxValue - totalHoursSpent);

        return {
            labels: [...this.domains.map((d) => d.name), 'Unused Time'],
            datasets: [
                {
                    data: [...this.domains.map((d) => d.progress), emptyHours],
                    backgroundColor: [...this.domains.map((d) => d.color), '#e0e0e0'],
                },
            ],
        };
    }

    goToManageDomains() {
        this.router.navigate(['/domains']);
    }

    goToDomain(domainName: string) {
        this.router.navigate([`/domains/${domainName}`]);
    }

    logout() {
        this.authService.signOut();
    }
}
