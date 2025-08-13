import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    Chart,
    ChartConfiguration,
    ChartOptions,
    registerables,
} from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { DomainService } from '../../services/domain.service';
import { AuthService } from '../../services/auth.service';
import { TargetTaskService } from '../../services/target-task.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { ActivityReportComponent } from '../activity-report/activity-report.component';

Chart.register(...registerables);

interface Domain {
    id: string;
    name: string;
    progress: number;
    color: string;
}

@Component({
    selector: 'app-new-dashboard',
    standalone: true,
    imports: [
        CommonModule,
        BaseChartDirective,
        MatButtonModule,
        MatIconModule,
        MatCardModule,
        MatToolbarModule,
        MatListModule,
        ActivityReportComponent,
    ],
    templateUrl: './new-dashboard.component.html',
    styleUrls: ['./new-dashboard.component.scss'],
})
export class NewDashboardComponent implements OnInit {
    user: any;
    domains: Domain[] = [];
    polarChartLabels: string[] = [];
    polarChartData: ChartConfiguration<'polarArea'>['data'] = {
        labels: [],
        datasets: [],
    };

    polarChartType = 'polarArea';
    polarChartOptions: ChartOptions<'polarArea'> = {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
            r: { min: 0, max: 100, ticks: { stepSize: 5 } },
        },
    };

    // ✅ Define Donut Charts for Time-Based Tracking
    donutChartType = 'doughnut';
    donutChartDataToday!: ChartConfiguration<'doughnut'>['data']; // ✅ New Chart for Today
    donutChartDataLast1Day!: ChartConfiguration<'doughnut'>['data'];
    donutChartDataLast7Days!: ChartConfiguration<'doughnut'>['data'];
    donutChartDataLast1Month!: ChartConfiguration<'doughnut'>['data'];

    chartPlugins = [{
        id: 'centerText',
        beforeDraw: (chart: any) => {
            const { width } = chart;
            const { height } = chart;
            const { ctx } = chart;

            ctx.restore();
            const fontSize = (height / 8).toFixed(2);
            ctx.font = `${fontSize}px Arial`;
            ctx.textBaseline = 'middle';

            chart.data.datasets[0].data.forEach((value: number, index: number) => {
                if (index === 0) {
                    const centerText = `${value} of ${chart.data.datasets[0].data.reduce((a: number, b: number) => a + b, 0)}`;
                    const textX = Math.round((width - ctx.measureText(centerText).width) / 2);
                    const textY = height / 2;

                    ctx.fillText(centerText, textX, textY);
                }
            });

            ctx.save();
        }
    }];

    chartOptions: ChartOptions<'doughnut'> = {
        responsive: true,
        plugins: { legend: { display: false } },
        cutout: '70%',
    };

    constructor(
        private domainService: DomainService,
        private authService: AuthService,
        private targetTaskService: TargetTaskService,
        private localStorageService: LocalStorageService,
        private router: Router
    ) { }

    async ngOnInit() {
        this.authService.initGoogleOneTap();
        this.authService.checkUserSession();
        this.authService.user$.subscribe((user) => {
            this.user = user;
        });

        // ✅ Fetch domain progress data
        this.domainService.getDomains().subscribe((data) => {
            this.domains = data.map((d) => ({
                id: d.id,
                name: d.name,
                progress: d.progress || 0,
                color: d.color || '#007bff',
            }));

            this.polarChartLabels = this.domains.map((d) => d.name);
            const maxProgress = Math.min(
                Math.max(...this.domains.map((d) => d.progress)) + 5,
                100
            );
            const stepSize = Math.ceil(maxProgress / 7);
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
        });

        // ✅ Maintain Time-Based Data
        const isTimeDataAvailable =
            this.localStorageService.isTimeDataForTodayAvailable();
        if (!isTimeDataAvailable) {
            console.log('Fetching completed tasks to update time-spent stats...');
            await this.updateTimeSpentData();
        }

        // ✅ Load Chart Data from Local Storage
        this.loadDonutChartData();
    }

    async updateTimeSpentData() {
        const completedTasks = await this.targetTaskService.getCompletedTasksSince(30); // Fetch last 30 days
        const now = new Date().getTime();

        // ✅ Get today's midnight timestamp
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const todayStartTime = todayMidnight.getTime();

        // ✅ Get midnight of yesterday
        const yesterdayMidnight = new Date(todayMidnight);
        yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);
        const yesterdayStartTime = yesterdayMidnight.getTime();

        let timeToday = 0,
            timeYesterday = 0,
            timeLast7Days = 0,
            timeLast30Days = 0;

        completedTasks.forEach((task) => {
            const completedTime = task.completedTime || 0;

            if (!task.completionDate?.seconds) {
                console.warn(`⚠️ Skipping task ${task.id} due to invalid completionDate`, task);
                return;
            }

            const completionDate = new Date(task.completionDate.seconds * 1000);
            const taskCompletionTime = completionDate.getTime();

            console.log(`🕒 Task Completed On: ${completionDate}, Time Diff: ${now - taskCompletionTime}`);

            // ✅ Categorize into time buckets
            if (taskCompletionTime >= todayStartTime) {
                timeToday += completedTime; // ✅ Today
            } else if (taskCompletionTime >= yesterdayStartTime) {
                timeYesterday += completedTime; // ✅ Yesterday
            }

            if (taskCompletionTime >= todayStartTime - (7 * 24 * 60 * 60 * 1000)) timeLast7Days += completedTime;
            if (taskCompletionTime >= todayStartTime - (30 * 24 * 60 * 60 * 1000)) timeLast30Days += completedTime;
        });

        console.log(`✅ Time Spent (Today): ${timeToday}`);
        console.log(`✅ Time Spent (Yesterday): ${timeYesterday}`);
        console.log(`✅ Time Spent (Last 7 Days): ${timeLast7Days}`);
        console.log(`✅ Time Spent (Last 30 Days): ${timeLast30Days}`);

        this.localStorageService.setTimeSpentLastNDays(0, timeToday);
        this.localStorageService.setTimeSpentLastNDays(1, timeYesterday);
        this.localStorageService.setTimeSpentLastNDays(7, timeLast7Days);
        this.localStorageService.setTimeSpentLastNDays(30, timeLast30Days);
        this.localStorageService.setTimeDataForToday();

        // ✅ Reload chart data
        this.loadDonutChartData();
    }

    loadDonutChartData() {
        this.donutChartDataToday = this.generateDonutChartData(
            24,
            this.localStorageService.getTimeSpentLastNDays(0)
        );
        this.donutChartDataLast1Day = this.generateDonutChartData(
            24,
            this.localStorageService.getTimeSpentLastNDays(1)
        );
        this.donutChartDataLast7Days = this.generateDonutChartData(
            168,
            this.localStorageService.getTimeSpentLastNDays(7)
        );
        this.donutChartDataLast1Month = this.generateDonutChartData(
            720,
            this.localStorageService.getTimeSpentLastNDays(30)
        );
    }


    generateDonutChartData(
        maxValue: number,
        timeSpent: number
    ): ChartConfiguration<'doughnut'>['data'] {
        const unusedTime = Math.max(0, maxValue - timeSpent);

        return {
            labels: ['Time Spent', 'Unused Time'],
            datasets: [
                {
                    data: [timeSpent, unusedTime],
                    backgroundColor: ['#007bff', '#e0e0e0'],
                },
            ],
        };
    }

    goToManageDomains() {
        this.router.navigate(['/domains']);
    }

    goToActivties() {
        this.router.navigate(['/activities']);
    }

    goToDomain(domain: { id: string; name: string }) {
        this.router.navigate(['/domains', domain.id], {
            queryParams: { name: domain.name },
        });
    }

    async refreshData() {
        console.log("🔄 Refreshing data...");
        await this.updateTimeSpentData();
        await this.loadDonutChartData();
        console.log("✅ Data refreshed!");
    }

    logout() {
        this.authService.signOut();
    }
}
