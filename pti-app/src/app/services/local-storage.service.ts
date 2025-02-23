import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export class LocalStorageService {
    private readonly DOMAIN_PROGRESS_KEY = 'domain_progress';
    private readonly TIME_SPENT_KEY = 'time_spent';
    private readonly LAST_UPDATED_KEY = 'last_time_update';
    private readonly ACTIVITY_REPORT_KEY = 'activity_30_day_report';

    constructor() { }

    // ✅ Store domain progress in local storage
    setDomainProgress(domainId: string, progress: number): void {
        const domainProgress = this.getAllDomainProgress();
        domainProgress[domainId] = progress;
        localStorage.setItem(this.DOMAIN_PROGRESS_KEY, JSON.stringify(domainProgress));
    }

    // ✅ Get domain progress from local storage
    getDomainProgress(domainId: string): number {
        const domainProgress = this.getAllDomainProgress();
        return domainProgress[domainId] || 0;
    }

    // ✅ Get all domain progress values
    private getAllDomainProgress(): Record<string, number> {
        return JSON.parse(localStorage.getItem(this.DOMAIN_PROGRESS_KEY) || '{}');
    }

    // ✅ Store time-spent values for Last 30 Days
    setTimeSpentLastNDays(categoryId: number, value: number): void {
        const timeSpentData = this.getAllTimeSpent();
        timeSpentData[categoryId] = value;
        localStorage.setItem(this.TIME_SPENT_KEY, JSON.stringify(timeSpentData));
    }

    // ✅ Retrieve stored time-spent values
    getTimeSpentLastNDays(categoryId: number): number {
        const timeSpentData = this.getAllTimeSpent();
        return timeSpentData[categoryId] || 0;
    }

    // ✅ Get all stored time-spent data
    getAllTimeSpent(): Record<number, number> {
        return JSON.parse(localStorage.getItem(this.TIME_SPENT_KEY) || '{}');
    }

    // ✅ Check if today's data is already stored
    isTimeDataForTodayAvailable(): boolean {
        const lastUpdated = localStorage.getItem(this.LAST_UPDATED_KEY);
        const today = new Date().toISOString().split('T')[0];
        return lastUpdated === today;
    }

    // ✅ Mark today as the last updated date
    setTimeDataForToday(): void {
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem(this.LAST_UPDATED_KEY, today);
    }

    // ✅ Clear outdated data if needed
    clearLocalStorage(): void {
        localStorage.removeItem(this.DOMAIN_PROGRESS_KEY);
        localStorage.removeItem(this.TIME_SPENT_KEY);
        localStorage.removeItem(this.LAST_UPDATED_KEY);
    }

    // ✅ Store the 30-day activity report
    setActivityReport(reportData: Record<string, number>): void {
        localStorage.setItem(this.ACTIVITY_REPORT_KEY, JSON.stringify(reportData));
    }

    // ✅ Retrieve the 30-day activity report
    getActivityReport(): Record<string, number> {
        return JSON.parse(localStorage.getItem(this.ACTIVITY_REPORT_KEY) || '{}');
    }

    // ✅ Clear activity report data if needed
    clearActivityReport(): void {
        localStorage.removeItem(this.ACTIVITY_REPORT_KEY);
    }

}
