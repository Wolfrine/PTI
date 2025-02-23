import { Injectable } from '@angular/core';
import {
    Firestore,
    collection,
    doc,
    setDoc,
    getDocs,
    query,
    orderBy,
    startAfter,
    limit,
    Timestamp,
    where,
    addDoc,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ActivityService {
    private userId: string | null = null;

    constructor(
        private firestore: Firestore,
        private authService: AuthService
    ) {
        this.authService.getUser().subscribe((user) => {
            this.userId = user?.uid || null;
        });
    }

    // ✅ Add activity under the authenticated user's collection with consistent timestamps
    async addActivity(activityData: any) {
        if (!this.userId) throw new Error('User not authenticated');

        const activitiesCollection = collection(this.firestore, `users/${this.userId}/activities`);
        const newActivityRef = doc(activitiesCollection);
        activityData.createdAt = Timestamp.now();

        // Convert dates if needed
        activityData.startTime = this.ensureTimestamp(activityData.startTime);
        activityData.endTime = this.ensureTimestamp(activityData.endTime);
        activityData.date = this.ensureTimestamp(activityData.date);

        await setDoc(newActivityRef, activityData);
    }

    // ✅ Add a new category under the authenticated user
    async addCategory(categoryName: string): Promise<void> {
        if (!this.userId) throw new Error('User not authenticated');

        const categoriesCollection = collection(this.firestore, `users/${this.userId}/activity-categories`);
        const newCategoryRef = doc(categoriesCollection);
        await setDoc(newCategoryRef, {
            name: categoryName,
            createdAt: Timestamp.now(),
        });
    }

    // ✅ Fetch existing categories
    async fetchCategories(): Promise<any[]> {
        if (!this.userId) throw new Error('User not authenticated');

        const categoriesCollection = collection(this.firestore, `users/${this.userId}/activity-categories`);
        const categoriesSnapshot = await getDocs(categoriesCollection);

        return categoriesSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
    }

    // ✅ Fetch activities dynamically
    async fetchActivities(lastVisibleDoc?: any, count: number = 10) {
        if (!this.userId) throw new Error('User not authenticated');

        const activitiesCollection = collection(this.firestore, `users/${this.userId}/activities`);
        let activitiesQuery;

        if (lastVisibleDoc) {
            activitiesQuery = query(
                activitiesCollection,
                orderBy('createdAt', 'desc'),
                startAfter(lastVisibleDoc),
                limit(count)
            );
        } else {
            activitiesQuery = query(
                activitiesCollection,
                orderBy('createdAt', 'desc'),
                limit(count)
            );
        }

        const snapshot = await getDocs(activitiesQuery);
        const activities = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        return {
            activities,
            lastVisible: snapshot.docs[snapshot.docs.length - 1],
        };
    }

    // ✅ Convert Firestore Timestamps to JavaScript Date
    private convertToDate(dateValue: any): Date {
        if (!dateValue) return new Date(0); // Default to Epoch if invalid

        if (dateValue instanceof Timestamp) {
            return dateValue.toDate(); // Firestore Timestamp object
        }

        if (typeof dateValue === 'string') {
            return new Date(dateValue); // ISO string
        }

        return dateValue instanceof Date ? dateValue : new Date(0); // Fallback for Date object
    }

    // ✅ Convert input to Firestore Timestamp
    private ensureTimestamp(value: any): Timestamp {
        if (value instanceof Timestamp) {
            return value;
        }
        const date = this.convertToDate(value);
        return Timestamp.fromDate(date);
    }

    // ✅ Calculate duration dynamically (in hours)
    private calculateDuration(startTime: any, endTime: any): number {
        const start = this.convertToDate(startTime).getTime();
        const end = this.convertToDate(endTime).getTime();

        if (!start || !end || start >= end) return 0;

        const durationInMinutes = Math.floor((end - start) / 60000);
        return parseFloat((durationInMinutes / 60).toFixed(2));
    }

    // ✅ Generate a dynamic 30-day report (calculating duration on fetch)
    async fetch30DayReport() {
        if (!this.userId) throw new Error('User not authenticated');

        const activitiesCollection = collection(this.firestore, `users/${this.userId}/activities`);
        const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

        const reportQuery = query(
            activitiesCollection,
            where('date', '>=', thirtyDaysAgo)
        );

        const snapshot = await getDocs(reportQuery);
        const categoryTimeMap: { [categoryId: string]: number } = {};

        snapshot.docs.forEach((doc) => {
            const activity = doc.data();
            const categoryId = activity['categoryId'];

            // 🔥 Use robust date conversion for duration calculation
            const duration = this.calculateDuration(
                this.convertToDate(activity['startTime']),
                this.convertToDate(activity['endTime'])
            );

            if (!categoryTimeMap[categoryId]) {
                categoryTimeMap[categoryId] = 0;
            }
            categoryTimeMap[categoryId] += duration;
        });

        return categoryTimeMap;
    }

    // ✅ Log completed tasks as activities with proper timestamp formatting
    async logTaskAsActivity(task: any, domainName: string): Promise<void> {
        const userId = this.userId;
        if (!userId) throw new Error('User not authenticated');

        const endTime = new Date(); // Task completion time
        const startTime = new Date(endTime.getTime() - task.estimatedTime * 60 * 60 * 1000); // Calculate start time

        const activity = {
            name: task.name || 'Completed Task',
            categoryId: domainName, // ✅ Domain Name as Category
            startTime: Timestamp.fromDate(startTime), // ✅ Firestore Timestamp
            endTime: Timestamp.fromDate(endTime),     // ✅ Firestore Timestamp
            notes: `Completed from target "${domainName}"`,
            date: Timestamp.fromDate(endTime),
            createdAt: Timestamp.fromDate(new Date()),
        };

        const activityRef = collection(this.firestore, `users/${userId}/activities`);
        await addDoc(activityRef, activity);
    }
}
