import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  private readonly DOMAIN_PROGRESS_KEY = 'domain_progress';
  private readonly TIME_SPENT_KEY = 'time_spent';
  private readonly LAST_UPDATED_KEY = 'last_time_update';

  constructor() {}

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

  // ✅ Store time-spent values for Last 1 Day, 7 Days, 30 Days
  setTimeSpentLastNDays(days: number, value: number): void {
    const timeSpentData = this.getAllTimeSpent();
    timeSpentData[days] = value;
    localStorage.setItem(this.TIME_SPENT_KEY, JSON.stringify(timeSpentData));
  }

  // ✅ Retrieve stored time-spent values
  getTimeSpentLastNDays(days: number): number {
    const timeSpentData = this.getAllTimeSpent();
    return timeSpentData[days] || 0;
  }

  // ✅ Get all stored time-spent data
  private getAllTimeSpent(): Record<number, number> {
    return JSON.parse(localStorage.getItem(this.TIME_SPENT_KEY) || '{}');
  }

  // ✅ Check if today's data is already stored
  isTimeDataForTodayAvailable(): boolean {
    const lastUpdated = localStorage.getItem(this.LAST_UPDATED_KEY);
    const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    return lastUpdated === today;
  }

  // ✅ Mark today as the last updated date
  setTimeDataForToday(): void {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(this.LAST_UPDATED_KEY, today);
  }

  // ✅ Clear outdated data if needed (e.g., after logout)
  clearLocalStorage(): void {
    localStorage.removeItem(this.DOMAIN_PROGRESS_KEY);
    localStorage.removeItem(this.TIME_SPENT_KEY);
    localStorage.removeItem(this.LAST_UPDATED_KEY);
  }
}
