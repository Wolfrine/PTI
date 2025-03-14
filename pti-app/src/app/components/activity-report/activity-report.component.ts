import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    Chart,
    ChartConfiguration,
    ChartOptions,
    registerables,
} from 'chart.js';
import { ActivityService } from '../../services/activity.service';
import { LocalStorageService } from '../../services/local-storage.service';

Chart.register(...registerables);

@Component({
    selector: 'app-activity-report',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './activity-report.component.html',
    styleUrls: ['./activity-report.component.scss'],
})
export class ActivityReportComponent implements OnInit, AfterViewInit {
    @ViewChild('activityChart') activityChartRef!: ElementRef<HTMLCanvasElement>;
    activityChart!: Chart;

    barChartData = {
        labels: [] as string[],
        datasets: [
            {
                label: 'Time Spent (Hours)',
                data: [] as number[],
                backgroundColor: '#3f51b5',
                borderColor: '#303f9f',
                borderWidth: 1,
            },
        ],
    };

    barChartOptions: ChartOptions = {
        responsive: true,
        scales: {
            x: {
                beginAtZero: true,
                title: { display: true, text: 'Activity Categories' },
            },
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Time Spent (Hours)' },
            },
        },
    };

    constructor(
        private activityService: ActivityService,
        private localStorageService: LocalStorageService
    ) { }

    ngOnInit(): void {
        if (this.localStorageService.isTimeDataForTodayAvailable()) {
            this.loadCachedReport();
        } else {
            this.generate30DayReport();
        }
    }

    ngAfterViewInit(): void {
        this.renderChart();
    }

    private loadCachedReport(): void {
        const cachedReport = this.localStorageService.getActivityReport();
        if (cachedReport && Object.keys(cachedReport).length > 0) {
            this.barChartData.labels = Object.keys(cachedReport);
            this.barChartData.datasets[0].data = Object.values(cachedReport).map(Number);
            this.renderChart();
        } else {
            this.generate30DayReport();
        }
    }

    async generate30DayReport(): Promise<void> {
        try {
            const report = await this.activityService.fetch30DayReport();
            if (!report || Object.keys(report).length === 0) {
                console.warn('No valid activities found in the last 30 days.');
                return;
            }

            this.localStorageService.setActivityReport(report);
            this.barChartData.labels = Object.keys(report);
            this.barChartData.datasets[0].data = Object.values(report).map(Number);
            this.renderChart();
        } catch (error) {
            console.error('Error generating 30-day report:', error);
        }
    }

    private renderChart(): void {
        if (!this.activityChartRef || !this.activityChartRef.nativeElement) {
            console.error('Chart element not initialized yet.');
            return;
        }

        if (this.activityChart) {
            this.activityChart.destroy();
        }

        this.activityChart = new Chart(this.activityChartRef.nativeElement, {
            type: 'bar',
            data: this.barChartData,
            options: this.barChartOptions,
        });
    }
}
