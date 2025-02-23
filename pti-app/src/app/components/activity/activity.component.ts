import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivityService } from '../../services/activity.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { MatChipsModule } from '@angular/material/chips';
import { ActivatedRoute, Router } from '@angular/router';
import {
    Chart,
    ChartOptions,
    registerables,
} from 'chart.js';

@Component({
    selector: 'app-activity',
    standalone: true,
    imports: [ReactiveFormsModule, CommonModule, MatChipsModule],
    providers: [DatePipe],
    templateUrl: './activity.component.html',
    styleUrls: ['./activity.component.scss'],
})
export class ActivityComponent implements OnInit {
    activityForm: FormGroup;
    categories: any[] = [];
    groupedActivities: { [date: string]: any[] } = {};
    lastVisibleDoc: any = null;
    isLoading = false;

    @ViewChild('activityChart') activityChartRef!: ElementRef<HTMLCanvasElement>;
    activityChart!: Chart;

    // Chart data and options
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
                title: {
                    display: true,
                    text: 'Activity Categories',
                },
            },
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Time Spent (Hours)',
                },
            },
        },
    };

    constructor(
        private fb: FormBuilder,
        private activityService: ActivityService,
        private datePipe: DatePipe,
        private route: ActivatedRoute,
        public router: Router,
        private localStorageService: LocalStorageService
    ) {
        this.activityForm = this.fb.group({
            name: [''],
            categoryId: [''],
            newCategory: [''], // For adding new categories
            startTime: [''],
            endTime: [''],
            notes: [''],
        });
    }

    ngOnInit(): void {
        this.loadCategories();
        this.loadActivities();
        Chart.register(...registerables);
    }

    ngAfterViewInit(): void {
        // ✅ Load report once the chart element is available
        if (this.localStorageService.isTimeDataForTodayAvailable()) {
            this.loadCachedReport(); // Load from local storage
        } else {
            this.generate30DayReport(); // Generate fresh report
        }
    }

    // ✅ Load cached report from local storage
    private loadCachedReport(): void {
        const cachedReport = this.localStorageService.getActivityReport();

        if (cachedReport && Object.keys(cachedReport).length > 0) {
            this.barChartData.labels = Object.keys(cachedReport);
            this.barChartData.datasets[0].data = Object.values(cachedReport).map(Number);
            this.renderChart();
        } else {
            this.generate30DayReport(); // Fetch fresh report if cache is empty
        }
    }

    // ✅ Sort dates in descending order
    sortByDateDesc = (a: any, b: any): number => {
        const dateA = new Date(a.key).getTime();
        const dateB = new Date(b.key).getTime();
        return dateB - dateA;
    };

    // ✅ Load categories
    async loadCategories(): Promise<void> {
        try {
            this.categories = await this.activityService.fetchCategories();
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    }

    async addActivity(): Promise<void> {
        try {
            const formValue = this.activityForm.value;

            if (formValue.newCategory) {
                await this.activityService.addCategory(formValue.newCategory);
                formValue.categoryId = formValue.newCategory;
            }

            formValue.date = new Date();
            formValue.startTime = this.convertToDate(formValue.startTime); // ✅ Convert to Date
            formValue.endTime = this.convertToDate(formValue.endTime);     // ✅ Convert to Date

            await this.activityService.addActivity(formValue);
            this.activityForm.reset();
            await this.loadCategories();
            this.loadActivities(true);
        } catch (error) {
            console.error('Error adding activity:', error);
        }
    }


    // ✅ Load activities and group them by date
    async loadActivities(reset = false): Promise<void> {
        if (this.isLoading) return;

        this.isLoading = true;
        try {
            const response = await this.activityService.fetchActivities(this.lastVisibleDoc);

            if (reset) this.groupedActivities = {};

            this.groupActivitiesByDate(response.activities);
            this.lastVisibleDoc = response.lastVisible;
        } catch (error) {
            console.error('Error loading activities:', error);
        } finally {
            this.isLoading = false;
        }
    }

    // ✅ Group fetched activities by start date and sort them
    private groupActivitiesByDate(activities: any[]): void {
        activities.forEach((activity) => {
            const activityStartDate = this.convertToDate(activity.startTime);

            if (isNaN(activityStartDate.getTime())) {
                console.warn('Skipping activity with invalid start time:', activity);
                return;
            }

            const dateKey = this.formatDate(activityStartDate);

            const startTime = this.convertToDate(activity.startTime);
            const endTime = this.convertToDate(activity.endTime);
            activity.durationInMinutes = this.calculateDuration(startTime, endTime, 'minutes');
            activity.durationInHours = this.calculateDuration(startTime, endTime, 'hours');

            if (!this.groupedActivities[dateKey]) {
                this.groupedActivities[dateKey] = [];
            }
            this.groupedActivities[dateKey].push(activity);

            // ✅ Sort activities within the same date
            this.groupedActivities[dateKey].sort((a, b) => {
                const timeA = this.convertToDate(a.startTime).getTime();
                const timeB = this.convertToDate(b.startTime).getTime();
                return timeB - timeA;
            });
        });
    }


    // ✅ Format date using DatePipe
    private formatDate(date: Date): string {
        return isNaN(date.getTime())
            ? 'Invalid Date'
            : this.datePipe.transform(date, 'MMM dd, yyyy') || '';
    }

    // ✅ Convert any date format to JavaScript Date
    // ✅ Convert Firestore Timestamps or Date strings to JavaScript Date
    private convertToDate(dateValue: any): Date {
        if (!dateValue) return new Date(0); // Default to Epoch if invalid

        if (typeof dateValue === 'string') {
            return new Date(dateValue); // Handle ISO strings
        }

        if (dateValue instanceof Object && dateValue.seconds) {
            // ✅ Handling Firestore Timestamp manually (for safety)
            return new Date(dateValue.seconds * 1000);
        }

        if (typeof dateValue.toDate === 'function') {
            return dateValue.toDate(); // Handle Firestore Timestamp object
        }

        return dateValue instanceof Date ? dateValue : new Date(0); // Fallback for Date object
    }


    // ✅ Calculate duration between start and end times
    private calculateDuration(startTime: Date, endTime: Date, unit: 'minutes' | 'hours'): number {
        if (!startTime || !endTime || startTime >= endTime) return 0;

        const durationInMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);
        return unit === 'minutes'
            ? parseFloat(durationInMinutes.toFixed(2))
            : parseFloat((durationInMinutes / 60).toFixed(2));
    }

    // ✅ Generate and cache a 30-day report
    async generate30DayReport(): Promise<void> {
        try {
            const report = await this.activityService.fetch30DayReport();

            // ✅ Check for valid date fields before adding to the report
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


    // ✅ Render or update the bar chart
    private renderChart(): void {
        if (!this.activityChartRef || !this.activityChartRef.nativeElement) {
            console.error('Chart element not initialized yet.');
            return;
        }

        if (this.activityChart) {
            this.activityChart.destroy(); // Prevent multiple instances
        }

        this.activityChart = new Chart(this.activityChartRef.nativeElement, {
            type: 'bar',
            data: this.barChartData,
            options: this.barChartOptions,
        });
    }
}
